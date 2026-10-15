import { describe, expect, it } from "vitest";
import {
  checkPaymentAmount,
  derivePeriodState,
  generatePeriods,
  nextCycleAfter,
  planBillingChange,
  planDeactivation,
  type ExistingPeriod,
} from "@/lib/billing";
import { formatINR, formatRupeesPlain, parseRupeesToPaise } from "@/lib/money";
import { normalizeIndianNumber } from "@/lib/phone";

describe("generatePeriods", () => {
  it("creates monthly, quarterly and annual periods with calendar boundaries", () => {
    const monthly = generatePeriods({ anchor: "2026-01-31", planCode: "monthly", amountPaise: 100_000, horizon: "2026-03-31" });
    expect(monthly.map((p) => p.periodStart)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(monthly[0]!.periodEndExclusive).toBe("2026-02-28");
    expect(monthly[1]!.periodEndExclusive).toBe("2026-03-31");

    const quarterly = generatePeriods({ anchor: "2026-01-10", planCode: "quarterly", amountPaise: 270_000, horizon: "2026-12-31" });
    expect(quarterly.map((p) => p.periodStart)).toEqual(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10"]);

    const annual = generatePeriods({ anchor: "2028-02-29", planCode: "annual", amountPaise: 1_000_000, horizon: "2030-03-01" });
    expect(annual.map((p) => p.periodStart)).toEqual(["2028-02-29", "2029-02-28", "2030-02-28"]);
  });

  it("is idempotent and due on the term start (advance payment)", () => {
    const args = { anchor: "2026-05-01", planCode: "monthly" as const, amountPaise: 50_000, horizon: "2026-07-05" };
    expect(generatePeriods(args)).toEqual(generatePeriods(args));
    for (const p of generatePeriods(args)) expect(p.dueOn).toBe(p.periodStart);
  });

  it("snapshots plan and price on every period", () => {
    const [p] = generatePeriods({ anchor: "2026-05-01", planCode: "quarterly", amountPaise: 270_000, horizon: "2026-05-01" });
    expect(p).toMatchObject({ planCodeSnapshot: "quarterly", durationMonthsSnapshot: 3, amountDuePaise: 270_000 });
  });

  it("only generates ahead of the horizon, never far into the future", () => {
    const ps = generatePeriods({ anchor: "2026-08-01", planCode: "monthly", amountPaise: 1, horizon: "2026-07-20" });
    expect(ps).toEqual([]);
  });

  it("finds the next cycle date after today", () => {
    expect(nextCycleAfter("2026-01-31", "monthly", "2026-02-10")).toBe("2026-02-28");
    expect(nextCycleAfter("2026-01-31", "monthly", "2026-02-28")).toBe("2026-03-31");
  });
});

describe("derivePeriodState", () => {
  const base = { amountDuePaise: 100_000, dueOn: "2026-03-10" };
  it("unpaid → partial → paid, never 'paid' while a balance remains", () => {
    expect(derivePeriodState({ ...base, paidPaise: 0, today: "2026-03-01" })).toMatchObject({ status: "unpaid", outstandingPaise: 100_000 });
    expect(derivePeriodState({ ...base, paidPaise: 40_000, today: "2026-03-01" })).toMatchObject({ status: "partial", outstandingPaise: 60_000 });
    expect(derivePeriodState({ ...base, paidPaise: 99_999, today: "2026-03-01" })).toMatchObject({ status: "partial", outstandingPaise: 1 });
    expect(derivePeriodState({ ...base, paidPaise: 100_000, today: "2026-03-01" })).toMatchObject({ status: "paid", outstandingPaise: 0 });
  });

  it("overdue is derived from due date and balance", () => {
    expect(derivePeriodState({ ...base, paidPaise: 0, today: "2026-03-10" }).isOverdue).toBe(false);
    expect(derivePeriodState({ ...base, paidPaise: 0, today: "2026-03-11" })).toMatchObject({ isOverdue: true, daysOverdue: 1 });
    expect(derivePeriodState({ ...base, paidPaise: 100_000, today: "2026-04-11" }).isOverdue).toBe(false);
    expect(derivePeriodState({ ...base, paidPaise: 10, today: "2026-03-20" })).toMatchObject({ status: "partial", isOverdue: true, daysOverdue: 10 });
  });

  it("cancelled periods carry no balance", () => {
    expect(derivePeriodState({ ...base, paidPaise: 0, today: "2026-04-01", cancelled: true })).toMatchObject({ status: "cancelled", outstandingPaise: 0, isOverdue: false });
  });
});

describe("checkPaymentAmount", () => {
  it("rejects zero, negative, fractional and over-balance amounts", () => {
    expect(checkPaymentAmount(1000, 0).ok).toBe(false);
    expect(checkPaymentAmount(1000, -5).ok).toBe(false);
    expect(checkPaymentAmount(1000, 10.5).ok).toBe(false);
    expect(checkPaymentAmount(1000, 1001).ok).toBe(false);
    expect(checkPaymentAmount(0, 100).ok).toBe(false);
    expect(checkPaymentAmount(1000, 1000).ok).toBe(true);
    expect(checkPaymentAmount(1000, 1).ok).toBe(true);
  });
});

describe("planBillingChange", () => {
  const p = (id: string, start: string, end: string, paid = 0, amount = 100_000): ExistingPeriod => ({
    id, periodStart: start, periodEndExclusive: end, dueOn: start, amountDuePaise: amount, paidPaise: paid,
  });

  it("keeps history and in-progress terms; cancels unpaid future terms; no proration", () => {
    const existing = [
      p("a", "2026-01-10", "2026-02-10", 100_000),
      p("b", "2026-02-10", "2026-03-10", 100_000),
      p("c", "2026-03-10", "2026-04-10", 0),
    ];
    const plan = planBillingChange({
      existing, effectiveOn: "2026-03-01", newPlanCode: "quarterly", newAmountPaise: 270_000, today: "2026-03-05",
    });
    expect(plan.cancel.map((x) => x.id)).toEqual(["c"]);
    expect(plan.keep.map((x) => x.id)).toEqual(["a", "b"]);
    // term "b" runs until 10 Mar, so the quarterly cycle starts then
    expect(plan.newAnchor).toBe("2026-03-10");
    expect(plan.create.map((x) => x.periodStart)).toEqual(["2026-03-10"]);
    expect(plan.create[0]).toMatchObject({ planCodeSnapshot: "quarterly", amountDuePaise: 270_000 });
  });

  it("never cancels a period that has a payment", () => {
    const existing = [p("a", "2026-03-10", "2026-04-10", 5_000)];
    const plan = planBillingChange({
      existing, effectiveOn: "2026-03-01", newPlanCode: "monthly", newAmountPaise: 90_000, today: "2026-03-05",
    });
    expect(plan.cancel).toEqual([]);
    expect(plan.newAnchor).toBe("2026-04-10");
  });

  it("rejects an anchor that would overlap a kept term but accepts a later one", () => {
    const existing = [p("a", "2026-03-10", "2026-04-10", 100_000)];
    const early = planBillingChange({
      existing, effectiveOn: "2026-03-01", requestedAnchor: "2026-03-20", newPlanCode: "monthly", newAmountPaise: 1, today: "2026-03-05",
    });
    expect(early.newAnchor).toBe("2026-04-10");
    expect(early.warnings.join(" ")).toMatch(/cannot be before/);
    const late = planBillingChange({
      existing, effectiveOn: "2026-03-01", requestedAnchor: "2026-04-15", newPlanCode: "monthly", newAmountPaise: 1, today: "2026-03-05",
    });
    expect(late.newAnchor).toBe("2026-04-15");
  });

  it("deactivation cancels only unpaid periods starting on/after the effective date", () => {
    const existing = [
      p("a", "2026-03-10", "2026-04-10", 0),
      p("b", "2026-04-10", "2026-05-10", 0),
      p("c", "2026-05-10", "2026-06-10", 1),
    ];
    expect(planDeactivation(existing, "2026-04-10").map((x) => x.id)).toEqual(["b"]);
  });
});

describe("money and phone", () => {
  it("uses integer paise and Indian grouping", () => {
    expect(parseRupeesToPaise("1,500")).toBe(150_000);
    expect(parseRupeesToPaise("1500.5")).toBe(150_050);
    expect(parseRupeesToPaise("0.1")).toBe(10);
    expect(parseRupeesToPaise("12.345")).toBeNull();
    expect(parseRupeesToPaise("-5")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(formatINR(150_000)).toBe("₹1,500");
    expect(formatINR(1_234_567_00)).toBe("₹12,34,567");
    expect(formatRupeesPlain(150_050)).toBe("1,500.50");
  });

  it("normalizes Indian mobile numbers to E.164", () => {
    expect(normalizeIndianNumber("98765 43210")).toBe("+919876543210");
    expect(normalizeIndianNumber("+91-98765-43210")).toBe("+919876543210");
    expect(normalizeIndianNumber("919876543210")).toBe("+919876543210");
    expect(normalizeIndianNumber("09876543210")).toBe("+919876543210");
    expect(normalizeIndianNumber("1234567890")).toBeNull();
    expect(normalizeIndianNumber("+14155550123")).toBeNull();
    expect(normalizeIndianNumber("98765")).toBeNull();
  });
});
