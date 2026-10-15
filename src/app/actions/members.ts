"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { compareDates, formatDateIN, todayInTimeZone } from "@/lib/dates";
import { planDeactivation } from "@/lib/billing";
import {
  billingChangeSchema,
  fieldErrors,
  formToObject,
  memberCreateSchema,
  memberEditSchema,
  statusChangeSchema,
} from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { computeBillingChange, ensureMemberPeriods, loadExistingPeriods, toPeriodJson } from "@/server/billing";
import { removeMemberPhoto, saveMemberPhoto } from "@/server/photos";
import { skipPendingJobsForMember } from "@/server/reminders";
import { hasValidConsent } from "@/lib/reminders";
import { aadhaarConfigured, clearAadhaar, getAadhaarLast4, saveAadhaar } from "@/server/aadhaar";
import { audit, dbErrorMessage, fail, flashUrl, succeed, withoutSecrets, type ActionState } from "./shared";
import type { MemberRow, PlanRow } from "@/lib/db/types";
import type { PlanCode } from "@/lib/billing";

async function planByCode(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], code: string) {
  const planCode = code as PlanCode;
  const { data } = await supabase.from("membership_plans").select("*").eq("code", planCode).single();
  return data as PlanRow | null;
}

export async function createMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin();
  const raw = formToObject(formData);
  const echo = withoutSecrets(raw);
  const parsed = memberCreateSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", { fieldErrors: fieldErrors(parsed.error), values: echo });
  const v = parsed.data;
  if (v.aadhaar && !aadhaarConfigured()) {
    return fail("Please fix the highlighted fields.", {
      fieldErrors: { aadhaar: "Aadhaar storage isn't set up on the server yet (AADHAAR_ENCRYPTION_KEY)." },
      values: echo,
    });
  }

  const plan = await planByCode(supabase, v.planCode);
  if (!plan) return fail("That plan doesn't exist.", { values: echo });
  const settings = await getGymSettings();
  const today = todayInTimeZone(settings.timezone);

  const optInAt = v.consent ? new Date().toISOString() : null;
  const { data: member, error } = await supabase
    .from("members")
    .insert({
      full_name: v.fullName,
      whatsapp_e164: v.phone,
      alternate_contact: v.alternateContact,
      joined_on: v.joinedOn,
      plan_id: plan.id,
      agreed_price_paise: v.agreedPrice,
      first_due_on: v.firstDueOn,
      billing_anchor_on: v.firstDueOn,
      whatsapp_opt_in_at: optInAt,
      whatsapp_opt_in_source: v.consent ? v.consentSource : null,
      notes: v.notes,
    })
    .select("id")
    .single();
  if (error || !member) return fail(error ? dbErrorMessage(error) : "Could not save the member.", { values: echo });

  await audit(supabase, user.id, "member", member.id, "created", null, {
    plan: v.planCode,
    agreed_price_paise: v.agreedPrice,
    first_due_on: v.firstDueOn,
    consent: v.consent,
  });

  let flash = "Member added";
  if (v.aadhaar) {
    const saved = await saveAadhaar(supabase, member.id, v.aadhaar);
    if (saved.ok) await audit(supabase, user.id, "member", member.id, "aadhaar_set", null, { aadhaar: "set" });
    else flash = `Member added — Aadhaar not saved: ${saved.error}`;
  }
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const saved = await saveMemberPhoto(supabase, member.id, photo, null);
    if (!saved.ok) flash = `Member added — photo not saved: ${saved.error}`;
  }
  try {
    await ensureMemberPeriods(
      supabase,
      { id: member.id, plan_code: plan.code, billing_anchor_on: v.firstDueOn, agreed_price_paise: v.agreedPrice },
      today,
    );
  } catch {
    flash = `${flash} — billing periods will be created by the next daily run`;
  }
  revalidatePath("/", "layout");
  redirect(flashUrl(`/members/${member.id}`, flash));
}

