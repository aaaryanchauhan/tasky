import { createHmac, timingSafeEqual } from "node:crypto";
import type { JobState } from "@/lib/db/types";
import { sanitizeError } from "./outcome";

/** Verify Meta's `X-Hub-Signature-256: sha256=<hex hmac of the raw body>` header. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header) return false;
  const [scheme, provided] = header.split("=");
  if (scheme !== "sha256" || !provided) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = createHmac("sha256", "cmp").update(a).digest();
  const y = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(x, y);
}

export type StatusName = "sent" | "delivered" | "read" | "failed";

export interface StatusEvent {
  messageId: string;
  status: StatusName;
  /** Unix seconds from Meta. */
  timestamp: number;
  errorCode: number | null;
  errorTitle: string | null;
}

export interface InboundText {
  /** Digits only, as Meta sends it (no leading +). */
  from: string;
  text: string;
}

export interface ParsedWebhook {
  statuses: StatusEvent[];
  inbound: InboundText[];
}

/** Extract only what we need; everything else (names, profile info, pricing) is dropped. */
export function parseWebhook(payload: unknown): ParsedWebhook {
  const out: ParsedWebhook = { statuses: [], inbound: [] };
  const root = payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] } | null;
  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const statuses = (value.statuses ?? []) as {
        id?: string;
        status?: string;
        timestamp?: string;
        errors?: { code?: number; title?: string; message?: string }[];
      }[];
      for (const s of statuses) {
        if (!s.id || !s.status) continue;
        if (!["sent", "delivered", "read", "failed"].includes(s.status)) continue;
        const err = s.errors?.[0];
        out.statuses.push({
          messageId: s.id,
          status: s.status as StatusName,
          timestamp: Number(s.timestamp) || Math.floor(Date.now() / 1000),
          errorCode: typeof err?.code === "number" ? err.code : null,
          errorTitle: err ? sanitizeError(err.title ?? err.message ?? "") || null : null,
        });
      }
      const messages = (value.messages ?? []) as { from?: string; type?: string; text?: { body?: string } }[];
      for (const m of messages) {
        if (m.from && m.type === "text" && typeof m.text?.body === "string") {
          out.inbound.push({ from: m.from, text: m.text.body });
        }
      }
    }
  }
  return out;
}

const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "opt out", "optout", "opt-out", "stop all", "cancel reminders"]);

/** Only an unambiguous whole-message opt-out phrase counts, never a substring. */
export function isOptOutText(text: string): boolean {
  return OPT_OUT_WORDS.has(text.trim().toLowerCase().replace(/[.!]+$/, ""));
}

const RANK: Partial<Record<JobState, number>> = { submitted: 1, delivered: 2, read: 3 };

/**
 * Apply a delivery-status event to a job's state without ever moving backwards:
 * webhooks can arrive out of order or twice. `failed` can't overwrite a delivered/read message.
 */
export function nextStateForStatus(current: JobState, status: StatusName): JobState {
  switch (status) {
    case "sent":
      return current;
    case "delivered":
      return (RANK[current] ?? 0) >= 1 && (RANK[current] ?? 0) < 2 ? "delivered" : current;
    case "read":
      return (RANK[current] ?? 0) >= 1 && (RANK[current] ?? 0) < 3 ? "read" : current;
    case "failed":
      return current === "submitted" || current === "claimed" ? "failed" : current;
  }
}
