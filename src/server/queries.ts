import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, type DateOnly } from "@/lib/dates";
import type {
  BillingPeriodSummaryRow,
  Database,
  MemberOverviewRow,
  JobState,
  MessageEventRow,
  MessageJobRow,
  PaymentRow,
  PlanRow,
} from "@/lib/db/types";

type Client = SupabaseClient<Database>;

export async function getDashboard(supabase: Client, today: DateOnly) {
  const [summary, dueSoon, overdue] = await Promise.all([
    supabase.rpc("dashboard_summary"),
    supabase
      .from("billing_period_summary")
      .select("*")
      .gt("outstanding_paise", 0)
      .gte("due_on", today)
      .lte("due_on", addDays(today, 7))
      .order("due_on")
      .limit(25),
    supabase.from("billing_period_summary").select("*").eq("is_overdue", true).order("days_overdue", { ascending: false }).limit(25),
  ]);
  if (summary.error || !summary.data) throw new Error(`Dashboard unavailable: ${summary.error?.message}`);
  const listError = dueSoon.error ?? overdue.error;
  if (listError) throw new Error(`Dashboard lists unavailable: ${listError.message}`);
  return {
    summary: summary.data,
    dueSoon: (dueSoon.data ?? []) as BillingPeriodSummaryRow[],
    overdue: (overdue.data ?? []) as BillingPeriodSummaryRow[],
  };
}

export type MemberFilter =
  | "all"
  | "active"
  | "inactive"
  | "archived"
  | "monthly"
  | "quarterly"
  | "annual"
  | "due_soon"
  | "overdue";

export const MEMBER_FILTERS: { value: MemberFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

export function parseFilter(value: string | undefined): MemberFilter {
  return MEMBER_FILTERS.some((f) => f.value === value) ? (value as MemberFilter) : "all";
}

/** Remove characters that have meaning inside a PostgREST `or=(…)` filter. */
function cleanSearch(q: string): string {
  return q.replace(/[,()%*\\"':;]/g, " ").trim().slice(0, 60);
}

export async function listMembers(supabase: Client, opts: { q?: string; filter: MemberFilter; today: DateOnly }) {
  let query = supabase.from("member_overview").select("*").order("full_name").limit(500);

  switch (opts.filter) {
    case "all":
      query = query.neq("status", "archived");
      break;
    case "active":
    case "inactive":
    case "archived":
      query = query.eq("status", opts.filter);
      break;
    case "monthly":
    case "quarterly":
    case "annual":
      query = query.eq("plan_code", opts.filter).neq("status", "archived");
      break;
    case "overdue":
      query = query.eq("focus_is_overdue", true);
      break;
    case "due_soon":
      query = query.gte("focus_due_on", opts.today).lte("focus_due_on", addDays(opts.today, 7));
      break;
  }

  const q = cleanSearch(opts.q ?? "");
  if (q) {
    const digits = q.replace(/\D/g, "");
    const clauses = [`full_name.ilike.%${q}%`];
    if (digits.length >= 3) clauses.push(`whatsapp_e164.ilike.%${digits}%`);
    query = query.or(clauses.join(","));
  }

  const { data, error } = await query;
  if (error) throw new Error(`Could not load members: ${error.message}`);
  return (data ?? []) as MemberOverviewRow[];
}

export async function getMemberDetail(supabase: Client, id: string) {
  const { data: member } = await supabase.from("member_overview").select("*").eq("id", id).maybeSingle();
  if (!member) return null;

  const { data: periods, error: periodsError } = await supabase
    .from("billing_period_summary")
    .select("*")
    .eq("member_id", id)
    .order("period_start", { ascending: false });
  if (periodsError) throw new Error(`Could not load billing periods: ${periodsError.message}`);
  const periodIds = (periods ?? []).map((p) => p.id);

  const [payments, jobs] = await Promise.all([
    periodIds.length
      ? supabase.from("payments").select("*").in("billing_period_id", periodIds).order("paid_on", { ascending: false }).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as PaymentRow[] }),
    supabase.from("message_jobs").select("*").eq("member_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  const detailError = ("error" in payments ? payments.error : null) ?? jobs.error;
  if (detailError) throw new Error(`Could not load member history: ${detailError.message}`);

  const jobIds = (jobs.data ?? []).map((j) => j.id);
  const events = jobIds.length
    ? await supabase.from("message_events").select("*").in("message_job_id", jobIds).order("event_at")
    : { data: [] as MessageEventRow[] };

  return {
    member: member as MemberOverviewRow,
    periods: (periods ?? []) as BillingPeriodSummaryRow[],
    payments: (payments.data ?? []) as PaymentRow[],
    jobs: (jobs.data ?? []) as MessageJobRow[],
    events: (events.data ?? []) as MessageEventRow[],
  };
}

export async function getPlans(supabase: Client): Promise<PlanRow[]> {
  const { data, error } = await supabase.from("membership_plans").select("*").order("duration_months");
  if (error) throw new Error(`Could not load plans: ${error.message}`);
  return data ?? [];
}

export async function listJobs(supabase: Client, opts: { state?: JobState }) {
  let q = supabase
    .from("message_jobs")
    .select("*, members(full_name), billing_periods(due_on, amount_due_paise)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (opts.state) q = q.eq("state", opts.state);
  const { data, error } = await q;
  // An unavailable list must surface as an error, never as a calm "no reminders" empty state.
  if (error) throw new Error(`Could not load reminders: ${error.message}`);
  return (data ?? []) as unknown as (MessageJobRow & {
    members: { full_name: string } | null;
    billing_periods: { due_on: string; amount_due_paise: number } | null;
  })[];
}
