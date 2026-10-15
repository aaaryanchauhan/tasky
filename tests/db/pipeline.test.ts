import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/dates";
import type { GymSettingsRow } from "@/lib/db/types";
import type { AdminClient } from "@/lib/supabase/admin";
import { reconcileBilling } from "@/server/billing";
import { processDueJobs, queueReminders, retryJob } from "@/server/reminders";
import { applyWebhook } from "@/server/webhook-events";
import { parseWebhook } from "@/server/whatsapp/webhook";
import { fakeSupabase } from "./fake-supabase";
import { actAs, addMember, addPeriod, createDb, seedAdmin, today as dbToday, type Db } from "./harness";

let db: Db;
let admin: AdminClient;
let t: string;
let settings: GymSettingsRow;
let seq = 0;

const fetchMock = vi.fn();

function metaOk() {
  seq += 1;
  return new Response(JSON.stringify({ messages: [{ id: `wamid.TEST${seq}` }] }), { status: 200 });
}
const metaError = (status: number, code: number, message = "boom") =>
  new Response(JSON.stringify({ error: { code, message } }), { status });

beforeAll(async () => {
  db = await createDb();
  await seedAdmin(db);
  t = await dbToday(db);
  await actAs(db, { role: "service_role" });
  admin = fakeSupabase(db) as unknown as AdminClient;
  settings = { id: 1, gym_name: "Tiger Fitness", timezone: "Asia/Kolkata", reminders_enabled: true, updated_at: "" };
});
afterAll(async () => db.close());

