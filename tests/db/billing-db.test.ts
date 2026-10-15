import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { actAs, addMember, addPeriod, createDb, periodJson, seedAdmin, today, type Db } from "./harness";

let db: Db;
let admin: string;
let t: string;

beforeAll(async () => {
  db = await createDb();
  admin = await seedAdmin(db);
  t = await today(db);
});
afterAll(async () => db.close());

async function asAdmin() {
  await actAs(db, { sub: admin, role: "authenticated" });
}

async function fails(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected statement to fail");
}

describe("schema constraints", () => {
  it("seeds exactly the three plans and a disabled automation switch", async () => {
    await actAs(db, "superuser");
    const plans = await db.query<{ code: string; duration_months: number }>(
      "select code, duration_months from public.membership_plans order by duration_months",
    );
    expect(plans.rows).toEqual([
      { code: "monthly", duration_months: 1 },
      { code: "quarterly", duration_months: 3 },
      { code: "annual", duration_months: 12 },
    ]);
    const s = await db.query<{ reminders_enabled: boolean }>("select reminders_enabled from public.gym_settings");
    expect(s.rows[0]!.reminders_enabled).toBe(false);
  });

  it("rejects invalid phones, non-positive prices and bad enums", async () => {
    await actAs(db, "superuser");
    const plan = (await db.query<{ id: string }>("select id from public.membership_plans limit 1")).rows[0]!.id;
    const ins = (phone: string, price: number, status = "active") =>
      fails(
        `insert into public.members (full_name, whatsapp_e164, joined_on, status, plan_id, agreed_price_paise, first_due_on, billing_anchor_on)
         values ('x', $1, '2026-01-01', $3, $4, $2, '2026-01-01', '2026-01-01')`,
        [phone, price, status, plan],
      );
    expect(await ins("12345", 100)).toMatch(/violates check constraint/);
    expect(await ins("+919876543210", 0)).toMatch(/violates check constraint/);
    expect(await ins("+919876543210", 100, "deleted")).toMatch(/violates check constraint/);
  });

  it("requires a consent source whenever an opt-in is recorded", async () => {
    await actAs(db, "superuser");
    const id = await addMember(db, { anchor: t, optIn: false });
    expect(await fails("update public.members set whatsapp_opt_in_at = now() where id = $1", [id])).toMatch(/opt_in_has_source/);
  });
});

describe("billing periods", () => {
  it("ensure_billing_periods creates each member-period at most once", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t });
    await asAdmin();
    const periods = [periodJson(t, addDays(t, 30)), periodJson(addDays(t, 30), addDays(t, 60))];
    const first = await db.query<{ n: number }>("select public.ensure_billing_periods($1, $2::jsonb) as n", [m, JSON.stringify(periods)]);
    const second = await db.query<{ n: number }>("select public.ensure_billing_periods($1, $2::jsonb) as n", [m, JSON.stringify(periods)]);
    expect(first.rows[0]!.n).toBe(2);
    expect(second.rows[0]!.n).toBe(0);
    // simulated concurrent cron runs
    await Promise.all(
      [1, 2, 3].map(() => db.query("select public.ensure_billing_periods($1, $2::jsonb)", [m, JSON.stringify(periods)])),
    );
    await actAs(db, "superuser");
    const count = await db.query<{ c: number }>("select count(*)::int c from public.billing_periods where member_id = $1", [m]);
    expect(count.rows[0]!.c).toBe(2);
  });

  it("does not resurrect a period that was cancelled on purpose", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t });
    await asAdmin();
    const periods = [periodJson(t, addDays(t, 30))];
    await db.query("select public.ensure_billing_periods($1, $2::jsonb)", [m, JSON.stringify(periods)]);
    const id = (await db.query<{ id: string }>("select id from public.billing_periods where member_id = $1", [m])).rows[0]!.id;
    await db.query("select public.cancel_billing_period($1, 'waived by owner')", [id]);
    const again = await db.query<{ n: number }>("select public.ensure_billing_periods($1, $2::jsonb) as n", [m, JSON.stringify(periods)]);
    expect(again.rows[0]!.n).toBe(0);
  });

  it("never creates periods for inactive or archived members", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t, status: "inactive" });
    await asAdmin();
    const r = await db.query<{ n: number }>("select public.ensure_billing_periods($1, $2::jsonb) as n", [m, JSON.stringify([periodJson(t, addDays(t, 30))])]);
    expect(r.rows[0]!.n).toBe(0);
  });
});

