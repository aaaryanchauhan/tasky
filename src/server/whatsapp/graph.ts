import "server-only";
import { toWhatsAppId } from "@/lib/phone";
import { whatsappConfig, type WhatsAppConfig } from "@/lib/env";
import { classifyGraphResponse, sanitizeError, type SendOutcome } from "./outcome";

const REQUEST_TIMEOUT_MS = 15_000;

export interface SendTemplateInput {
  toE164: string;
  templateName: string;
  /** Ordered body variables {{1}}, {{2}}, … */
  variables: string[];
  config?: WhatsAppConfig;
  fetchImpl?: typeof fetch;
}

/**
 * Submit an approved utility template through the official WhatsApp Cloud API.
 * "accepted" only means Meta took the request — delivery is confirmed later via webhook.
 */
export async function sendTemplateMessage(input: SendTemplateInput): Promise<SendOutcome> {
  let config: WhatsAppConfig;
  try {
    config = input.config ?? whatsappConfig();
  } catch {
    // Nothing was sent, so this is a definite (permanent) failure, not an ambiguous one.
    return { kind: "rejected", transient: false, code: null, message: "WhatsApp is not configured on the server" };
  }
  const doFetch = input.fetchImpl ?? fetch;
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: toWhatsAppId(input.toE164),
    type: "template",
    template: {
      name: input.templateName,
      language: { code: config.templateLanguage },
      components: [
        { type: "body", parameters: input.variables.map((text) => ({ type: "text", text })) },
      ],
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return classifyGraphResponse(res.status, json);
  } catch (err) {
    // Timeout / network drop *after* the request may have left: Meta might have accepted it.
    return { kind: "ambiguous", message: sanitizeError(err instanceof Error ? err.name : "network error") };
  } finally {
    clearTimeout(timer);
  }
}

export interface ConnectionReport {
  ok: boolean;
  phone?: { displayNumber?: string; verifiedName?: string; quality?: string };
  templates?: { name: string; status: string; language: string; category: string }[];
  error?: string;
}

/** Read-only health check for the Settings page. Returns only non-sensitive fields. */
export async function checkConnection(templateNames: string[]): Promise<ConnectionReport> {
  let config: WhatsAppConfig;
  try {
    config = whatsappConfig();
  } catch {
    return { ok: false, error: "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are not set on the server." };
  }
  const base = `https://graph.facebook.com/${config.graphVersion}`;
  const headers = { Authorization: `Bearer ${config.accessToken}` };
  try {
    const phoneRes = await fetch(
      `${base}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    const phoneJson = (await phoneRes.json()) as Record<string, unknown>;
    if (!phoneRes.ok) {
      const e = (phoneJson.error ?? {}) as { message?: string; code?: number };
      return { ok: false, error: `Meta rejected the request (${e.code ?? phoneRes.status}): ${sanitizeError(e.message ?? "")}` };
    }
    const report: ConnectionReport = {
      ok: true,
      phone: {
        displayNumber: String(phoneJson.display_phone_number ?? ""),
        verifiedName: String(phoneJson.verified_name ?? ""),
        quality: String(phoneJson.quality_rating ?? ""),
      },
    };
    if (config.businessAccountId) {
      const tplRes = await fetch(
        `${base}/${config.businessAccountId}/message_templates?fields=name,status,language,category&limit=50`,
        { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
      );
      if (tplRes.ok) {
        const tplJson = (await tplRes.json()) as { data?: { name: string; status: string; language: string; category: string }[] };
        report.templates = (tplJson.data ?? []).filter((t) => templateNames.includes(t.name));
      }
    }
    return report;
  } catch (err) {
    return { ok: false, error: `Could not reach Meta: ${sanitizeError(err instanceof Error ? err.message : "")}` };
  }
}
