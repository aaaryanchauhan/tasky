import { addDays, cycleStart, compareDates, diffDays, formatDateIN, type DateOnly } from "./dates";

export type PlanCode = "monthly" | "quarterly" | "annual";

export const PLAN_CODES: readonly PlanCode[] = ["monthly", "quarterly", "annual"] as const;

/** Calendar-month length of each membership tier. */
export const PLAN_DURATION_MONTHS: Record<PlanCode, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

/** Billing periods are created this many days before their due date. */
export const GENERATION_LEAD_DAYS = 7;

/** Safety valve against runaway loops (e.g. a first due date decades ago). */
const MAX_PERIODS_PER_RUN = 600;

export function isPlanCode(value: string): value is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(value);
}

export interface PeriodDraft {
  periodStart: DateOnly;
  periodEndExclusive: DateOnly;
  /** MVP default: fees are paid in advance, so a term is due on the day it starts. */
  dueOn: DateOnly;
  planCodeSnapshot: PlanCode;
  durationMonthsSnapshot: number;
  amountDuePaise: number;
}

/** Latest date up to which billing periods should exist, given today's date. */
export function generationHorizon(today: DateOnly): DateOnly {
  return addDays(today, GENERATION_LEAD_DAYS);
}

/**
 * Deterministic list of billing periods for a member, from `anchor` through `horizon`.
 * Pure and idempotent: the same inputs always yield the same periods, and every period
 * is derived from the original anchor so month-end dates never drift.
 */
export function generatePeriods(input: {
  anchor: DateOnly;
  planCode: PlanCode;
  amountPaise: number;
  horizon: DateOnly;
}): PeriodDraft[] {
  const months = PLAN_DURATION_MONTHS[input.planCode];
  const out: PeriodDraft[] = [];
  for (let k = 0; k < MAX_PERIODS_PER_RUN; k++) {
    const start = cycleStart(input.anchor, months, k);
    if (compareDates(start, input.horizon) > 0) break;
    out.push({
      periodStart: start,
      periodEndExclusive: cycleStart(input.anchor, months, k + 1),
      dueOn: start,
      planCodeSnapshot: input.planCode,
      durationMonthsSnapshot: months,
      amountDuePaise: input.amountPaise,
    });
  }
  if (out.length === MAX_PERIODS_PER_RUN) {
    throw new Error("Refusing to generate this many billing periods; check the first due date");
  }
  return out;
}

/** The next cycle start strictly after `today` — what the UI shows as "next due". */
export function nextCycleAfter(anchor: DateOnly, planCode: PlanCode, today: DateOnly): DateOnly {
  const months = PLAN_DURATION_MONTHS[planCode];
  for (let k = 0; k < MAX_PERIODS_PER_RUN; k++) {
    const start = cycleStart(anchor, months, k);
    if (compareDates(start, today) > 0) return start;
  }
  throw new Error("No upcoming cycle found");
}

// ── Balances and status ────────────────────────────────────────────────────

export type PaymentStatus = "unpaid" | "partial" | "paid" | "cancelled";

export interface PeriodState {
  outstandingPaise: number;
  status: PaymentStatus;
  isOverdue: boolean;
  daysOverdue: number;
}

/**
 * Overdue is *derived* (never stored): the due date has passed and a balance remains.
 * A partially paid period is "partial" until the balance reaches zero, never "paid".
 */
export function derivePeriodState(input: {
  amountDuePaise: number;
  paidPaise: number;
  dueOn: DateOnly;
  today: DateOnly;
  cancelled?: boolean;
}): PeriodState {
  if (input.cancelled) {
    return { outstandingPaise: 0, status: "cancelled", isOverdue: false, daysOverdue: 0 };
  }
  const outstandingPaise = Math.max(0, input.amountDuePaise - input.paidPaise);
  let status: PaymentStatus;
  if (outstandingPaise === 0) status = "paid";
  else if (input.paidPaise > 0) status = "partial";
  else status = "unpaid";

  const daysPast = diffDays(input.dueOn, input.today);
  const isOverdue = outstandingPaise > 0 && daysPast > 0;
  return { outstandingPaise, status, isOverdue, daysOverdue: isOverdue ? daysPast : 0 };
}

export type PaymentCheck = { ok: true } | { ok: false; error: string };