describe("payments", () => {
  async function setup(amount = 100_000, dueOffset = 5) {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t, price: amount });
    const due = addDays(t, dueOffset);
    const p = await addPeriod(db, m, due, addDays(due, 30), amount);
    await asAdmin();
    return { m, p };
  }
  const pay = (p: string, amount: number, key: string | null = null) =>
    db.query<{ r: { payment_id: string; outstanding_paise: number; duplicate: boolean } }>(
      "select public.record_payment($1, $2, public.app_today(), 'upi', 'ref', null, $3) as r",
      [p, amount, key],
    );
  const summary = async (p: string) =>
    (await db.query<{ status: string; outstanding_paise: number; paid_paise: number; is_overdue: boolean }>(
      "select status, outstanding_paise, paid_paise, is_overdue from public.billing_period_summary where id = $1", [p],
    )).rows[0]!;

  it("partial payments leave the period 'partial' with the remaining balance", async () => {
    const { p } = await setup();
    const r = await pay(p, 40_000);
    expect(r.rows[0]!.r.outstanding_paise).toBe(60_000);
    expect(await summary(p)).toMatchObject({ status: "partial", outstanding_paise: 60_000, paid_paise: 40_000 });
    await pay(p, 60_000);
    expect(await summary(p)).toMatchObject({ status: "paid", outstanding_paise: 0 });
  });

  it("rejects over-payment and payments to a fully-paid period", async () => {
    const { p } = await setup();
    expect(await fails("select public.record_payment($1, 100001, public.app_today(), 'cash', null, null, null)", [p])).toMatch(/exceeds the outstanding/);
    await pay(p, 100_000);
    expect(await fails("select public.record_payment($1, 1, public.app_today(), 'cash', null, null, null)", [p])).toMatch(/exceeds the outstanding/);
  });

  it("a double-submitted form (same idempotency key) records one payment", async () => {
    const { p } = await setup();
    const a = await pay(p, 30_000, "key-1");
    const b = await pay(p, 30_000, "key-1");
    expect(a.rows[0]!.r.duplicate).toBe(false);
    expect(b.rows[0]!.r.duplicate).toBe(true);
    expect(b.rows[0]!.r.payment_id).toBe(a.rows[0]!.r.payment_id);
    expect((await summary(p)).paid_paise).toBe(30_000);
  });

  it("voiding keeps the row, restores the balance and writes an audit entry", async () => {
    const { p } = await setup();
    const a = await pay(p, 100_000);
    expect((await summary(p)).status).toBe("paid");
    await db.query("select public.void_payment($1, 'entered wrong amount')", [a.rows[0]!.r.payment_id]);
    expect(await summary(p)).toMatchObject({ status: "unpaid", outstanding_paise: 100_000 });
    await actAs(db, "superuser");
    const rows = await db.query<{ voided_at: string | null; void_reason: string }>("select voided_at, void_reason from public.payments where id = $1", [a.rows[0]!.r.payment_id]);
    expect(rows.rows[0]!.voided_at).not.toBeNull();
    const audit = await db.query<{ action: string }>("select action from public.audit_log where entity_id = $1 order by created_at", [a.rows[0]!.r.payment_id]);
    expect(audit.rows.map((x) => x.action)).toEqual(["recorded", "voided"]);
  });

  it("requires a reason to void, and payments can't be edited or deleted", async () => {
    const { p } = await setup();
    const a = await pay(p, 10_000);
    expect(await fails("select public.void_payment($1, '  ')", [a.rows[0]!.r.payment_id])).toMatch(/reason is required/);
    await actAs(db, "superuser");
    expect(await fails("update public.payments set amount_paise = 1 where id = $1", [a.rows[0]!.r.payment_id])).toMatch(/immutable/);
    expect(await fails("delete from public.payments where id = $1", [a.rows[0]!.r.payment_id])).toMatch(/cannot be deleted/);
  });

  it("derives overdue from due date + balance", async () => {
    const { p } = await setup(100_000, -3);
    expect(await summary(p)).toMatchObject({ is_overdue: true });
    await pay(p, 100_000);
    expect(await summary(p)).toMatchObject({ is_overdue: false, status: "paid" });
  });

  it("paying in full skips the period's pending reminders", async () => {
    const { m, p } = await setup(100_000, 1);
    await actAs(db, "superuser");
    await db.query("insert into public.message_jobs (billing_period_id, member_id, kind, scheduled_for, to_e164) select $1, $2, 'before_due', public.app_today(), whatsapp_e164 from public.members where id = $2", [p, m]);
    await asAdmin();
    await pay(p, 50_000);
    let job = (await db.query<{ state: string }>("select state from public.message_jobs where billing_period_id = $1", [p])).rows[0]!;
    expect(job.state).toBe("pending"); // partial payment: reminder still due, for the remaining balance
    await pay(p, 50_000);
    job = (await db.query<{ state: string; skip_reason: string }>("select state, skip_reason from public.message_jobs where billing_period_id = $1", [p])).rows[0]!;
    expect(job).toMatchObject({ state: "skipped", skip_reason: "already_paid" });
  });
});