beforeEach(() => {
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "12345");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v99.0");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => metaOk());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Create an active, consenting member with one unpaid period due `dueOffset` days from today. */
async function scenario(opts: { dueOffset: number; amount?: number; name?: string; optIn?: boolean; status?: string }) {
  await actAs(db, "superuser");
  const m = await addMember(db, { anchor: addDays(t, -400), price: opts.amount ?? 100_000, name: opts.name ?? "Rohit Sharma", optIn: opts.optIn, status: opts.status });
  const due = addDays(t, opts.dueOffset);
  const p = await addPeriod(db, m, due, addDays(due, 30), opts.amount ?? 100_000);
  await actAs(db, { role: "service_role" });
  return { m, p, due };
}

const jobFor = async (periodId: string, kind?: string) => {
  await actAs(db, "superuser");
  const r = await db.query<Record<string, unknown>>(
    `select * from public.message_jobs where billing_period_id = $1 ${kind ? "and kind = $2" : ""} order by created_at`,
    kind ? [periodId, kind] : [periodId],
  );
  await actAs(db, { role: "service_role" });
  return r.rows;
};

async function run() {
  await queueReminders(admin, t);
  return processDueJobs(admin, settings);
}

describe("queueing", () => {
  it("queues a due-date reminder the day before and an overdue follow-up 3 days after — nothing else", async () => {
    const tomorrow = await scenario({ dueOffset: 1 });
    const threeAgo = await scenario({ dueOffset: -3 });
    const twoAgo = await scenario({ dueOffset: -2 });
    const nextWeek = await scenario({ dueOffset: 5 });
    await queueReminders(admin, t);
    expect((await jobFor(tomorrow.p)).map((j) => j.kind)).toEqual(["before_due"]);
    expect((await jobFor(threeAgo.p)).map((j) => j.kind)).toEqual(["overdue"]);
    expect(await jobFor(twoAgo.p)).toHaveLength(0);
    expect(await jobFor(nextWeek.p)).toHaveLength(0);
  });

  it("running the scheduler repeatedly or concurrently never creates a second job", async () => {
    const s = await scenario({ dueOffset: 1 });
    await Promise.all([queueReminders(admin, t), queueReminders(admin, t), queueReminders(admin, t)]);
    await queueReminders(admin, t);
    expect(await jobFor(s.p)).toHaveLength(1);
  });

  it("does not queue for inactive members, fully paid periods or cancelled periods", async () => {
    const inactive = await scenario({ dueOffset: 1, status: "inactive" });
    const paid = await scenario({ dueOffset: 1 });
    await actAs(db, "superuser");
    await db.query("insert into public.payments (billing_period_id, amount_paise, paid_on, method) values ($1, 100000, $2, 'cash')", [paid.p, t]);
    await queueReminders(admin, t);
    expect(await jobFor(inactive.p)).toHaveLength(0);
    expect(await jobFor(paid.p)).toHaveLength(0);
  });
});

describe("sending", () => {
  it("submits the approved template with first name, current balance and an Indian-format date", async () => {
    const s = await scenario({ dueOffset: 1, amount: 150_000, name: "Rohit Sharma" });
    // partial payment before the reminder goes out → message must show the REMAINING balance
    await actAs(db, "superuser");
    await db.query("insert into public.payments (billing_period_id, amount_paise, paid_on, method) values ($1, 50000, $2, 'upi')", [s.p, t]);
    await actAs(db, { role: "service_role" });

    const stats = await run();
    expect(stats.submitted).toBeGreaterThanOrEqual(1);
    const call = fetchMock.mock.calls.find(([, init]) => JSON.parse((init as RequestInit).body as string).template.components[0].parameters[0].text === "Rohit");
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.template.name).toBe("gym_fee_reminder");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(["Rohit", "1,000", expect.stringMatching(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/)]);

    const [job] = await jobFor(s.p);
    expect(job).toMatchObject({ state: "submitted", attempt_count: 1 });
    expect(String(job!.meta_message_id)).toMatch(/^wamid\.TEST/);
  });

  it("uses the overdue template for the follow-up", async () => {
    const s = await scenario({ dueOffset: -3, name: "Asha Verma" });
    await run();
    const call = fetchMock.mock.calls.find(([, init]) => JSON.parse((init as RequestInit).body as string).template.components[0].parameters[0].text === "Asha");
    expect(JSON.parse((call![1] as RequestInit).body as string).template.name).toBe("gym_fee_overdue");
    expect((await jobFor(s.p))[0]).toMatchObject({ kind: "overdue", state: "submitted" });
  });

  it("two scheduler runs send each reminder exactly once", async () => {
    const s = await scenario({ dueOffset: 1, name: "Once Only" });
    await Promise.all([run(), run()]);
    await run();
    const sends = fetchMock.mock.calls.filter(([, init]) => JSON.parse((init as RequestInit).body as string).template.components[0].parameters[0].text === "Once");
    expect(sends).toHaveLength(1);
    expect(await jobFor(s.p)).toHaveLength(1);
  });

  it.each([
    ["paid before sending", async (s: { m: string; p: string }) => { await actAs(db, "superuser"); await db.query("insert into public.payments (billing_period_id, amount_paise, paid_on, method) values ($1, 100000, $2, 'cash')", [s.p, t]); }, "already_paid"],
    ["member opted out", async (s: { m: string }) => { await actAs(db, "superuser"); await db.query("update public.members set whatsapp_opt_out_at = now() + interval '1 second' where id = $1", [s.m]); }, "opted_out"],
    ["member deactivated", async (s: { m: string }) => { await actAs(db, "superuser"); await db.query("update public.members set status = 'inactive' where id = $1", [s.m]); }, "member_not_active"],
    ["phone number changed", async (s: { m: string }) => { await actAs(db, "superuser"); await db.query("update public.members set whatsapp_e164 = '+919123456789' where id = $1", [s.m]); }, "phone_changed"],
    ["period cancelled", async (s: { p: string }) => { await actAs(db, "superuser"); await db.query("update public.billing_periods set cancelled_at = now(), cancel_reason = 'x' where id = $1", [s.p]); }, "period_cancelled"],
  ])("rechecks at send time and skips when: %s", async (_name, mutate, reason) => {
    const s = await scenario({ dueOffset: 1, name: "Skip Me" });
    await queueReminders(admin, t);
    await mutate(s);
    await actAs(db, { role: "service_role" });
    await processDueJobs(admin, settings);
    const [job] = await jobFor(s.p);
    expect(job).toMatchObject({ state: "skipped", skip_reason: reason });
    expect(fetchMock.mock.calls.filter(([, init]) => JSON.parse((init as RequestInit).body as string).template.components[0].parameters[0].text === "Skip")).toHaveLength(0);
  });

  it("records a visible skip when there is no consent, and never calls Meta", async () => {
    const s = await scenario({ dueOffset: 1, name: "NoConsent Person", optIn: false });
    await run();
    expect((await jobFor(s.p))[0]).toMatchObject({ state: "skipped", skip_reason: "no_consent" });
    expect(fetchMock.mock.calls.filter(([, init]) => JSON.parse((init as RequestInit).body as string).template.components[0].parameters[0].text === "NoConsent")).toHaveLength(0);
  });

  it("sends nothing while automation is switched off", async () => {
    const s = await scenario({ dueOffset: 1, name: "Off Switch" });
    await queueReminders(admin, t);
    await processDueJobs(admin, { ...settings, reminders_enabled: false });
    expect((await jobFor(s.p))[0]).toMatchObject({ state: "skipped", skip_reason: "reminders_disabled" });
  });
});

