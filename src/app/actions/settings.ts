"use server";

import { revalidatePath } from "next/cache";
import { formatDateIN, todayInTimeZone } from "@/lib/dates";
import { formatRupeesPlain } from "@/lib/money";
import { TEMPLATE_NAMES } from "@/lib/reminders";
import { testSendAllowed, whatsappEnvStatus } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors, formToObject, gymSchema, planPriceSchema, testSendSchema } from "@/lib/validation";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { retryJob } from "@/server/reminders";
import { checkConnection, sendTemplateMessage, type ConnectionReport } from "@/server/whatsapp/graph";
import { audit, dbErrorMessage, fail, succeed, type ActionState } from "./shared";
import { z } from "zod";

export async function updatePlanPriceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin();
  const raw = formToObject(formData);
  const parsed = planPriceSchema.safeParse(raw);
  if (!parsed.success) return fail("Enter a valid price.", { fieldErrors: fieldErrors(parsed.error), values: raw });

  const { data: before } = await supabase.from("membership_plans").select("*").eq("id", parsed.data.planId).single();
  const { data, error } = await supabase
    .from("membership_plans")
    .update({ list_price_paise: parsed.data.price })
    .eq("id", parsed.data.planId)
    .select("name")
    .single();
  if (error || !data) return fail(error ? dbErrorMessage(error) : "Plan not found.", { values: raw });

  await audit(supabase, user.id, "membership_plan", parsed.data.planId, "price_changed",
    { list_price_paise: before?.list_price_paise ?? null }, { list_price_paise: parsed.data.price });
  revalidatePath("/", "layout");
  return succeed(`${data.name} price saved — applies to new assignments only`);
}

export async function updateGymAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin();
  const raw = formToObject(formData);
  const parsed = gymSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", { fieldErrors: fieldErrors(parsed.error), values: raw });

  const { error } = await supabase
    .from("gym_settings")
    .update({ gym_name: parsed.data.gymName, timezone: parsed.data.timezone })
    .eq("id", 1);
  if (error) return fail(dbErrorMessage(error), { values: raw });
  await audit(supabase, user.id, "gym_settings", null, "updated", null, parsed.data);
  revalidatePath("/", "layout");
  return succeed("Gym details saved");
}

export async function setRemindersAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin();
  const enable = formData.get("enabled") === "true";

  if (enable) {
    const env = whatsappEnvStatus();
    const missing = [
      !env.accessToken && "WHATSAPP_ACCESS_TOKEN",
      !env.phoneNumberId && "WHATSAPP_PHONE_NUMBER_ID",
      !env.appSecret && "WHATSAPP_APP_SECRET",
      !env.webhookVerifyToken && "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      !env.cronSecret && "CRON_SECRET",
      !env.serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean);
    if (missing.length) {
      return fail(`Can't enable yet — server is missing: ${missing.join(", ")}.`);
    }
  }
  const { error } = await supabase.from("gym_settings").update({ reminders_enabled: enable }).eq("id", 1);
  if (error) return fail(dbErrorMessage(error));
  await audit(supabase, user.id, "gym_settings", null, enable ? "reminders_enabled" : "reminders_disabled", null, { enabled: enable });
  revalidatePath("/", "layout");
  return succeed(enable ? "Automatic reminders are ON" : "Automatic reminders are OFF");
}

export async function testSendAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin();
  if (!testSendAllowed()) {
    return fail("Test sends are disabled in production. Set WHATSAPP_ALLOW_TEST_SEND=true to allow them temporarily.");
  }
  const raw = formToObject(formData);
  const parsed = testSendSchema.safeParse(raw);
  if (!parsed.success) return fail("Enter a valid Indian mobile number.", { fieldErrors: fieldErrors(parsed.error), values: raw });

  const settings = await getGymSettings();
  const today = todayInTimeZone(settings.timezone);
  const outcome = await sendTemplateMessage({
    toE164: parsed.data.phone,
    templateName: TEMPLATE_NAMES.before_due,
    variables: ["Test", formatRupeesPlain(100_000), formatDateIN(today)],
  });
  await audit(supabase, user.id, "whatsapp_test", null, "test_send", null, { outcome: outcome.kind });

  if (outcome.kind === "accepted") {
    return succeed("Meta accepted the test message. Delivery is confirmed separately by webhook.");
  }
  if (outcome.kind === "ambiguous") return fail(`Outcome unknown: ${outcome.message}`, { values: raw });
  return fail(`Meta rejected the message: ${outcome.message}`, { values: raw });
}

export async function checkWhatsAppAction(): Promise<ConnectionReport> {
  await requireAdmin();
  return checkConnection(Object.values(TEMPLATE_NAMES));
}

const retrySchema = z.object({
  jobId: z.uuid(),
  confirmAmbiguous: z.string().optional(),
});

export async function retryReminderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = retrySchema.safeParse(formToObject(formData));
  if (!parsed.success) return fail("Invalid request.");
  const settings = await getGymSettings();
  const result = await retryJob(createAdminClient(), parsed.data.jobId, settings, {
    confirmAmbiguous: parsed.data.confirmAmbiguous === "on",
  });
  revalidatePath("/", "layout");
  if (!result.ok) return fail(result.error);
  return succeed(
    result.state === "submitted" ? "Reminder submitted to WhatsApp" : `Retry finished — status: ${result.state}`,
  );
}
