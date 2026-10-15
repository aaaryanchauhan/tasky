import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyWebhook } from "@/server/webhook-events";
import { parseWebhook, safeEqual, verifySignature } from "@/server/whatsapp/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Meta's one-time endpoint verification handshake. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (
    params.get("hub.mode") === "subscribe" &&
    expected &&
    safeEqual(params.get("hub.verify_token"), expected)
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Delivery-status and inbound-message callbacks. Rejected unless correctly HMAC-signed. */
export async function POST(request: NextRequest) {
  const raw = await request.text(); // signature is over the exact raw bytes
  const valid = verifySignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET);
  if (!valid) return new NextResponse("Invalid signature", { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  try {
    const summary = await applyWebhook(createAdminClient(), parseWebhook(payload));
    console.info("whatsapp.webhook", JSON.stringify(summary));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("whatsapp.webhook failed", e instanceof Error ? e.message : "unknown error");
    // 500 → Meta retries delivery, which is what we want for a transient DB failure.
    return new NextResponse("Error", { status: 500 });
  }
}
