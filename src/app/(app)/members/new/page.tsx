import { createMemberAction } from "@/app/actions/members";
import { CreateMemberForm } from "@/components/member-form";
import { PageHeader } from "@/components/ui/card";
import { todayInTimeZone } from "@/lib/dates";
import { aadhaarConfigured } from "@/server/aadhaar";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { getPlans } from "@/server/queries";

export const metadata = { title: "Add member" };
export const dynamic = "force-dynamic";

export default async function NewMemberPage() {
  const { supabase } = await requireAdmin();
  const settings = await getGymSettings();
  const plans = await getPlans(supabase);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Add member" />
      <CreateMemberForm
        action={createMemberAction}
        today={todayInTimeZone(settings.timezone)}
        aadhaarEnabled={aadhaarConfigured()}
        plans={plans.map((p) => ({ code: p.code, name: p.name, durationMonths: p.duration_months, listPricePaise: p.list_price_paise }))}
      />
    </div>
  );
}
