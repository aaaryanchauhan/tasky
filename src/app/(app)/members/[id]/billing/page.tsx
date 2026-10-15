import { notFound } from "next/navigation";
import { billingChangeAction } from "@/app/actions/members";
import { BillingChangeForm } from "@/components/billing-change-form";
import { PageHeader } from "@/components/ui/card";
import { todayInTimeZone } from "@/lib/dates";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { getPlans } from "@/server/queries";

export const metadata = { title: "Change plan, fee or due date" };
export const dynamic = "force-dynamic";

export default async function BillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const settings = await getGymSettings();
  const [{ data: member }, plans] = await Promise.all([
    supabase.from("member_overview").select("id, full_name, status, plan_code, agreed_price_paise").eq("id", id).maybeSingle(),
    getPlans(supabase),
  ]);
  if (!member || member.status === "archived") notFound();
  const reactivate = member.status === "inactive";

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={reactivate ? "Reactivate member" : "Plan, fee & due date"}
        subtitle={member.full_name}
      />
      <BillingChangeForm
        action={billingChangeAction.bind(null, member.id)}
        memberId={member.id}
        today={todayInTimeZone(settings.timezone)}
        reactivate={reactivate}
        current={{ planCode: member.plan_code, pricePaise: member.agreed_price_paise }}
        plans={plans.map((p) => ({ code: p.code, name: p.name, durationMonths: p.duration_months, listPricePaise: p.list_price_paise }))}
      />
    </div>
  );
}
