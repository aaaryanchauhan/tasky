import { notFound } from "next/navigation";
import { updateMemberAction } from "@/app/actions/members";
import { EditMemberForm } from "@/components/member-form";
import { PageHeader } from "@/components/ui/card";
import { hasValidConsent } from "@/lib/reminders";
import { aadhaarConfigured, getAadhaarLast4 } from "@/server/aadhaar";
import { requireAdmin } from "@/server/auth";
import { signedPhotoUrls } from "@/server/photos";

export const metadata = { title: "Edit member" };
export const dynamic = "force-dynamic";

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: m } = await supabase.from("members").select("*").eq("id", id).maybeSingle();
  if (!m || m.status === "archived") notFound();

  const photoUrl = m.photo_path ? ((await signedPhotoUrls(supabase, [m.photo_path])).get(m.photo_path) ?? null) : null;

  const aadhaarLast4 = await getAadhaarLast4(supabase, m.id);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Edit member" subtitle={m.full_name} />
      <EditMemberForm
        memberId={m.id}
        photoUrl={photoUrl}
        aadhaarEnabled={aadhaarConfigured()}
        aadhaarLast4={aadhaarLast4}
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
