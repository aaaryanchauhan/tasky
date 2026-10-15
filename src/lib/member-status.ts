import { nextCycleAfter, type PlanCode } from "./billing";
import { addDays, compareDates, type DateOnly } from "./dates";
import type { MemberStatus, PeriodStatus } from "./db/types";

export interface MemberDueInput {
  status: MemberStatus;
  plan_code: PlanCode;
  billing_anchor_on: string;
  focus_due_on: string | null;
  focus_outstanding_paise: number | null;
  focus_status: PeriodStatus | null;
  focus_is_overdue: boolean | null;
  focus_days_overdue: number | null;
}

export type DueKind = "overdue" | "due_soon" | "upcoming" | "paid_up" | "not_billing";

export interface MemberDueInfo {
  kind: DueKind;
  dueOn: DateOnly | null;
  outstandingPaise: number;
  daysOverdue: number;
  partial: boolean;
}

/** What to show for a member in lists: their oldest unpaid period, else their next renewal. */
export function memberDueInfo(m: MemberDueInput, today: DateOnly): MemberDueInfo {
  if (m.focus_due_on && (m.focus_outstanding_paise ?? 0) > 0) {
    const partial = m.focus_status === "partial";
    if (m.focus_is_overdue) {
      return { kind: "overdue", dueOn: m.focus_due_on, outstandingPaise: m.focus_outstanding_paise ?? 0, daysOverdue: m.focus_days_overdue ?? 0, partial };
    }
    const soon = compareDates(m.focus_due_on, addDays(today, 7)) <= 0;
    return { kind: soon ? "due_soon" : "upcoming", dueOn: m.focus_due_on, outstandingPaise: m.focus_outstanding_paise ?? 0, daysOverdue: 0, partial };
  }
  if (m.status !== "active") return { kind: "not_billing", dueOn: null, outstandingPaise: 0, daysOverdue: 0, partial: false };
  return { kind: "paid_up", dueOn: nextCycleAfter(m.billing_anchor_on, m.plan_code, today), outstandingPaise: 0, daysOverdue: 0, partial: false };
}