describe("billing terms change & status", () => {
  it("cancels only previewed unpaid periods; refuses if a payment landed in between", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t });
    const future = await addPeriod(db, m, addDays(t, 30), addDays(t, 60));
    const plan = (await db.query<{ id: string }>("select id from public.membership_plans where code = 'quarterly'")).rows[0]!.id;
    await asAdmin();
    await db.query("select public.record_payment($1, 1000, public.app_today(), 'cash', null, null, null)", [future]);
    expect(
      await fails("select public.apply_billing_change($1, $2, 270000, $3, $4::uuid[], '[]'::jsonb, false)", [m, plan, addDays(t, 60), [future]]),
    ).toMatch(/changed since the preview/);
  });

  it("cancel + recreate keeps history and swaps in the new snapshot", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t });
    const old = await addPeriod(db, m, addDays(t, 3), addDays(t, 33));
    const plan = (await db.query<{ id: string }>("select id from public.membership_plans where code = 'quarterly'")).rows[0]!.id;
    await asAdmin();
    const newStart = addDays(t, 3);
    const r = await db.query<{ r: { cancelled: number; created: number } }>(
      "select public.apply_billing_change($1, $2, 270000, $3, $4::uuid[], $5::jsonb, false) as r",
      [m, plan, newStart, [old], JSON.stringify([periodJson(newStart, addDays(newStart, 90), 270_000, "quarterly", 3)])],
    );
    expect(r.rows[0]!.r).toEqual({ cancelled: 1, created: 1 });
    await actAs(db, "superuser");
    const rows = await db.query<{ cancelled: boolean; plan_code_snapshot: string; amount_due_paise: number }>(
      "select cancelled_at is not null as cancelled, plan_code_snapshot, amount_due_paise from public.billing_periods where member_id = $1 order by created_at", [m]);
    expect(rows.rows).toEqual([
      { cancelled: true, plan_code_snapshot: "monthly", amount_due_paise: 100_000 },
      { cancelled: false, plan_code_snapshot: "quarterly", amount_due_paise: 270_000 },
    ]);
  });

  it("deactivation cancels future unpaid periods, skips pending jobs, and blocks new periods", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t });
    const p = await addPeriod(db, m, addDays(t, 4), addDays(t, 34));
    await db.query("insert into public.message_jobs (billing_period_id, member_id, kind, scheduled_for, to_e164) select $1, $2, 'before_due', public.app_today(), whatsapp_e164 from public.members where id = $2", [p, m]);
    await asAdmin();
    await db.query("select public.set_member_status($1, 'inactive', public.app_today(), $2::uuid[])", [m, [p]]);
    await actAs(db, "superuser");
    expect((await db.query<{ state: string }>("select state from public.message_jobs where member_id = $1", [m])).rows[0]!.state).toBe("skipped");
    await asAdmin();
    const n = await db.query<{ n: number }>("select public.ensure_billing_periods($1, $2::jsonb) as n", [m, JSON.stringify([periodJson(addDays(t, 90), addDays(t, 120))])]);
    expect(n.rows[0]!.n).toBe(0);
  });
});

