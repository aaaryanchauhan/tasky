import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Cron and webhook routes authenticate themselves (shared secret / HMAC signature) and must
  // be reachable without a browser session. Everything else requires a logged-in admin.
  matcher: [
    "/((?!_next/static|_next/image|api/cron|api/whatsapp/webhook|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
