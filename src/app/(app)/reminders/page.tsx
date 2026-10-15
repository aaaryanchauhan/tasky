import Link from "next/link";
import { RetryButton } from "@/components/retry-button";
import { JobStateBadge, KIND_LABEL, skipLabel } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { formatDateIN, formatTimestampIN } from "@/lib/dates";
import type { JobState } from "@/lib/db/types";
import { formatINR } from "@/lib/money";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { listJobs } from "@/server/queries";

export const metadata = { title: "Reminders" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
  { value: "pending", label: "Queued" },
  { value: "submitted", label: "Accepted" },
  { value: "delivered", label: "Delivered" },
  { value: "read", label: "Read" },
];

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const active = FILTERS.some((f) => f.value === state) ? (state ?? "") : "";
  const { supabase } = await requireAdmin();
  const settings = await getGymSettings();
  const jobs = await listJobs(supabase, { state: (active || undefined) as JobState | undefined });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reminders"
        subtitle="WhatsApp fee reminders: 1 day before the due date and 3 days after if unpaid."
        action={<Badge tone={settings.reminders_enabled ? "good" : "warn"}>Automation {settings.reminders_enabled ? "ON" : "OFF"}</Badge>}
      />

      {!settings.reminders_enabled ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Automatic reminders are off, so nothing is being queued or sent. Turn them on in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          once the WhatsApp setup is verified.
        </p>
      ) : null}

      <nav aria-label="Filter reminders" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2 pb-1">
          {FILTERS.map((f) => (
            <li key={f.value}>
              <Link
                href={f.value ? `/reminders?state=${f.value}` : "/reminders"}
                aria-current={f.value === active ? "true" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold ${f.value === active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:bg-stone-50"}`}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {jobs.length === 0 ? (
        <EmptyState title="No reminders to show" hint="They appear here once the daily job queues them." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/members/${j.member_id}`} className="block truncate font-bold hover:underline">
                      {j.members?.full_name ?? "Member"}
                    </Link>
                    <p className="text-sm text-ink-soft">
                      {KIND_LABEL[j.kind]}
                      {j.billing_periods ? ` · fee ${formatINR(j.billing_periods.amount_due_paise)} due ${formatDateIN(j.billing_periods.due_on)}` : ""}
                    </p>
                  </div>
                  <JobStateBadge state={j.state} />
                </div>
                <p className="text-sm text-ink-soft">
                  {j.sent_at ? `Sent ${formatTimestampIN(j.sent_at, settings.timezone)}` : `Scheduled ${formatDateIN(j.scheduled_for)}`}
                  {j.delivered_at ? ` · delivered ${formatTimestampIN(j.delivered_at, settings.timezone)}` : ""}
                  {j.read_at ? ` · read` : ""}
                  {` · ${j.attempt_count} attempt${j.attempt_count === 1 ? "" : "s"}`}
                </p>
                {j.state === "skipped" ? <p className="text-sm font-medium">Skipped: {skipLabel(j.skip_reason)}</p> : null}
                {j.last_error && (j.state === "failed" || j.state === "pending") ? (
                  <p className="text-sm font-medium text-red-700">
                    {j.error_kind === "ambiguous" ? "Outcome unknown: " : ""}
                    {j.last_error}
                  </p>
                ) : null}
                {j.state === "failed" || j.state === "skipped" ? <RetryButton jobId={j.id} ambiguous={j.error_kind === "ambiguous"} /> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