describe("message queue", () => {
  async function job() {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t });
    const p = await addPeriod(db, m, addDays(t, 1), addDays(t, 31));
    return { m, p };
  }
  const insertJob = (p: string, m: string, kind = "before_due") =>
    db.query(
      "insert into public.message_jobs (billing_period_id, member_id, kind, scheduled_for, to_e164) select $1, $2, $3, public.app_today(), whatsapp_e164 from public.members where id = $2",
      [p, m, kind],
    );

  it("a database constraint blocks a second reminder for the same period + type", async () => {
    const { m, p } = await job();
    await insertJob(p, m);
    expect(await fails("insert into public.message_jobs (billing_period_id, member_id, kind, scheduled_for, to_e164) values ($1, $2, 'before_due', public.app_today(), '+919000000000')", [p, m])).toMatch(/message_jobs_period_kind_uq/);
    await insertJob(p, m, "overdue"); // different template type is allowed
    const upsert = await db.query("insert into public.message_jobs (billing_period_id, member_id, kind, scheduled_for, to_e164) values ($1, $2, 'before_due', public.app_today(), '+919000000000') on conflict (billing_period_id, kind) do nothing returning id", [p, m]);
    expect(upsert.rows).toHaveLength(0);
  });

  it("claims each job exactly once", async () => {
    const { m, p } = await job();
    await insertJob(p, m);
    await actAs(db, { role: "service_role" });
    const a = await db.query("select * from public.claim_message_jobs(50) where billing_period_id = $1", [p]);
    const b = await db.query("select * from public.claim_message_jobs(50) where billing_period_id = $1", [p]);
    expect(a.rows).toHaveLength(1);
    expect(b.rows).toHaveLength(0);
    expect((a.rows[0] as { attempt_count: number; state: string })).toMatchObject({ attempt_count: 1, state: "claimed" });
  });

  it("does not claim jobs whose backoff time is in the future", async () => {
    const { m, p } = await job();
    await insertJob(p, m);
    await db.query("update public.message_jobs set next_attempt_at = now() + interval '1 hour' where billing_period_id = $1", [p]);
    await actAs(db, { role: "service_role" });
    const r = await db.query("select * from public.claim_message_jobs(50) where billing_period_id = $1", [p]);
    expect(r.rows).toHaveLength(0);
  });

  it("turns abandoned claims into ambiguous failures (never auto-resent)", async () => {
    const { m, p } = await job();
    await insertJob(p, m);
    await db.query("update public.message_jobs set state = 'claimed', claimed_at = now() - interval '1 hour' where billing_period_id = $1", [p]);
    await actAs(db, { role: "service_role" });
    await db.query("select public.recover_stale_claims()");
    const r = await db.query<{ state: string; error_kind: string }>("select state, error_kind from public.message_jobs where billing_period_id = $1", [p]);
    expect(r.rows[0]).toEqual({ state: "failed", error_kind: "ambiguous" });
    const again = await db.query("select * from public.claim_message_jobs(50) where billing_period_id = $1", [p]);
    expect(again.rows).toHaveLength(0);
  });

  it("dedupes re-delivered webhook events", async () => {
    const { m, p } = await job();
    await insertJob(p, m);
    const id = (await db.query<{ id: string }>("select id from public.message_jobs where billing_period_id = $1", [p])).rows[0]!.id;
    const ins = () => db.query("insert into public.message_events (message_job_id, event_type, event_at) values ($1, 'delivered', '2026-01-01T00:00:00Z') on conflict do nothing returning id", [id]);
    expect((await ins()).rows).toHaveLength(1);
    expect((await ins()).rows).toHaveLength(0);
  });
});

