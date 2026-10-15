import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generatePeriods,
  generationHorizon,
  planBillingChange,
  type BillingChangePlan,
  type ExistingPeriod,
  type PeriodDraft,
  type PlanCode,
} from "@/lib/billing";
import type { DateOnly } from "@/lib/dates";
import type { Database, MemberOverviewRow, PeriodJson, PlanRow } from "@/lib/db/types";

type Client = SupabaseClient<Database>;

export function toPeriodJson(d: PeriodDraft): PeriodJson {
  return {
    period_start: d.periodStart,
    period_end_exclusive: d.periodEndExclusive,
    due_on: d.dueOn,
    plan_code_snapshot: d.planCodeSnapshot,
    duration_months_snapshot: d.durationMonthsSnapshot,
    amount_due_paise: d.amountDuePaise,
  };
}

/**
 * Make sure every billing period up to today + lead days exists for one member.
 * Safe to call any number of times, concurrently: the database creates each
 * member-period at most once and ignores periods an admin cancelled on purpose.
 */
export async function ensureMemberPeriods(
  client: Client,
  member: Pick<MemberOverviewRow, "id" | "plan_code" | "billing_anchor_on" | "agreed_price_paise">,
  today: DateOnly,
): Promise<number> {
  const drafts = generatePeriods({
    anchor: member.billing_anchor_on,
    planCode: member.plan_code,
    amountPaise: member.agreed_price_paise,
    horizon: generationHorizon(today),
  });
  if (drafts.length === 0) return 0;
  const { data, error } = await client.rpc("ensure_billing_periods", {
    p_member_id: member.id,
    p_periods: drafts.map(toPeriodJson),
  });
  if (error) throw new Error(`ensure_billing_periods failed: ${error.message}`);
  return data ?? 0;
}

/** Daily reconciliation across all active members. Idempotent. */
export async function reconcileBilling(client: Client, today: DateOnly) {
  const { data: members, error } = await client
    .from("member_overview")
    .select("id, plan_code, billing_anchor_on, agreed_price_paise")
    .eq("status", "active");
  if (error) throw new Error(`Could not load members: ${error.message}`);

  let created = 0;
  let failures = 0;
  for (const m of members ?? []) {
    try {
      created += await ensureMemberPeriods(client, m, today);
    } catch (e) {
      failures += 1;
      console.error("reconcile failed for a member", { memberId: m.id, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return { members: members?.length ?? 0, created, failures };
}

export async function loadExistingPeriods(client: Client, memberId: string): Promise<ExistingPeriod[]> {
  const { data, error } = await client
    .from("billing_period_summary")
    .select("id, period_start, period_end_exclusive, due_on, amount_due_paise, paid_paise")
    .eq("member_id", memberId)
    .neq("status", "cancelled")
    .order("period_start");
  if (error) throw new Error(`Could not load billing periods: ${error.message}`);
  return (data ?? []).map((p) => ({
    id: p.id,
    periodStart: p.period_start,
    periodEndExclusive: p.period_end_exclusive,
    dueOn: p.due_on,
    amountDuePaise: p.amount_due_paise,
    paidPaise: p.paid_paise,
  }));
}

export interface BillingChangeInput {
  memberId: string;
  effectiveOn: DateOnly;
  requestedAnchor: DateOnly | null;
  plan: PlanRow;
  agreedPricePaise: number;
  today: DateOnly;
}

export async function computeBillingChange(client: Client, input: BillingChangeInput): Promise<BillingChangePlan> {
  const existing = await loadExistingPeriods(client, input.memberId);
  return planBillingChange({
    existing,
    effectiveOn: input.effectiveOn,
    requestedAnchor: input.requestedAnchor,
    newPlanCode: input.plan.code as PlanCode,
    newAmountPaise: input.agreedPricePaise,
    today: input.today,
  });
}
