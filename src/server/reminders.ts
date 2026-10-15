import "server-only";
import { addDays, todayInTimeZone, type DateOnly } from "@/lib/dates";
import type { AdminClient } from "@/lib/supabase/admin";
import type { GymSettingsRow, MessageJobRow } from "@/lib/db/types";
import {
  QUEUE_GRACE_DAYS,
  TEMPLATE_NAMES,
  evaluateSend,
  kindsToQueue,
  templateVariables,
  type SkipReason,
} from "@/lib/reminders";
import { sendTemplateMessage } from "./whatsapp/graph";
import { isConfigurationError, type SendOutcome } from "./whatsapp/outcome";

/** Total send attempts for definite, transient (rate-limit style) rejections. */
export const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = [30, 120];

// ── Queueing ───────────────────────────────────────────────────────────────

/**
 * Create reminder jobs for today. `unique (billing_period_id, kind)` guarantees at most one
 * job per period and template, so concurrent or repeated runs cannot double-queue.
 */
export async function queueReminders(admin: AdminClient, today: DateOnly) {
  const { data: rows, error } = await admin
    .from("billing_period_summary")
    .select("id, member_id, member_phone, due_on")
    .eq("member_status", "active")
    .gt("outstanding_paise", 0)
    .gte("due_on", addDays(today, -(3 + QUEUE_GRACE_DAYS)))
    .lte("due_on", addDays(today, 1));
  if (error) throw new Error(`Could not load periods: ${error.message}`);

  let queued = 0;
  for (const row of rows ?? []) {
    for (const kind of kindsToQueue(today, row.due_on)) {
      const { data, error: insertError } = await admin
        .from("message_jobs")
        .upsert(
          {
            billing_period_id: row.id,
            member_id: row.member_id,
            kind,
            scheduled_for: today,
            to_e164: row.member_phone,
          },
          { onConflict: "billing_period_id,kind", ignoreDuplicates: true },
        )
        .select("id");
      if (insertError) throw new Error(`Could not queue reminder: ${insertError.message}`);
      queued += data?.length ?? 0;
    }
  }
  return { considered: rows?.length ?? 0, queued };
}

// ── Sending ────────────────────────────────────────────────────────────────

async function logEvent(admin: AdminClient, job: MessageJobRow, eventType: string, payload: Record<string, unknown> = {}) {
  await admin.from("message_events").insert({
    message_job_id: job.id,
    meta_message_id: job.meta_message_id,
    event_type: eventType,
    safe_payload: payload as never,
  });
}

async function skipJob(admin: AdminClient, job: MessageJobRow, reason: SkipReason) {
  await admin
    .from("message_jobs")
    .update({ state: "skipped", skip_reason: reason })
    .eq("id", job.id)
    .eq("state", "claimed");
  await logEvent(admin, job, "skipped", { reason });
}

async function applyOutcome(admin: AdminClient, job: MessageJobRow, outcome: SendOutcome) {
  if (outcome.kind === "accepted") {
    await admin
      .from("message_jobs")
      .update({
        state: "submitted",
        meta_message_id: outcome.messageId,
        sent_at: new Date().toISOString(),
        error_kind: null,
        last_error: null,
        skip_reason: null,
      })
      .eq("id", job.id)
      .eq("state", "claimed");
    await logEvent(admin, { ...job, meta_message_id: outcome.messageId }, "submitted");
    return;
  }

  if (outcome.kind === "ambiguous") {
    // We don't know whether Meta sent it. Park it for a human; never auto-resend.
    await admin
      .from("message_jobs")
      .update({ state: "failed", error_kind: "ambiguous", last_error: outcome.message })
      .eq("id", job.id)
      .eq("state", "claimed");
    await logEvent(admin, job, "failed", { kind: "ambiguous", message: outcome.message });
    return;
  }

  // Definite rejection: nothing was sent.
  const canRetry = outcome.transient && job.attempt_count < MAX_ATTEMPTS && !isConfigurationError(outcome.code);
  if (canRetry) {
    const waitMin = BACKOFF_MINUTES[Math.min(job.attempt_count - 1, BACKOFF_MINUTES.length - 1)] ?? 120;
    await admin
      .from("message_jobs")
      .update({
        state: "pending",
        error_kind: "transient",
        last_error: outcome.message,
        next_attempt_at: new Date(Date.now() + waitMin * 60_000).toISOString(),
      })
      .eq("id", job.id)
      .eq("state", "claimed");
    await logEvent(admin, job, "retry_scheduled", { code: outcome.code, in_minutes: waitMin });
    return;
  }
  await admin
    .from("message_jobs")
    .update({ state: "failed", error_kind: outcome.transient ? "transient" : "permanent", last_error: outcome.message })
    .eq("id", job.id)
    .eq("state", "claimed");
  await logEvent(admin, job, "failed", { kind: outcome.transient ? "transient" : "permanent", code: outcome.code });
}

/**
 * Process one *claimed* job. Everything is re-read from the database first: consent, status,
 * phone and the current balance may all have changed since the job was queued.
 */