describe("authorization (RLS)", () => {
  it("non-admins and anonymous users see and change nothing", async () => {
    await actAs(db, "superuser");
    await addMember(db, { anchor: t });
    const stranger = (await db.query<{ id: string }>("insert into auth.users (email) values ('stranger@example.test') returning id")).rows[0]!.id;

    await actAs(db, { sub: stranger, role: "authenticated" });
    expect((await db.query("select * from public.members")).rows).toHaveLength(0);
    expect((await db.query("select * from public.billing_period_summary")).rows).toHaveLength(0);
    expect(await fails("select public.record_payment(gen_random_uuid(), 100, public.app_today(), 'cash', null, null, null)")).toMatch(/Not authorized/);
    expect(await fails("select public.set_member_status(gen_random_uuid(), 'inactive', public.app_today(), '{}')")).toMatch(/Not authorized/);
    const upd = await db.query("update public.membership_plans set list_price_paise = 1 returning id");
    expect(upd.rows).toHaveLength(0);

    await actAs(db, { role: "anon" });
    expect(await fails("select * from public.members")).toMatch(/permission denied/);
    expect(await fails("select public.record_payment(gen_random_uuid(), 100, public.app_today(), 'cash', null, null, null)")).toMatch(/permission denied/);

    // job queue functions are service-role only
    await actAs(db, { sub: stranger, role: "authenticated" });
    expect(await fails("select * from public.claim_message_jobs(5)")).toMatch(/permission denied/);
    expect(await fails("select public.write_audit('x', null, 'forged', null, null)")).toMatch(/permission denied/);
  });

  it("admins can read members and edit plan prices, and cannot write payments directly", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t });
    const realPeriod = await addPeriod(db, m, addDays(t, 2), addDays(t, 32));
    await asAdmin();
    expect((await db.query("select * from public.members")).rows.length).toBeGreaterThan(0);
    const upd = await db.query("update public.membership_plans set list_price_paise = 110000 where code = 'monthly' returning list_price_paise");
    expect(upd.rows).toHaveLength(1);
    expect(await fails("insert into public.payments (billing_period_id, amount_paise, paid_on, method) values ($1, 1, now(), 'cash')", [realPeriod])).toMatch(/row-level security/);
  });

  it("plan price edits don't touch existing members or generated periods", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t, price: 90_000 });
    const p = await addPeriod(db, m, addDays(t, 2), addDays(t, 32), 90_000);
    await asAdmin();
    await db.query("update public.membership_plans set list_price_paise = 123456 where code = 'monthly'");
    await actAs(db, "superuser");
    expect((await db.query<{ a: number }>("select agreed_price_paise a from public.members where id = $1", [m])).rows[0]!.a).toBe(90_000);
    expect((await db.query<{ a: number }>("select amount_due_paise a from public.billing_periods where id = $1", [p])).rows[0]!.a).toBe(90_000);
  });
});