export async function updateMemberAction(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin();
  const raw = formToObject(formData);
  const echo = withoutSecrets(raw);
  const parsed = memberEditSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", { fieldErrors: fieldErrors(parsed.error), values: echo });
  const v = parsed.data;
  if (v.aadhaar && !aadhaarConfigured()) {
    return fail("Please fix the highlighted fields.", {
      fieldErrors: { aadhaar: "Aadhaar storage isn't set up on the server yet (AADHAAR_ENCRYPTION_KEY)." },
      values: echo,
    });
  }

  const { data: current } = await supabase.from("members").select("*").eq("id", memberId).single();
  if (!current) return fail("Member not found.");
  if (current.status === "archived") return fail("Archived members can't be edited.");

  const phoneChanged = current.whatsapp_e164 !== v.phone;
  const hadConsent = hasValidConsent({
    whatsappOptInAt: current.whatsapp_opt_in_at,
    whatsappOptOutAt: current.whatsapp_opt_out_at,
  });
  const now = new Date().toISOString();

  const patch: Omit<Partial<MemberRow>, "billing_anchor_day"> = {
    full_name: v.fullName,
    whatsapp_e164: v.phone,
    alternate_contact: v.alternateContact,
    joined_on: v.joinedOn,
    notes: v.notes,
  };
  if (phoneChanged) {
    // A new number needs fresh consent: it may belong to someone who never agreed.
    patch.whatsapp_opt_in_at = v.consent ? now : null;
    patch.whatsapp_opt_in_source = v.consent ? v.consentSource : null;
    patch.whatsapp_opt_out_at = null;
  } else if (v.consent && !hadConsent) {
    patch.whatsapp_opt_in_at = now;
    patch.whatsapp_opt_in_source = v.consentSource;
  } else if (!v.consent && hadConsent) {
    patch.whatsapp_opt_out_at = now;
  }

  const { error } = await supabase.from("members").update(patch).eq("id", memberId);
  if (error) return fail(dbErrorMessage(error), { values: echo });

  const consentChanged = phoneChanged || v.consent !== hadConsent;
  await audit(supabase, user.id, "member", memberId, "updated", {
    full_name: current.full_name,
    whatsapp_e164: current.whatsapp_e164,
    joined_on: current.joined_on,
    consent: hadConsent,
  }, { full_name: v.fullName, whatsapp_e164: v.phone, joined_on: v.joinedOn, consent: v.consent });

  let photoNote = "";
  if (v.aadhaar) {
    const saved = await saveAadhaar(supabase, memberId, v.aadhaar);
    if (saved.ok) await audit(supabase, user.id, "member", memberId, "aadhaar_set", null, { aadhaar: "set" });
    else photoNote += ` — Aadhaar not saved: ${saved.error}`;
  } else if (formData.get("removeAadhaar") === "on") {
    const cleared = await clearAadhaar(supabase, memberId);
    if (cleared.ok) await audit(supabase, user.id, "member", memberId, "aadhaar_removed", null, { aadhaar: "removed" });
    else photoNote += ` — Aadhaar not removed: ${cleared.error}`;
  }
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const saved = await saveMemberPhoto(supabase, memberId, photo, current.photo_path);
    if (!saved.ok) photoNote += ` — photo not saved: ${saved.error}`;
  } else if (formData.get("removePhoto") === "on" && current.photo_path) {
    await removeMemberPhoto(supabase, memberId, current.photo_path);
  }

  if (phoneChanged || (consentChanged && !v.consent)) {
    // Anything queued for the old number / withdrawn consent must not go out.
    await skipPendingJobsForMember(createAdminClient(), memberId, phoneChanged ? "phone_changed" : "opted_out");
  }
  revalidatePath("/", "layout");
  redirect(flashUrl(`/members/${memberId}`, `Member updated${photoNote}`));
}

/** Serialisable preview shown before any billing change is applied. */
export interface BillingPreview {
  cancel: { periodStart: string; dueOn: string; amountDuePaise: number }[];
  keepCount: number;
  create: { periodStart: string; periodEndExclusive: string; amountDuePaise: number }[];
  newAnchor: string;
  warnings: string[];
}

