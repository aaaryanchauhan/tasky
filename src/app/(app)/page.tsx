import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import { RecordPaymentButton } from "@/components/payment-dialogs";
import { PeriodStatusBadge } from "@/components/status";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/card";
import { formatDateIN, todayInTimeZone } from "@/lib/dates";
import type { BillingPeriodSummaryRow } from "@/lib/db/types";
import { formatINR } from "@/lib/money";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { getDashboard } from "@/server/queries";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "bad" | "good" }) {
  const color = tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-ink";
  return (
    <Card className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`mt-1 truncate text-2xl font-extrabold ${color}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-sm text-ink-soft">{sub}</p> : null}
    </Card>
  );
}

function PeriodRow({ p, today, showPay }: { p: BillingPeriodSummaryRow; today: string; showPay: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
      <Link href={`/members/${p.member_id}`} className="min-w-0 flex-1 basis-40 rounded-lg py-1">
        <p className="truncate font-semibold">{p.member_name}</p>
        <p className="text-sm capitalize text-ink-soft">
          {p.plan_code_snapshot} · due {formatDateIN(p.due_on)}
        </p>
      </Link>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-bold">{formatINR(p.outstanding_paise)}</p>
          <PeriodStatusBadge status={p.status} overdue={p.is_overdue} daysOverdue={p.days_overdue} />
        </div>
        {showPay ? (
          <RecordPaymentButton
            periodId={p.id}
            memberName={p.member_name}
            outstandingPaise={p.outstanding_paise}
            dueLabel={formatDateIN(p.due_on)}
            today={today}
            label="Mark paid"
            size="sm"
          />
        ) : null}
      </div>
    </li>
  );
}

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const settings = await getGymSettings();
  const today = todayInTimeZone(settings.timezone);
  const { summary, dueSoon, overdue } = await getDashboard(supabase, today);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`Today · ${formatDateIN(today)}`} />

      <LinkButton href="/members/new" size="lg" className="w-full md:w-auto">
        <PlusIcon /> Add member
      </LinkButton>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active members" value={String(summary.active_members)} />
        <Stat
          label="Due in 7 days"
          value={formatINR(summary.due_soon_paise)}
          sub={`${summary.due_soon_count} fee${summary.due_soon_count === 1 ? "" : "s"}`}
        />
        <Stat
          label="Overdue"
          value={formatINR(summary.overdue_paise)}
          sub={`${summary.overdue_members} member${summary.overdue_members === 1 ? "" : "s"}`}
          tone={summary.overdue_paise > 0 ? "bad" : "default"}
        />
        <Stat label="Collected this month" value={formatINR(summary.collected_month_paise)} tone="good" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="overdue-h">
          <SectionTitle>
            <span id="overdue-h">Overdue</span>
          </SectionTitle>
          {overdue.length === 0 ? (
            <EmptyState title="Nothing overdue" hint="Every due date so far has been settled." />
          ) : (
            <Card className="py-1">
              <ul className="divide-y divide-line">
                {overdue.map((p) => (
                  <PeriodRow key={p.id} p={p} today={today} showPay />
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section aria-labelledby="soon-h">
          <SectionTitle>
            <span id="soon-h">Due in the next 7 days</span>
          </SectionTitle>
          {dueSoon.length === 0 ? (
            <EmptyState title="No fees due this week" hint="Upcoming periods appear here a week before they're due." />
          ) : (
            <Card className="py-1">
              <ul className="divide-y divide-line">
                {dueSoon.map((p) => (
                  <PeriodRow key={p.id} p={p} today={today} showPay />
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