describe("dashboard summary", () => {
  it("is computed from persisted rows", async () => {
    const fresh = await createDb();
    const a = await seedAdmin(fresh);
    const d = await today(fresh);
    const m1 = await addMember(fresh, { anchor: d, price: 100_000 });
    const m2 = await addMember(fresh, { anchor: d, price: 50_000 });
    const m3 = await addMember(fresh, { anchor: d, price: 70_000, status: "inactive" });
    const dueSoon = await addPeriod(fresh, m1, addDays(d, 3), addDays(d, 33), 100_000);   // due in 3 days
    const dueFar = await addPeriod(fresh, m1, addDays(d, 30), addDays(d, 60), 100_000);   // outside 7 days
    const overdue = await addPeriod(fresh, m2, addDays(d, -10), addDays(d, 20), 50_000);  // overdue
    const paid = await addPeriod(fresh, m3, addDays(d, -20), addDays(d, 10), 70_000);
    await actAs(fresh, { sub: a, role: "authenticated" });
    await fresh.query("select public.record_payment($1, 20000, public.app_today(), 'cash', null, null, null)", [overdue]);
    await fresh.query("select public.record_payment($1, 70000, public.app_today(), 'upi', null, null, null)", [paid]);
    const r = await fresh.query<{ s: Record<string, number | string> }>("select public.dashboard_summary() as s");
    expect(r.rows[0]!.s).toMatchObject({
      active_members: 2,
      due_soon_count: 1,
      due_soon_paise: 100_000,
      overdue_periods: 1,
      overdue_members: 1,
      overdue_paise: 30_000,
      collected_month_paise: 90_000,
    });
    void dueSoon; void dueFar;
    await fresh.close();
  });
});

describe("member photos", () => {
  it("uses a private, size- and type-restricted bucket", async () => {
    await actAs(db, "superuser");
    const b = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'member-photos'",
    );
    expect(b.rows[0]).toMatchObject({ public: false, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] });
    expect(Number(b.rows[0]!.file_size_limit)).toBe(1_048_576);
  });

  it("only admins can read or write photo objects; anonymous users cannot", async () => {
    await actAs(db, "superuser");
    const stranger = (await db.query<{ id: string }>("insert into auth.users (email) values ('photo-stranger@example.test') returning id")).rows[0]!.id;

    await asAdmin();
    await db.query("insert into storage.objects (bucket_id, name) values ('member-photos', 'm1/a.jpg')");
    expect((await db.query("select 1 from storage.objects where bucket_id = 'member-photos'")).rows).toHaveLength(1);

    await actAs(db, { sub: stranger, role: "authenticated" });
    expect((await db.query("select 1 from storage.objects where bucket_id = 'member-photos'")).rows).toHaveLength(0);
    expect(await fails("insert into storage.objects (bucket_id, name) values ('member-photos', 'm1/evil.jpg')")).toMatch(/row-level security/);
    expect((await db.query("delete from storage.objects where bucket_id = 'member-photos' returning 1")).rows).toHaveLength(0);

    await actAs(db, { role: "anon" });
    expect((await db.query("select 1 from storage.objects")).rows).toHaveLength(0);
    expect(await fails("insert into storage.objects (bucket_id, name) values ('member-photos', 'm1/anon.jpg')")).toMatch(/row-level security|permission denied/);
  });

  it("exposes photo_path on member_overview and rejects path-traversal values", async () => {
    await actAs(db, "superuser");
    const m = await addMember(db, { anchor: t });
    await db.query("update public.members set photo_path = $1 where id = $2", [`${m}/abc.jpg`, m]);
    await asAdmin();
    const r = await db.query<{ photo_path: string }>("select photo_path from public.member_overview where id = $1", [m]);
    expect(r.rows[0]!.photo_path).toBe(`${m}/abc.jpg`);
    await actAs(db, "superuser");
    expect(await fails("update public.members set photo_path = '../../etc/passwd' where id = $1", [m])).toMatch(/violates check constraint/);
    await actAs(db, { role: "anon" });
    expect(await fails("select * from public.member_overview")).toMatch(/permission denied/);
  });
});
