import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { classifyGraphResponse, sanitizeError } from "@/server/whatsapp/outcome";
import { sendTemplateMessage } from "@/server/whatsapp/graph";
import { isOptOutText, nextStateForStatus, parseWebhook, safeEqual, verifySignature } from "@/server/whatsapp/webhook";

const SECRET = "test-app-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

describe("webhook signature", () => {
  const body = JSON.stringify({ entry: [] });
  it("accepts a correct signature and rejects everything else", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
    expect(verifySignature(body + " ", sign(body), SECRET)).toBe(false); // tampered body
    expect(verifySignature(body, sign(body), "other-secret")).toBe(false);
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, "sha256=", SECRET)).toBe(false);
    expect(verifySignature(body, "md5=abc", SECRET)).toBe(false);
    expect(verifySignature(body, sign(body), undefined)).toBe(false); // secret not configured → fail closed
    expect(verifySignature(body, "sha256=deadbeef", SECRET)).toBe(false);
  });

  it("compares shared secrets in constant time and fails closed on empties", () => {
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "b")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
    expect(safeEqual(null, "x")).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("keeps only status fields and opt-out candidates, dropping personal data", () => {
    const parsed = parseWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Secret Name" }, wa_id: "919876543210" }],
                statuses: [
                  { id: "wamid.1", status: "delivered", timestamp: "1700000000", recipient_id: "919876543210" },
                  { id: "wamid.2", status: "failed", timestamp: "1700000001", errors: [{ code: 131026, title: "Message undeliverable to +91 98765 43210" }] },
                  { id: "wamid.3", status: "weird", timestamp: "1" },
                ],
                messages: [
                  { from: "919876543210", type: "text", text: { body: "STOP" } },
                  { from: "919876543210", type: "image" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(parsed.statuses).toEqual([
      { messageId: "wamid.1", status: "delivered", timestamp: 1700000000, errorCode: null, errorTitle: null },
      { messageId: "wamid.2", status: "failed", timestamp: 1700000001, errorCode: 131026, errorTitle: "Message undeliverable to [number]" },
    ]);
    expect(parsed.inbound).toEqual([{ from: "919876543210", text: "STOP" }]);
    expect(JSON.stringify(parsed)).not.toContain("Secret Name");
  });

  it("tolerates malformed payloads", () => {
    expect(parseWebhook(null)).toEqual({ statuses: [], inbound: [] });
    expect(parseWebhook({ entry: [{ changes: [{}] }] })).toEqual({ statuses: [], inbound: [] });
  });
});

describe("opt-out text", () => {
  it("matches whole-message opt-out phrases only", () => {
    for (const t of ["STOP", " stop ", "Unsubscribe", "opt out", "Stop."]) expect(isOptOutText(t)).toBe(true);
    for (const t of ["please don't stop", "stopped", "ok thanks", "", "start"]) expect(isOptOutText(t)).toBe(false);
  });
});

describe("delivery state machine", () => {
  it("only moves forward and never overwrites delivered/read with failed", () => {
    expect(nextStateForStatus("submitted", "sent")).toBe("submitted");
    expect(nextStateForStatus("submitted", "delivered")).toBe("delivered");
    expect(nextStateForStatus("delivered", "read")).toBe("read");
    expect(nextStateForStatus("submitted", "read")).toBe("read");
    expect(nextStateForStatus("read", "delivered")).toBe("read"); // out of order
    expect(nextStateForStatus("delivered", "delivered")).toBe("delivered");
    expect(nextStateForStatus("delivered", "failed")).toBe("delivered");
    expect(nextStateForStatus("submitted", "failed")).toBe("failed");
    expect(nextStateForStatus("failed", "delivered")).toBe("failed");
    expect(nextStateForStatus("skipped", "delivered")).toBe("skipped");
  });
});

describe("classifyGraphResponse", () => {
  it("treats API acceptance as 'accepted', not delivered", () => {
    expect(classifyGraphResponse(200, { messages: [{ id: "wamid.X" }] })).toEqual({ kind: "accepted", messageId: "wamid.X" });
  });
  it("is ambiguous when success carries no id or Meta errors server-side", () => {
    expect(classifyGraphResponse(200, {}).kind).toBe("ambiguous");
    expect(classifyGraphResponse(500, null).kind).toBe("ambiguous");
    expect(classifyGraphResponse(503, {}).kind).toBe("ambiguous");
  });
  it("separates transient rate limits from permanent rejections", () => {
    expect(classifyGraphResponse(429, { error: { code: 80007, message: "rate" } })).toMatchObject({ kind: "rejected", transient: true });
    expect(classifyGraphResponse(400, { error: { code: 130429, message: "Rate limit hit" } })).toMatchObject({ kind: "rejected", transient: true });
    expect(classifyGraphResponse(400, { error: { code: 132001, message: "Template does not exist" } })).toMatchObject({ kind: "rejected", transient: false });
    expect(classifyGraphResponse(401, { error: { code: 190, message: "Token expired" } })).toMatchObject({ kind: "rejected", transient: false });
  });
  it("sanitises numbers and tokens out of stored errors", () => {
    expect(sanitizeError("Recipient +91 98765 43210 not allowed")).toBe("Recipient [number] not allowed");
    expect(sanitizeError("bad Bearer EAAGabcdefghijklmnop token")).not.toContain("EAAG");
    expect(sanitizeError("x".repeat(500))).toHaveLength(200);
  });
});

describe("sendTemplateMessage", () => {
  const config = { accessToken: "tok", phoneNumberId: "123", businessAccountId: null, graphVersion: "v99.0", templateLanguage: "en" };

  it("posts the template with ordered body variables to the configured phone number", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 }));
    const out = await sendTemplateMessage({
      toE164: "+919876543210", templateName: "gym_fee_reminder", variables: ["Rohit", "1,000", "5 Mar 2026"], config, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toEqual({ kind: "accepted", messageId: "wamid.OK" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v99.0/123/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("919876543210");
    expect(body.template).toEqual({
      name: "gym_fee_reminder",
      language: { code: "en" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Rohit" }, { type: "text", text: "1,000" }, { type: "text", text: "5 Mar 2026" }] }],
    });
  });

  it("reports a dropped connection as ambiguous (never auto-retried)", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("socket hang up"); });
    const out = await sendTemplateMessage({ toE164: "+919876543210", templateName: "x", variables: [], config, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out.kind).toBe("ambiguous");
  });
});