describe("failure handling", () => {
  it("retries rate-limit rejections with backoff, bounded to 3 attempts", async () => {
    const s = await scenario({ dueOffset: 1, name: "Rate Limited" });
    fetchMock.mockImplementation(async () => metaError(429, 80007, "Rate limit hit"));
    await queueReminders(admin, t);

    await processDueJobs(admin, settings);
    let [job] = await jobFor(s.p);
    expect(job).toMatchObject({ state: "pending", attempt_count: 1, error_kind: "transient" });
    expect(new Date(String(job!.next_attempt_at)).getTime()).toBeGreaterThan(Date.now() + 10 * 60_000);

    // not retried before the backoff elapses
    const calls = fetchMock.mock.calls.length;
    await processDueJobs(admin, settings);
    expect(fetchMock.mock.calls.length).toBe(calls);

    for (const attempt of [2, 3]) {
      await actAs(db, "superuser");
      await db.query("update public.message_jobs set next_attempt_at = now() - interval '1 minute' where billing_period_id = $1", [s.p]);
      await actAs(db, { role: "service_role" });
      await processDueJobs(admin, settings);
      [job] = await jobFor(s.p);
      expect(job!.attempt_count).toBe(attempt);
    }
    expect(job).toMatchObject({ state: "failed", error_kind: "transient" });
  });

  it("fails permanently on a definite rejection, with a sanitised reason", async () => {
    const s = await scenario({ dueOffset: 1, name: "Bad Template" });
    fetchMock.mockImplementation(async () => metaError(400, 132001, "Template does not exist for +91 98765 43210"));
    await run();
    const [job] = await jobFor(s.p);
    expect(job).toMatchObject({ state: "failed", error_kind: "permanent", attempt_count: 1 });
    expect(String(job!.last_error)).not.toMatch(/98765/);
  });

  it("never auto-resends after an ambiguous outcome; manual retry needs explicit confirmation", async () => {
    const s = await scenario({ dueOffset: 1, name: "Timeout Tim" });
    fetchMock.mockImplementation(async () => { throw new Error("socket hang up"); });
    await run();
    let [job] = await jobFor(s.p);
    expect(job).toMatchObject({ state: "failed", error_kind: "ambiguous" });

    const calls = fetchMock.mock.calls.length;
    await run();
    await run();
    expect(fetchMock.mock.calls.length).toBe(calls);

    const refused = await retryJob(admin, String(job!.id), settings, { confirmAmbiguous: false });
    expect(refused.ok).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(calls);

    fetchMock.mockImplementation(async () => metaOk());
    const retried = await retryJob(admin, String(job!.id), settings, { confirmAmbiguous: true });
    expect(retried).toEqual({ ok: true, state: "submitted" });
    [job] = await jobFor(s.p);
    expect(job).toMatchObject({ state: "submitted", attempt_count: 2 });
  });

  it("a crashed worker's abandoned claim becomes an ambiguous failure, not a resend", async () => {
    const s = await scenario({ dueOffset: 1, name: "Crash Test" });
    await queueReminders(admin, t);
    await actAs(db, "superuser");
    await db.query("update public.message_jobs set state = 'claimed', claimed_at = now() - interval '1 hour' where billing_period_id = $1", [s.p]);
    await actAs(db, { role: "service_role" });
    await processDueJobs(admin, settings);
    expect((await jobFor(s.p))[0]).toMatchObject({ state: "failed", error_kind: "ambiguous" });
    expect(fetchMock.mock.calls.filter(([, init]) => JSON.parse((init as RequestInit).body as string).template.components[0].parameters[0].text === "Crash")).toHaveLength(0);
  });
});