/** A payment is applied to one explicitly chosen period and may not exceed its balance. */
export function checkPaymentAmount(outstandingPaise: number, amountPaise: number): PaymentCheck {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    return { ok: false, error: "Amount must be greater than zero" };
  }
  if (outstandingPaise <= 0) return { ok: false, error: "This period is already fully paid" };
  if (amountPaise > outstandingPaise) {
    return { ok: false, error: "Amount is more than the outstanding balance" };
  }
  return { ok: true };
}

// ── Terms changes (plan / price / due-date) ────────────────────────────────

export interface ExistingPeriod {
  id: string;
  periodStart: DateOnly;
  periodEndExclusive: DateOnly;
  dueOn: DateOnly;
  amountDuePaise: number;
  paidPaise: number;
}

export interface BillingChangePlan {
  /** Unpaid periods starting on/after the effective date; they are cancelled, not deleted. */
  cancel: ExistingPeriod[];
  /** Periods left untouched (history, in-progress terms, anything with a payment). */
  keep: ExistingPeriod[];
  newAnchor: DateOnly;
  /** Lowest permissible anchor: the new terms may not overlap a term that is kept. */
  minAnchor: DateOnly;
  create: PeriodDraft[];
  warnings: string[];
}

/**
 * Work out — without touching any data — what changing a member's plan, price or
 * due-date anchor from `effectiveOn` would do. History is never rewritten and no
 * proration is applied: a term that has started or has a payment runs to its end,
 * and the new terms begin after it.
 */
export function planBillingChange(input: {
  existing: ExistingPeriod[];
  effectiveOn: DateOnly;
  requestedAnchor?: DateOnly | null;
  newPlanCode: PlanCode;
  newAmountPaise: number;
  today: DateOnly;
}): BillingChangePlan {
  const cancel: ExistingPeriod[] = [];
  const keep: ExistingPeriod[] = [];
  for (const p of input.existing) {
    const startsOnOrAfter = compareDates(p.periodStart, input.effectiveOn) >= 0;
    if (startsOnOrAfter && p.paidPaise === 0) cancel.push(p);
    else keep.push(p);
  }

  const lastKeptEnd = keep.reduce<DateOnly | null>(
    (max, p) => (max === null || compareDates(p.periodEndExclusive, max) > 0 ? p.periodEndExclusive : max),
    null,
  );
  const minAnchor =
    lastKeptEnd && compareDates(lastKeptEnd, input.effectiveOn) > 0 ? lastKeptEnd : input.effectiveOn;

  const warnings: string[] = [];
  let newAnchor = minAnchor;
  if (input.requestedAnchor) {
    if (compareDates(input.requestedAnchor, minAnchor) < 0) {
      warnings.push(
        `The first due date cannot be before ${formatDateIN(minAnchor)}: an existing term already covers the period before then.`,
      );
    } else {
      newAnchor = input.requestedAnchor;
    }
  }
  if (lastKeptEnd && compareDates(minAnchor, input.effectiveOn) > 0 && !input.requestedAnchor) {
    warnings.push(
      "A term that has already started or been paid runs to its end (no proration); the new terms start after it.",
    );
  }
  if (lastKeptEnd && compareDates(newAnchor, lastKeptEnd) > 0) {
    warnings.push(`No billing period will cover ${formatDateIN(lastKeptEnd)} to ${formatDateIN(newAnchor)}.`);
  }
  const cancelledOutstanding = cancel.reduce((sum, p) => sum + p.amountDuePaise, 0);
  if (cancel.length > 0 && cancelledOutstanding > 0) {
    warnings.push(`${cancel.length} unpaid period(s) will be cancelled and replaced under the new terms.`);
  }

  const create = generatePeriods({
    anchor: newAnchor,
    planCode: input.newPlanCode,
    amountPaise: input.newAmountPaise,
    horizon: generationHorizon(input.today),
  });

  return { cancel, keep, newAnchor, minAnchor, create, warnings };
}

/**
 * Deactivation: cancel unpaid periods that start on/after the effective date.
 * Anything already started or carrying a payment is preserved with its balance.
 */
export function planDeactivation(existing: ExistingPeriod[], effectiveOn: DateOnly): ExistingPeriod[] {
  return existing.filter((p) => compareDates(p.periodStart, effectiveOn) >= 0 && p.paidPaise === 0);
}
