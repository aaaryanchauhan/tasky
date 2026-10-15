import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelPeriodButton, RecordPaymentButton, VoidPaymentButton } from "@/components/payment-dialogs";
import { RetryButton } from "@/components/retry-button";
import { StatusControls } from "@/components/status-controls";
import {
  ConsentBadge,
  DueBadge,
  JobStateBadge,
  KIND_LABEL,
  MemberStatusBadge,
  PeriodStatusBadge,
  skipLabel,
} from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { addDays, formatDateIN, formatTimestampIN, todayInTimeZone } from "@/lib/dates";
import { memberDueInfo } from "@/lib/member-status";
import { formatINR } from "@/lib/money";
import { formatPhoneDisplay } from "@/lib/phone";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { getMemberDetail } from "@/server/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Member" };

const METHOD_LABEL = { cash: "Cash", upi: "UPI", bank: "Bank", other: "Other" } as const;

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  );
}

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const settings = await getGymSettings();
  const today = todayInTimeZone(settings.timezone);
  const detail = await getMemberDetail(supabase, id);
  if (!detail) notFound();
  const { member: m, periods, payments, jobs, events } = detail;

  const due = memberDueInfo(m, today);
  const outstanding = periods.filter((p) => p.outstanding_paise > 0).sort((a, b) => a.due_on.localeCompare(b.due_on));
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const eventsByJob = new Map<string, typeof events>();
  for (const e of events) eventsByJob.set(e.message_job_id, [...(eventsByJob.get(e.message_job_id) ?? []), e]);
  const canBill = m.status === "active";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/members" className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft hover:text-ink">
          ← Members
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-extrabold tracking-tight">{m.full_name}</h1>
            <p className="text-ink-soft">{formatPhoneDisplay(m.whatsapp_e164)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <MemberStatusBadge status={m.status} />
              <Badge tone="brand">{m.plan_name}</Badge>
              <ConsentBadge optInAt={m.whatsapp_opt_in_at} optOutAt={m.whatsapp_opt_out_at} />
              <DueBadge info={due} />
            </div>
          </div>
          {m.status !== "archived" ? (
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/members/${m.id}/edit`} variant="secondary">
                Edit
              </LinkButton>
              <LinkButton href={`/members/${m.id}/billing`} variant="secondary">
                {m.status === "inactive" ? "Reactivate" : "Plan / fee / due date"}
              </LinkButton>
            </div>
          ) : null}
        </div>
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Info label="Joined">{formatDateIN(m.joined_on)}</Info>
          <Info label="Agreed fee">{formatINR(m.agreed_price_paise)}</Info>
          <Info label="Billing day">{m.billing_anchor_day}{ordinal(m.billing_anchor_day)} of the cycle</Info>
          <Info label={due.kind === "paid_up" ? "Next due" : "Due"}>{due.dueOn ? formatDateIN(due.dueOn) : "—"}</Info>
          <Info label="First due date">{formatDateIN(m.first_due_on)}</Info>
          <Info label="Alternate contact">{m.alternate_contact || "—"}</Info>
          <Info label="WhatsApp consent">
            {m.whatsapp_opt_in_at ? `${formatTimestampIN(m.whatsapp_opt_in_at, settings.timezone)}${m.whatsapp_opt_in_source ? ` · ${m.whatsapp_opt_in_source}` : ""}` : "None recorded"}
          </Info>
          <Info label="Opted out">{m.whatsapp_opt_out_at ? formatTimestampIN(m.whatsapp_opt_out_at, settings.timezone) : "No"}</Info>
        </dl>
        {m.notes ? <p className="mt-4 whitespace-pre-wrap border-t border-line pt-3 text-sm text-ink-soft">{m.notes}</p> : null}
      </Card>

      <section aria-labelledby="out-h">
        <SectionTitle>
          <span id="out-h">Outstanding fees</span>
        </SectionTitle>
        {outstanding.length === 0 ? (
          <EmptyState title="Nothing outstanding" hint={canBill ? "The next fee is billed a week before it's due." : "This member is not being billed."} />
        ) : (
          <ul className="space-y-3">
            {outstanding.map((p) => (
              <li key={p.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">
                        Due {formatDateIN(p.due_on)} · <span className="capitalize">{p.plan_code_snapshot}</span>
                      </p>
                      <p className="text-sm text-ink-soft">
                        Term {formatDateIN(p.period_start)} – {formatDateIN(addDays(p.period_end_exclusive, -1))}
                      </p>
                    </div>
                    <PeriodStatusBadge status={p.status} overdue={p.is_overdue} daysOverdue={p.days_overdue} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="text-sm">
                      <p>
                        Fee {formatINR(p.amount_due_paise)} · paid {formatINR(p.paid_paise)}
                      </p>
                      <p className="text-lg font-extrabold">{formatINR(p.outstanding_paise)} outstanding</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {p.paid_paise === 0 ? <CancelPeriodButton periodId={p.id} /> : null}
                      <RecordPaymentButton
                        periodId={p.id}
                        memberName={m.full_name}
                        outstandingPaise={p.outstanding_paise}
                        dueLabel={formatDateIN(p.due_on)}
                        today={today}
                        label="Record payment"
                      />
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pay-h">
        <SectionTitle>
          <span id="pay-h">Payment history</span>
        </SectionTitle>
        {payments.length === 0 ? (
          <EmptyState title="No payments recorded yet" />
        ) : (
          <Card className="py-1">
            <ul className="divide-y divide-line">
              {payments.map((pay) => {
                const period = periodById.get(pay.billing_period_id);
                const voided = Boolean(pay.voided_at);
                return (
                  <li key={pay.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                    <div className="min-w-0">
                      <p className={`font-bold ${voided ? "text-stone-400 line-through" : ""}`}>
                        {formatINR(pay.amount_paise)} <span className="font-medium text-ink-soft no-underline">· {METHOD_LABEL[pay.method]}</span>
                      </p>
                      <p className="text-sm text-ink-soft">
                        {formatDateIN(pay.paid_on)}
                        {period ? ` · for fee due ${formatDateIN(period.due_on)}` : ""}
                        {pay.reference ? ` · ref ${pay.reference}` : ""}
                      </p>
                      {voided ? (
                        <p className="text-sm font-medium text-red-700">
                          Reversed {formatTimestampIN(pay.voided_at!, settings.timezone)}: {pay.void_reason}
                        </p>
                      ) : null}
                    </div>
                    {!voided ? <VoidPaymentButton paymentId={pay.id} amountLabel={formatINR(pay.amount_paise)} /> : <Badge tone="bad">Reversed</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="hist-h">
        <SectionTitle>
          <span id="hist-h">All billing periods</span>
        </SectionTitle>
        {periods.length === 0 ? (
          <EmptyState title="No billing periods yet" />
        ) : (
          <Card className="py-1">
            <ul className="divide-y divide-line text-sm">
              {periods.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-semibold">{formatDateIN(p.due_on)}</span>{" "}
                    <span className="capitalize text-ink-soft">
                      · {p.plan_code_snapshot} · {formatINR(p.amount_due_paise)}
                    </span>
                  </span>
                  <PeriodStatusBadge status={p.status} overdue={p.is_overdue} daysOverdue={p.days_overdue} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="wa-h">
        <SectionTitle>
          <span id="wa-h">WhatsApp reminders</span>
        </SectionTitle>
        {jobs.length === 0 ? (
          <EmptyState
            title="No reminders yet"
            hint={settings.reminders_enabled ? "Reminders are queued the day before a fee is due and 3 days after if it's unpaid." : "Automatic reminders are switched off in Settings."}
          />
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => {
              const period = periodById.get(j.billing_period_id);
              const evs = eventsByJob.get(j.id) ?? [];
              return (
                <li key={j.id}>
                  <Card className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {KIND_LABEL[j.kind]}
                        {period ? <span className="font-normal text-ink-soft"> · fee due {formatDateIN(period.due_on)}</span> : null}
                      </p>
                      <JobStateBadge state={j.state} />
                    </div>
                    <p className="text-sm text-ink-soft">
                      {j.sent_at ? `Sent ${formatTimestampIN(j.sent_at, settings.timezone)}` : `Scheduled ${formatDateIN(j.scheduled_for)}`}
                      {j.delivered_at ? ` · delivered ${formatTimestampIN(j.delivered_at, settings.timezone)}` : ""}
                      {j.read_at ? ` · read ${formatTimestampIN(j.read_at, settings.timezone)}` : ""}
                      {j.attempt_count > 0 ? ` · ${j.attempt_count} attempt${j.attempt_count > 1 ? "s" : ""}` : ""}
                    </p>
                    {j.state === "skipped" ? <p className="text-sm font-medium">Skipped: {skipLabel(j.skip_reason)}</p> : null}
                    {j.last_error && (j.state === "failed" || j.state === "pending") ? (
                      <p className="text-sm font-medium text-red-700">
                        {j.error_kind === "ambiguous" ? "Outcome unknown: " : ""}
                        {j.last_error}
                      </p>
                    ) : null}
                    {j.state === "failed" || j.state === "skipped" ? <RetryButton jobId={j.id} ambiguous={j.error_kind === "ambiguous"} /> : null}
                    {evs.length > 0 ? (
                      <details className="text-sm">
                        <summary className="min-h-9 cursor-pointer py-1 font-semibold text-ink-soft">Delivery log</summary>
                        <ul className="mt-1 space-y-0.5 text-ink-soft">
                          {evs.map((e) => (
                            <li key={e.id}>
                              {formatTimestampIN(e.event_at, settings.timezone)} — {e.event_type.replace(/_/g, " ")}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {m.status === "active" ? <StatusControls memberId={m.id} today={today} /> : null}
    </div>
  );
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
}