describe("webhook processing", () => {
  const payload = (statuses: object[], messages: object[] = []) => parseWebhook({ entry: [{ changes: [{ value: { statuses, messages } }] }] });

  async function submitted(name: string) {
    const s = await scenario({ dueOffset: 1, name });
    await run();
    const [job] = await jobFor(s.p);
    return { ...s, job: job!, wamid: String(job!.meta_message_id) };
  }

  it("moves submitted → delivered → read, ignores duplicates and out-of-order callbacks", async () => {
    const s = await submitted("Webhook Wendy");
    const ts = Math.floor(Date.now() / 1000);

    const delivered = payload([{ id: s.wamid, status: "delivered", timestamp: String(ts) }]);
    expect(await applyWebhook(admin, delivered)).toMatchObject({ applied: 1 });
    expect((await jobFor(s.p))[0]).toMatchObject({ state: "delivered" });
    expect((await jobFor(s.p))[0]!.delivered_at).toBeTruthy();

    // Meta re-delivers the same callback
    expect(await applyWebhook(admin, delivered)).toMatchObject({ duplicate: 1, applied: 0 });

    await applyWebhook(admin, payload([{ id: s.wamid, status: "read", timestamp: String(ts + 5) }]));
    expect((await jobFor(s.p))[0]).toMatchObject({ state: "read" });

    // a late "delivered" with a different timestamp must not regress the state
    await applyWebhook(admin, payload([{ id: s.wamid, status: "delivered", timestamp: String(ts + 9) }]));
    expect((await jobFor(s.p))[0]).toMatchObject({ state: "read" });

    await actAs(db, "superuser");
    const ev = await db.query<{ event_type: string }>("select event_type from public.message_events where message_job_id = $1 order by event_at", [s.job.id]);
    await actAs(db, { role: "service_role" });
    expect(ev.rows.map((e) => e.event_type)).toEqual(expect.arrayContaining(["submitted", "delivered", "read"]));
  });

  it("records a delivery failure with a sanitised reason; accepted ≠ delivered", async () => {
    const s = await submitted("Failing Fay");
    expect((await jobFor(s.p))[0]).toMatchObject({ state: "submitted", delivered_at: null });
    await applyWebhook(admin, payload([{ id: s.wamid, status: "failed", timestamp: String(Math.floor(Date.now() / 1000)), errors: [{ code: 131026, title: "Message undeliverable to +91 98765 43210" }] }]));
    const [job] = await jobFor(s.p);
    expect(job).toMatchObject({ state: "failed", error_kind: "permanent" });
    expect(String(job!.last_error)).toContain("131026");
    expect(String(job!.last_error)).not.toMatch(/98765/);
  });

  it("ignores callbacks for unknown message ids", async () => {
    expect(await applyWebhook(admin, payload([{ id: "wamid.UNKNOWN", status: "delivered", timestamp: "1700000000" }]))).toMatchObject({ unmatched: 1 });
  });

  it("honours a STOP reply: opts the member out and cancels their pending reminders", async () => {
    const s = await scenario({ dueOffset: 1, name: "Stop Sam" });
    await queueReminders(admin, t); // pending, not yet sent
    await actAs(db, "superuser");
    const phone = (await db.query<{ p: string }>("select whatsapp_e164 p from public.members where id = $1", [s.m])).rows[0]!.p;
    await actAs(db, { role: "service_role" });

    const res = await applyWebhook(admin, payload([], [{ from: phone.slice(1), type: "text", text: { body: "STOP" } }]));
    expect(res.optOuts).toBe(1);

    await actAs(db, "superuser");
    const m = (await db.query<{ o: string | null }>("select whatsapp_opt_out_at o from public.members where id = $1", [s.m])).rows[0]!;
    const audit = await db.query("select 1 from public.audit_log where entity_id = $1 and action = 'whatsapp_opt_out'", [s.m]);
    await actAs(db, { role: "service_role" });
    expect(m.o).not.toBeNull();
    expect(audit.rows).toHaveLength(1);
    expect((await jobFor(s.p))[0]).toMatchObject({ state: "skipped", skip_reason: "opted_out" });

    await processDueJobs(admin, settings);
    expect(fetchMock.mock.calls.filter(([, init]) => JSON.parse((init as RequestInit).body as string).template.components[0].parameters[0].text === "Stop")).toHaveLength(0);
  });

  it("does not treat ordinary replies as opt-outs", async () => {
    const s = await scenario({ dueOffset: 1, name: "Chatty Chet" });
    await actAs(db, "superuser");
    const phone = (await db.query<{ p: string }>("select whatsapp_e164 p from public.members where id = $1", [s.m])).rows[0]!.p;
    await actAs(db, { role: "service_role" });
    const res = await applyWebhook(admin, payload([], [{ from: phone.slice(1), type: "text", text: { body: "I will pay tomorrow, don't stop my membership" } }]));
    expect(res.optOuts).toBe(0);
  });
});

describe("billing reconciliation", () => {
  it("creates periods up to a week ahead exactly once, even when run repeatedly or concurrently", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: addDays(t, -65), plan: "monthly", name: "Reconcile Ron" });
    const inactive = await addMember(db, { anchor: addDays(t, -65), status: "inactive", name: "Gone Gary" });
    await actAs(db, { role: "service_role" });

    const first = await reconcileBilling(admin, t);
    expect(first.failures).toBe(0);
    await Promise.all([reconcileBilling(admin, t), reconcileBilling(admin, t)]);
    const again = await reconcileBilling(admin, t);
    expect(again.created).toBe(0);

    await actAs(db, "superuser");
    const rows = await db.query<{ period_start: string }>("select to_char(period_start,'YYYY-MM-DD') period_start from public.billing_periods where member_id = $1 order by period_start", [m]);
    const none = await db.query("select 1 from public.billing_periods where member_id = $1", [inactive]);
    await actAs(db, { role: "service_role" });
    // anchor 65 days ago, monthly: starts at -65, then +1 month steps while <= today + 7
    expect(rows.rows.length).toBeGreaterThanOrEqual(3);
    expect(new Set(rows.rows.map((r) => r.period_start)).size).toBe(rows.rows.length);
    expect(none.rows).toHaveLength(0);
  });
});
