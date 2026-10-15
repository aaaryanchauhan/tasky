import { Badge, type Tone } from "@/components/ui/badge";
import type { JobState, PeriodStatus } from "@/lib/db/types";
import type { MemberDueInfo } from "@/lib/member-status";
import { consentLabel, SKIP_REASON_LABEL, type SkipReason } from "@/lib/reminders";

export function PeriodStatusBadge({ status, overdue, daysOverdue }: { status: PeriodStatus; overdue?: boolean; daysOverdue?: number }) {
  if (status === "cancelled") return <Badge>Cancelled</Badge>;
  if (status === "paid") return <Badge tone="good">Paid</Badge>;
  if (overdue) return <Badge tone="bad">{status === "partial" ? "Partial · " : ""}Overdue{daysOverdue ? ` ${daysOverdue}d` : ""}</Badge>;
  if (status === "partial") return <Badge tone="warn">Partially paid</Badge>;
  return <Badge tone="warn">Unpaid</Badge>;
}

export function DueBadge({ info }: { info: MemberDueInfo }) {
  switch (info.kind) {
    case "overdue":
      return <Badge tone="bad">Overdue {info.daysOverdue}d</Badge>;
    case "due_soon":
      return <Badge tone="warn">{info.partial ? "Partial · due soon" : "Due soon"}</Badge>;
    case "upcoming":
      return <Badge tone="info">{info.partial ? "Partially paid" : "Upcoming"}</Badge>;
    case "paid_up":
      return <Badge tone="good">Paid up</Badge>;
    default:
      return <Badge>Not billing</Badge>;
  }
}

export function MemberStatusBadge({ status }: { status: "active" | "inactive" | "archived" }) {
  return <Badge tone={status === "active" ? "good" : "neutral"}>{status[0]!.toUpperCase() + status.slice(1)}</Badge>;
}

export function ConsentBadge({ optInAt, optOutAt }: { optInAt: string | null; optOutAt: string | null }) {
  const c = consentLabel({ whatsappOptInAt: optInAt, whatsappOptOutAt: optOutAt });
  if (c === "opted_in") return <Badge tone="good">WhatsApp OK</Badge>;
  if (c === "opted_out") return <Badge tone="bad">Opted out</Badge>;
  return <Badge tone="warn">No consent</Badge>;
}

const JOB_TONE: Record<JobState, Tone> = {
  pending: "info",
  claimed: "info",
  submitted: "info",
  delivered: "good",
  read: "good",
  failed: "bad",
  skipped: "neutral",
};

const JOB_LABEL: Record<JobState, string> = {
  pending: "Queued",
  claimed: "Sending…",
  submitted: "Accepted by Meta",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  skipped: "Skipped",
};

export function JobStateBadge({ state }: { state: JobState }) {
  return <Badge tone={JOB_TONE[state]}>{JOB_LABEL[state]}</Badge>;
}

export function skipLabel(reason: string | null): string {
  if (!reason) return "";
  return SKIP_REASON_LABEL[reason as SkipReason] ?? reason;
}

export const KIND_LABEL = { before_due: "Due-date reminder", overdue: "Overdue follow-up" } as const;
