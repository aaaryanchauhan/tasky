import { notFound } from "next/navigation";
import { updateMemberAction } from "@/app/actions/members";
import { EditMemberForm } from "@/components/member-form";
import { PageHeader } from "@/components/ui/card";
import { hasValidConsent } from "@/lib/reminders";
import { requireAdmin } from "@/server/auth";

export const metadata = { title: "Edit member" };
export const dynamic = "force-dynamic";

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: m } = await supabase.from("members").select("*").eq("id", id).maybeSingle();
  if (!m || m.status === "archived") notFound();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Edit member" subtitle={m.full_name} />
      <EditMemberForm
        memberId={m.id}
        action={updateMemberAction.bind(null, m.id)}
        initial={{
          fullName: m.full_name,
          phone: m.whatsapp_e164,
          alternateContact: m.alternate_contact ?? "",
          joinedOn: m.joined_on,
          notes: m.notes ?? "",
          consent: hasValidConsent({ whatsappOptInAt: m.whatsapp_opt_in_at, whatsappOptOutAt: m.whatsapp_opt_out_at }),
          consentSource: m.whatsapp_opt_in_source ?? "",
        }}
      />
    </div>
  );
}
