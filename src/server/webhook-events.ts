import "server-only";
import type { MessageJobRow } from "@/lib/db/types";
import type { AdminClient } from "@/lib/supabase/admin";
import { skipPendingJobsForMember } from "./reminders";
import {
  isOptOutText,
  nextStateForStatus,
  type ParsedWebhook,
  type StatusEvent,
} from "./whatsapp/webhook";

/** Record a delivery-status callback against its job. Idempotent for re-delivered webhooks. */
async function applyStatus(admin: AdminClient, ev: StatusEvent): Promise<"applied" | "duplicate" | "unmatched"> {
  const { data: job } = await admin
    .from("message_jobs")
    .select("id, state")
    .eq("meta_message_id", ev.messageId)
    .maybeSingle();
  if (!job) return "unmatched";

  const eventAt = new Date(ev.timestamp * 1000).toISOString();
  const { data: inserted, error } = await admin
    .from("message_events")
    .upsert(
      {
        message_job_id: job.id,
        meta_message_id: ev.messageId,
        event_type: ev.status,
        event_at: eventAt,
        safe_payload: { status: ev.status, error_code: ev.errorCode, error_title: ev.errorTitle } as never,
      },
      { onConflict: "message_job_id,event_type,event_at", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`Could not record event: ${error.message}`);
  if (!inserted || inserted.length === 0) return "duplicate";

  const next = nextStateForStatus(job.state, ev.status);
  if (next === job.state) return "applied";

  const patch: Partial<MessageJobRow> = { state: next };
  if (next === "delivered") patch.delivered_at = eventAt;
  if (next === "read") {
    patch.read_at = eventAt;
    patch.delivered_at = eventAt; // a read implies delivery; keep the timeline complete
  }
  if (next === "failed") {
    patch.error_kind = "permanent";
    patch.last_error = `${ev.errorCode ? `(${ev.errorCode}) ` : ""}${ev.errorTitle ?? "Delivery failed"}`.slice(0, 200);
  }
  // Conditional on the state we read, so two racing callbacks can't move a job backwards.
  await admin.from("message_jobs").update(patch).eq("id", job.id).eq("state", job.state);
  return "applied";
}

/** Honour a WhatsApp reply of STOP / UNSUBSCRIBE from a known member. */
async function applyInbound(admin: AdminClient, from: string, text: string): Promise<boolean> {
  if (!isOptOutText(text)) return false;
  const e164 = `+${from.replace(/^\+/, "")}`;
  const { data: members } = await admin
    .from("members")
    .select("id, whatsapp_opt_out_at")
    .eq("whatsapp_e164", e164)
    .neq("status", "archived");
  for (const m of members ?? []) {
    const now = new Date().toISOString();
    await admin.from("members").update({ whatsapp_opt_out_at: now }).eq("id", m.id);
    await skipPendingJobsForMember(admin, m.id, "opted_out");
    await admin.from("audit_log").insert({
      entity_type: "member",
      entity_id: m.id,
      action: "whatsapp_opt_out",
      after_json: { source: "whatsapp_reply", at: now },
    });
  }
  return (members?.length ?? 0) > 0;
}

export async function applyWebhook(admin: AdminClient, parsed: ParsedWebhook) {
  const summary = { applied: 0, duplicate: 0, unmatched: 0, optOuts: 0 };
  for (const s of parsed.statuses) summary[await applyStatus(admin, s)] += 1;
  for (const m of parsed.inbound) if (await applyInbound(admin, m.from, m.text)) summary.optOuts += 1;
  return summary;
}