export async function processClaimedJob(admin: AdminClient, job: MessageJobRow, settings: GymSettingsRow, now = new Date()) {
  const today = todayInTimeZone(settings.timezone, now);
  const [{ data: member }, { data: period }] = await Promise.all([
    admin.from("members").select("*").eq("id", job.member_id).single(),
    admin.from("billing_period_summary").select("*").eq("id", job.billing_period_id).single(),
  ]);
  if (!member || !period) {
    await skipJob(admin, job, "period_cancelled");
    return "skipped" as const;
  }

  const verdict = evaluateSend({
    remindersEnabled: settings.reminders_enabled,
    today,
    job: { kind: job.kind, scheduledFor: job.scheduled_for, toE164: job.to_e164 },
    member: {
      status: member.status,
      whatsappE164: member.whatsapp_e164,
      whatsappOptInAt: member.whatsapp_opt_in_at,
      whatsappOptOutAt: member.whatsapp_opt_out_at,
    },
    period: {
      cancelled: period.status === "cancelled",
      outstandingPaise: period.outstanding_paise,
      dueOn: period.due_on,
    },
  });
  if (!verdict.ok) {
    await skipJob(admin, job, verdict.reason);
    return "skipped" as const;
  }

  const outcome = await sendTemplateMessage({
    toE164: job.to_e164,
    templateName: TEMPLATE_NAMES[job.kind],
    variables: templateVariables({
      fullName: member.full_name,
      outstandingPaise: period.outstanding_paise,
      dueOn: period.due_on,
    }),
  });
  await applyOutcome(admin, job, outcome);
  return outcome.kind;
}

/** Claim and process every job that is due. Concurrent runs each claim disjoint jobs. */
export async function processDueJobs(admin: AdminClient, settings: GymSettingsRow, maxJobs = 200) {
  const { data: recovered } = await admin.rpc("recover_stale_claims");
  const stats = { processed: 0, submitted: 0, skipped: 0, failed: 0, retryLater: 0, recoveredStale: recovered ?? 0 };
  while (stats.processed < maxJobs) {
    const { data: jobs, error } = await admin.rpc("claim_message_jobs", { p_limit: 25 });
    if (error) throw new Error(`claim failed: ${error.message}`);
    if (!jobs || jobs.length === 0) break;
    for (const job of jobs) {
      stats.processed += 1;
      try {
        const result = await processClaimedJob(admin, job, settings);
        if (result === "accepted") stats.submitted += 1;
        else if (result === "skipped") stats.skipped += 1;
        else if (result === "rejected") stats.retryLater += 1;
        else stats.failed += 1;
      } catch (e) {
        // Unexpected crash mid-send: leave 'claimed' so recover_stale_claims marks it ambiguous.
        stats.failed += 1;
        console.error("job processing crashed", { jobId: job.id, error: e instanceof Error ? e.message : "unknown" });
      }
    }
  }
  return stats;
}

// ── Manual retry & cancellation ────────────────────────────────────────────

export type RetryResult = { ok: true; state: string } | { ok: false; error: string };

export async function retryJob(
  admin: AdminClient,
  jobId: string,
  settings: GymSettingsRow,
  opts: { confirmAmbiguous: boolean },
): Promise<RetryResult> {
  const { data: job } = await admin.from("message_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: "Reminder not found" };
  if (job.state !== "failed" && job.state !== "skipped") {
    return { ok: false, error: "Only failed or skipped reminders can be retried" };
  }
  if (job.error_kind === "ambiguous" && !opts.confirmAmbiguous) {
    return {
      ok: false,
      error:
        "The outcome of the earlier attempt is unknown — it may already have reached the member. Check the member's WhatsApp, then confirm to resend.",
    };
  }
  const today = todayInTimeZone(settings.timezone);
  const { error } = await admin
    .from("message_jobs")
    .update({
      state: "pending",
      next_attempt_at: new Date().toISOString(),
      error_kind: null,
      last_error: null,
      skip_reason: null,
      scheduled_for: job.kind === "overdue" ? today : job.scheduled_for,
    })
    .eq("id", jobId)
    .in("state", ["failed", "skipped"]);
  if (error) return { ok: false, error: "Could not reset the reminder" };
  await logEvent(admin, job, "manual_retry");

  const { data: claimed } = await admin.rpc("claim_message_job", { p_job_id: jobId });
  const claimedJob = claimed?.[0];
  if (!claimedJob) return { ok: true, state: "pending" };
  await processClaimedJob(admin, claimedJob, settings);
  const { data: after } = await admin.from("message_jobs").select("state").eq("id", jobId).single();
  return { ok: true, state: after?.state ?? "unknown" };
}

/** Stop queued reminders for a member (phone changed, opted out, …). */
export async function skipPendingJobsForMember(admin: AdminClient, memberId: string, reason: SkipReason) {
  await admin
    .from("message_jobs")
    .update({ state: "skipped", skip_reason: reason })
    .eq("member_id", memberId)
    .eq("state", "pending");
}
