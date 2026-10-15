"use server";

import { revalidatePath } from "next/cache";
import { compareDates, todayInTimeZone } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cancelPeriodSchema, fieldErrors, formToObject, paymentSchema, voidSchema } from "@/lib/validation";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { dbErrorMessage, fail, succeed, type ActionState } from "./shared";

export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const raw = formToObject(formData);
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", { fieldErrors: fieldErrors(parsed.error), values: raw });
  const v = parsed.data;

  const settings = await getGymSettings();
  if (compareDates(v.paidOn, todayInTimeZone(settings.timezone)) > 0) {
    return fail("Please fix the highlighted fields.", { fieldErrors: { paidOn: "Payment date can't be in the future" }, values: raw });
  }

  const { data, error } = await supabase.rpc("record_payment", {
    p_period_id: v.periodId,
    p_amount_paise: v.amount,
    p_paid_on: v.paidOn,
    p_method: v.method,
    p_reference: v.reference,
    p_notes: v.notes,
    p_idempotency_key: v.idempotencyKey,
  });
  if (error || !data) return fail(error ? dbErrorMessage(error) : "Could not record the payment.", { values: raw });

  revalidatePath("/", "layout");
  const left = data.outstanding_paise;
  return succeed(
    data.duplicate
      ? "That payment was already recorded."
      : left === 0
        ? `Recorded ${formatINR(v.amount)} — fully paid`
        : `Recorded ${formatINR(v.amount)} — ${formatINR(left)} still due`,
  );
}

export async function voidPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const raw = formToObject(formData);
  const parsed = voidSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", { fieldErrors: fieldErrors(parsed.error), values: raw });

  const { data, error } = await supabase.rpc("void_payment", {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
  });
  if (error || !data) return fail(error ? dbErrorMessage(error) : "Could not reverse the payment.", { values: raw });

  revalidatePath("/", "layout");
  return succeed(`Payment reversed — ${formatINR(data.outstanding_paise)} now outstanding`);
}

export async function cancelPeriodAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const raw = formToObject(formData);
  const parsed = cancelPeriodSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", { fieldErrors: fieldErrors(parsed.error), values: raw });

  const { error } = await supabase.rpc("cancel_billing_period", {
    p_period_id: parsed.data.periodId,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(dbErrorMessage(error), { values: raw });

  revalidatePath("/", "layout");
  return succeed("Billing period cancelled");
}