export async function billingChangeAction(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const raw = formToObject(formData);
  const parsed = billingChangeSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", { fieldErrors: fieldErrors(parsed.error), values: raw });
  const v = parsed.data;

  const { data: member } = await supabase.from("members").select("*").eq("id", memberId).single();
  if (!member) return fail("Member not found.");
  if (member.status === "archived") return fail("Archived members can't be changed.");
  const plan = await planByCode(supabase, v.planCode);
  if (!plan) return fail("That plan doesn't exist.", { values: raw });
  if (compareDates(v.effectiveOn, member.joined_on) < 0) {
    return fail("Please fix the highlighted fields.", { fieldErrors: { effectiveOn: "Can't be before the joining date" }, values: raw });
  }

  const settings = await getGymSettings();
  const today = todayInTimeZone(settings.timezone);
  const change = await computeBillingChange(supabase, {
    memberId,
    effectiveOn: v.effectiveOn,
    requestedAnchor: v.requestedAnchor,
    plan,
    agreedPricePaise: v.agreedPrice,
    today,
  });

  if (v.requestedAnchor && compareDates(v.requestedAnchor, change.minAnchor) < 0) {
    return fail(`The first due date can't be before ${formatDateIN(change.minAnchor)}.`, {
      fieldErrors: { requestedAnchor: `Earliest allowed is ${formatDateIN(change.minAnchor)}` },
      values: raw,
    });
  }

  if (v.intent === "preview") {
    const preview: BillingPreview = {
      cancel: change.cancel.map((p) => ({ periodStart: p.periodStart, dueOn: p.dueOn, amountDuePaise: p.amountDuePaise })),
      keepCount: change.keep.length,
      create: change.create.map((p) => ({
        periodStart: p.periodStart,
        periodEndExclusive: p.periodEndExclusive,
        amountDuePaise: p.amountDuePaise,
      })),
      newAnchor: change.newAnchor,
      warnings: change.warnings,
    };
    return succeed("Review the effect of this change before applying it.", { data: preview, values: raw });
  }

  const reactivate = member.status === "inactive";
  const { error } = await supabase.rpc("apply_billing_change", {
    p_member_id: memberId,
    p_plan_id: plan.id,
    p_agreed_price_paise: v.agreedPrice,
    p_new_anchor: change.newAnchor,
    p_cancel_ids: change.cancel.map((p) => p.id),
    p_new_periods: change.create.map(toPeriodJson),
    p_reactivate: reactivate,
  });
  if (error) return fail(dbErrorMessage(error), { values: raw });

  revalidatePath("/", "layout");
  redirect(flashUrl(`/members/${memberId}`, reactivate ? "Member reactivated" : "Billing terms updated"));
}

export async function changeStatusAction(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin();
  const raw = formToObject(formData);
  const parsed = statusChangeSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", { fieldErrors: fieldErrors(parsed.error), values: raw });

  const { data: before } = await supabase.from("members").select("photo_path").eq("id", memberId).maybeSingle();
  if (parsed.data.status === "archived") {
    // Retain only what's necessary. Delete the Aadhaar number *first* and refuse to archive if that
    // fails: archived members can't be edited, so a leftover number would have no way to be removed.
    const hadAadhaar = (await getAadhaarLast4(supabase, memberId)) !== null;
    const cleared = await clearAadhaar(supabase, memberId);
    if (!cleared.ok) return fail(`${cleared.error} The member was not archived.`, { values: raw });
    if (hadAadhaar) await audit(supabase, user.id, "member", memberId, "aadhaar_removed", null, { aadhaar: "removed on archive" });
  }
  const existing = await loadExistingPeriods(supabase, memberId);
  const cancelIds = planDeactivation(existing, parsed.data.effectiveOn).map((p) => p.id);
  const { error } = await supabase.rpc("set_member_status", {
    p_member_id: memberId,
    p_status: parsed.data.status,
    p_effective_on: parsed.data.effectiveOn,
    p_cancel_ids: cancelIds,
  });
  if (error) return fail(dbErrorMessage(error), { values: raw });

  // Retain only what's necessary: an archived member's photo is deleted (payment history stays).
  if (parsed.data.status === "archived" && before?.photo_path) await removeMemberPhoto(supabase, memberId, before.photo_path);

  revalidatePath("/", "layout");
  redirect(
    flashUrl(
      `/members/${memberId}`,
      `${parsed.data.status === "archived" ? "Member archived" : "Member deactivated"}${cancelIds.length ? ` · ${cancelIds.length} future unpaid period(s) cancelled` : ""}`,
    ),
  );
}

