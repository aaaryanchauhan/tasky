import { NextResponse, type NextRequest } from "next/server";
import { todayInTimeZone } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileBilling } from "@/server/billing";
import { processDueJobs, queueReminders } from "@/server/reminders";
import { safeEqual } from "@/server/whatsapp/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily scheduler (Vercel Cron → 03:30 UTC ≈ 09:00 Asia/Kolkata). Idempotent end to end:
 * re-running it, or running two copies at once, cannot create duplicate periods or messages.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: an unconfigured scheduler endpoint must never be open.
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  const bearer = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  if (!safeEqual(bearer, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const admin = createAdminClient();
    const { data: settings, error } = await admin.from("gym_settings").select("*").eq("id", 1).single();
    if (error || !settings) throw new Error("gym settings unavailable");
    const today = todayInTimeZone(settings.timezone);

    // 1. Billing runs regardless of the WhatsApp switch: dues must exist either way.
    const billing = await reconcileBilling(admin, today);

    // 2. Reminders only when the owner has switched automation on.
    let queue = { considered: 0, queued: 0 };
    if (settings.reminders_enabled) queue = await queueReminders(admin, today);
    const sending = await processDueJobs(admin, settings);

    const result = { ok: true, today, remindersEnabled: settings.reminders_enabled, billing, queue, sending, ms: Date.now() - startedAt };
    console.info("cron.daily", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (e) {
    console.error("cron.daily failed", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ ok: false, error: "Scheduler run failed; see server logs" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
