import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyWebhook = vi.fn(async () => ({ applied: 1, duplicate: 0, unmatched: 0, optOuts: 0 }));
const reconcileBilling = vi.fn(async () => ({ members: 2, created: 3, failures: 0 }));
const queueReminders = vi.fn(async () => ({ considered: 4, queued: 2 }));
const processDueJobs = vi.fn(async () => ({ processed: 2, submitted: 2, skipped: 0, failed: 0, retryLater: 0, recoveredStale: 0 }));

const settings = { id: 1, gym_name: "Tiger Fitness", timezone: "Asia/Kolkata", reminders_enabled: true, updated_at: "" };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: settings, error: null }) }) }) }),
  }),
}));
vi.mock("@/server/webhook-events", () => ({ applyWebhook: (...a: unknown[]) => (applyWebhook as (...x: unknown[]) => unknown)(...a) }));
vi.mock("@/server/billing", () => ({ reconcileBilling: (...a: unknown[]) => (reconcileBilling as (...x: unknown[]) => unknown)(...a) }));
vi.mock("@/server/reminders", () => ({
  queueReminders: (...a: unknown[]) => (queueReminders as (...x: unknown[]) => unknown)(...a),
  processDueJobs: (...a: unknown[]) => (processDueJobs as (...x: unknown[]) => unknown)(...a),
}));

const SECRET = "app-secret-for-tests";
const body = JSON.stringify({
  entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1700000000" }] } }] }],
});
const sig = (b: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(b).digest("hex")}`;

beforeEach(() => {
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
  vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "verify-me");
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("WhatsApp webhook route", () => {
  it("answers Meta's verification handshake only with the right token", async () => {
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const ok = await GET(new NextRequest("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    const bad = await GET(new NextRequest("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345"));
    expect(bad.status).toBe(403);
    vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "");
    const unset = await GET(new NextRequest("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=1"));
    expect(unset.status).toBe(403);
  });

  it("rejects unsigned, mis-signed and tampered callbacks without touching the database", async () => {
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const post = (b: string, signature?: string) =>
      POST(new NextRequest("http://x/api/whatsapp/webhook", { method: "POST", body: b, headers: signature ? { "x-hub-signature-256": signature } : {} }));
    expect((await post(body)).status).toBe(401);
    expect((await post(body, sig(body, "wrong-secret"))).status).toBe(401);
    expect((await post(body + " ", sig(body))).status).toBe(401);
    expect(applyWebhook).not.toHaveBeenCalled();
  });

  it("applies correctly signed callbacks", async () => {
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const res = await POST(new NextRequest("http://x/api/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": sig(body) } }));
    expect(res.status).toBe(200);
    expect(applyWebhook).toHaveBeenCalledTimes(1);
    const parsed = (applyWebhook.mock.calls[0] as unknown as [unknown, { statuses: { messageId: string; status: string }[] }])[1];
    expect(parsed.statuses[0]).toMatchObject({ messageId: "wamid.1", status: "delivered" });
  });

  it("fails closed when the app secret is not configured", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const res = await POST(new NextRequest("http://x/api/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": sig(body, "") } }));
    expect(res.status).toBe(401);
  });
});

describe("daily cron route", () => {
  const call = async (headers: Record<string, string> = {}, method: "GET" | "POST" = "GET") => {
    const mod = await import("@/app/api/cron/daily/route");
    return mod[method](new NextRequest("http://x/api/cron/daily", { method, headers }));
  };

  it("is closed when CRON_SECRET is unset, and rejects missing/wrong secrets", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call({ authorization: "Bearer anything" })).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer wrong" })).status).toBe(401);
    expect((await call({ authorization: "cron-secret" })).status).toBe(401);
    expect(reconcileBilling).not.toHaveBeenCalled();
  });

  it("runs billing, queueing and sending with the right secret (Vercel sends GET)", async () => {
    const res = await call({ authorization: "Bearer cron-secret" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, remindersEnabled: true, queue: { queued: 2 } });
    expect(reconcileBilling).toHaveBeenCalledTimes(1);
    expect(queueReminders).toHaveBeenCalledTimes(1);
    expect(processDueJobs).toHaveBeenCalledTimes(1);
  });

  it("still reconciles billing but queues nothing while automation is off", async () => {
    settings.reminders_enabled = false;
    const res = await call({ authorization: "Bearer cron-secret" }, "POST");
    expect(res.status).toBe(200);
    expect(reconcileBilling).toHaveBeenCalledTimes(1);
    expect(queueReminders).not.toHaveBeenCalled();
    settings.reminders_enabled = true;
  });
});
