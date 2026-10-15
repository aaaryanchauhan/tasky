import { addDays, compareDates, formatDateIN, type DateOnly } from "./dates";
import { formatRupeesPlain } from "./money";
import { isValidIndianE164 } from "./phone";

export type ReminderKind = "before_due" | "overdue";

export const REMINDER_KINDS: readonly ReminderKind[] = ["before_due", "overdue"] as const;

/** Calendar-day offset from the due date at which each reminder is scheduled. */
export const REMINDER_OFFSET_DAYS: Record<ReminderKind, number> = {
  before_due: -1,
  overdue: 3,
};

/** If the scheduler misses a day, a reminder is still queued this many days late. */
export const QUEUE_GRACE_DAYS = 2;

export const TEMPLATE_NAMES: Record<ReminderKind, string> = {
  before_due: "gym_fee_reminder",
  overdue: "gym_fee_overdue",
};

export function scheduledFor(kind: ReminderKind, dueOn: DateOnly): DateOnly {
  return addDays(dueOn, REMINDER_OFFSET_DAYS[kind]);
}

/**
 * Which reminders should be queued today for a period due on `dueOn`.
 * The before-due reminder is only ever relevant before the due date; the overdue
 * follow-up can be caught up for a couple of days if a cron run was missed.
 */
export function kindsToQueue(today: DateOnly, dueOn: DateOnly): ReminderKind[] {
  const out: ReminderKind[] = [];
  for (const kind of REMINDER_KINDS) {
    const when = scheduledFor(kind, dueOn);
    const late = compareDates(today, when) >= 0 && compareDates(today, addDays(when, QUEUE_GRACE_DAYS)) <= 0;
    if (!late) continue;
    if (kind === "before_due" && compareDates(today, dueOn) >= 0) continue;
    out.push(kind);
  }
  return out;
}

// ── Consent ────────────────────────────────────────────────────────────────

export interface ConsentFields {
  whatsappOptInAt: string | null;
  whatsappOptOutAt: string | null;
}

/** Consent is valid only if opted in and not opted out *after* the opt-in. */
export function hasValidConsent(c: ConsentFields): boolean {
  if (!c.whatsappOptInAt) return false;
  if (!c.whatsappOptOutAt) return true;
  return new Date(c.whatsappOptInAt).getTime() > new Date(c.whatsappOptOutAt).getTime();
}

export function consentLabel(c: ConsentFields): "opted_in" | "opted_out" | "no_consent" {
  if (hasValidConsent(c)) return "opted_in";
  return c.whatsappOptOutAt ? "opted_out" : "no_consent";
}

// ── Send-time eligibility ──────────────────────────────────────────────────

export type SkipReason =
  | "reminders_disabled"
  | "member_not_active"
  | "no_consent"
  | "opted_out"
  | "invalid_phone"
  | "phone_changed"
  | "period_cancelled"
  | "already_paid"
  | "stale";

export type Eligibility = { ok: true } | { ok: false; reason: SkipReason };

export interface EligibilityInput {
  remindersEnabled: boolean;
  today: DateOnly;
  job: { kind: ReminderKind; scheduledFor: DateOnly; toE164: string };
  member: { status: "active" | "inactive" | "archived"; whatsappE164: string } & ConsentFields;
  period: { cancelled: boolean; outstandingPaise: number; dueOn: DateOnly };
}

/**
 * The authoritative gate, evaluated immediately before every send using fresh data.
 * Anything queued earlier is only a candidate until it passes this.
 */
export function evaluateSend(i: EligibilityInput): Eligibility {
  if (!i.remindersEnabled) return { ok: false, reason: "reminders_disabled" };
  if (i.member.status !== "active") return { ok: false, reason: "member_not_active" };
  if (i.period.cancelled) return { ok: false, reason: "period_cancelled" };
  if (i.period.outstandingPaise <= 0) return { ok: false, reason: "already_paid" };
  if (!hasValidConsent(i.member)) {
    return { ok: false, reason: i.member.whatsappOptOutAt ? "opted_out" : "no_consent" };
  }
  if (!isValidIndianE164(i.member.whatsappE164)) return { ok: false, reason: "invalid_phone" };
  if (i.member.whatsappE164 !== i.job.toE164) return { ok: false, reason: "phone_changed" };

  const lastDay = addDays(i.job.scheduledFor, QUEUE_GRACE_DAYS);
  if (compareDates(i.today, lastDay) > 0) return { ok: false, reason: "stale" };
  // "Due tomorrow" must never go out on or after the due date.
  if (i.job.kind === "before_due" && compareDates(i.today, i.period.dueOn) >= 0) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true };
}

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  reminders_disabled: "Reminder automation is off",
  member_not_active: "Member is not active",
  no_consent: "No WhatsApp consent on record",
  opted_out: "Member opted out of WhatsApp",
  invalid_phone: "WhatsApp number is invalid",
  phone_changed: "WhatsApp number changed after queueing",
  period_cancelled: "Billing period was cancelled",
  already_paid: "Fee already paid",
  stale: "Reminder window passed",
};

// ── Template variables ─────────────────────────────────────────────────────

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName.trim();
}

/**
 * Ordered body variables for gym_fee_reminder / gym_fee_overdue:
 * {{1}} first name · {{2}} amount in rupees · {{3}} due date (e.g. "5 Mar 2026").
 * Amount is the *current outstanding* balance at send time.
 */
export function templateVariables(input: {
  fullName: string;
  outstandingPaise: number;
  dueOn: DateOnly;
}): [string, string, string] {
  return [firstName(input.fullName), formatRupeesPlain(input.outstandingPaise), formatDateIN(input.dueOn)];
}
