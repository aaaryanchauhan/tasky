"use server";

import { z } from "zod";
import { formatAadhaar } from "@/lib/aadhaar";
import { readAadhaar } from "@/server/aadhaar";
import { requireAdmin } from "@/server/auth";

export type RevealResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Show a member's full Aadhaar number to a signed-in admin. Every reveal is written to the audit log
 * *before* the number is returned (if the log write fails, nothing is revealed). The log records who
 * and when — never the number itself.
 */
export async function revealAadhaarAction(memberId: string): Promise<RevealResult> {
  const { supabase, user } = await requireAdmin();
  const id = z.uuid().safeParse(memberId);
  if (!id.success) return { ok: false, error: "Invalid member." };

  const { error: auditError } = await supabase.from("audit_log").insert({
    actor_id: user.id,
    entity_type: "member",
    entity_id: id.data,
    action: "aadhaar_revealed",
  });
  if (auditError) return { ok: false, error: "Couldn't record this access, so the number wasn't shown." };

  const digits = await readAadhaar(supabase, id.data);
  if (!digits) return { ok: false, error: "The number couldn't be read." };
  return { ok: true, value: formatAadhaar(digits) };
}
