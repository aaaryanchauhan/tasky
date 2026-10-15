import { describe, expect, it } from "vitest";
import {
  evaluateSend,
  hasValidConsent,
  kindsToQueue,
  scheduledFor,
  templateVariables,
  type EligibilityInput,
} from "@/lib/reminders";

describe("scheduling", () => {
  it("schedules one day before and three days after the due date", () => {
    expect(scheduledFor("before_due", "2026-03-01")).toBe("2026-02-28");
    expect(scheduledFor("overdue", "2026-02-27")).toBe("2026-03-02");
    expect(scheduledFor("before_due", "2028-03-01")).toBe("2028-02-29");
  });

  it("queues exactly the right kind on the right day", () => {
    expect(kindsToQueue("2026-03-09", "2026-03-10")).toEqual(["before_due"]);
    expect(kindsToQueue("2026-03-08", "2026-03-10")).toEqual([]);
    expect(kindsToQueue("2026-03-10", "2026-03-10")).toEqual([]);
    expect(kindsToQueue("2026-03-13", "2026-03-10")).toEqual(["overdue"]);
    expect(kindsToQueue("2026-03-12", "2026-03-10")).toEqual([]);
  });

  it("catches up an overdue follow-up after a missed cron day, but not indefinitely", () => {
    expect(kindsToQueue("2026-03-14", "2026-03-10")).toEqual(["overdue"]);
    expect(kindsToQueue("2026-03-15", "2026-03-10")).toEqual(["overdue"]);
    expect(kindsToQueue("2026-03-16", "2026-03-10")).toEqual([]);
  });
});

describe("consent", () => {
  it("requires an opt-in not superseded by an opt-out", () => {
    expect(hasValidConsent({ whatsappOptInAt: null, whatsappOptOutAt: null })).toBe(false);
    expect(hasValidConsent({ whatsappOptInAt: "2026-01-01T00:00:00Z", whatsappOptOutAt: null })).toBe(true);
    expect(hasValidConsent({ whatsappOptInAt: "2026-01-01T00:00:00Z", whatsappOptOutAt: "2026-02-01T00:00:00Z" })).toBe(false);
    // re-opted-in after an opt-out
    expect(hasValidConsent({ whatsappOptInAt: "2026-03-01T00:00:00Z", whatsappOptOutAt: "2026-02-01T00:00:00Z" })).toBe(true);
  });
});

describe("evaluateSend", () => {
  const base = (): EligibilityInput => ({
    remindersEnabled: true,
    today: "2026-03-09",
    job: { kind: "before_due", scheduledFor: "2026-03-09", toE164: "+919876543210" },
    member: {
      status: "active",
      whatsappE164: "+919876543210",
      whatsappOptInAt: "2026-01-01T00:00:00Z",
      whatsappOptOutAt: null,
    },
    period: { cancelled: false, outstandingPaise: 100_000, dueOn: "2026-03-10" },
  });

  it("allows a normal reminder", () => {
    expect(evaluateSend(base())).toEqual({ ok: true });
  });

  it.each([
    ["automation off", (i: EligibilityInput) => { i.remindersEnabled = false; }, "reminders_disabled"],
    ["inactive member", (i: EligibilityInput) => { i.member.status = "inactive"; }, "member_not_active"],
    ["archived member", (i: EligibilityInput) => { i.member.status = "archived"; }, "member_not_active"],
    ["no consent", (i: EligibilityInput) => { i.member.whatsappOptInAt = null; }, "no_consent"],
    ["opted out", (i: EligibilityInput) => { i.member.whatsappOptOutAt = "2026-02-01T00:00:00Z"; }, "opted_out"],
    ["paid before send", (i: EligibilityInput) => { i.period.outstandingPaise = 0; }, "already_paid"],
    ["period cancelled", (i: EligibilityInput) => { i.period.cancelled = true; }, "period_cancelled"],
    ["phone changed", (i: EligibilityInput) => { i.member.whatsappE164 = "+919000000001"; }, "phone_changed"],
    ["invalid phone", (i: EligibilityInput) => { i.member.whatsappE164 = "12345"; i.job.toE164 = "12345"; }, "invalid_phone"],
    ["stale window", (i: EligibilityInput) => { i.today = "2026-03-12"; }, "stale"],
    ["due-tomorrow after due date", (i: EligibilityInput) => { i.job.scheduledFor = "2026-03-09"; i.today = "2026-03-10"; }, "stale"],
  ])("blocks: %s", (_name, mutate, reason) => {
    const input = base();
    mutate(input);
    expect(evaluateSend(input)).toEqual({ ok: false, reason });
  });

  it("allows a late overdue follow-up inside the grace window", () => {
    const i = base();
    i.job = { kind: "overdue", scheduledFor: "2026-03-13", toE164: "+919876543210" };
    i.period.dueOn = "2026-03-10";
    i.today = "2026-03-14";
    expect(evaluateSend(i)).toEqual({ ok: true });
  });
});

describe("templateVariables", () => {
  it("uses first name, current outstanding balance, and an Indian-format date", () => {
    expect(templateVariables({ fullName: "Rohit  Sharma", outstandingPaise: 60_000, dueOn: "2026-03-05" })).toEqual([
      "Rohit",
      "600",
      "5 Mar 2026",
    ]);
    expect(templateVariables({ fullName: "Asha", outstandingPaise: 123_450, dueOn: "2026-12-25" })[1]).toBe("1,234.50");
  });
});
