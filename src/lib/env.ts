/**
 * Environment access. Nothing is validated at import time so `next build` works without
 * secrets; each getter fails loudly (without echoing values) when it is actually needed.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function publicEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function appTimeZone(): string {
  return process.env.APP_TIMEZONE || "Asia/Kolkata";
}

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  graphVersion: string;
  templateLanguage: string;
}

export function whatsappConfig(): WhatsAppConfig {
  return {
    accessToken: required("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v23.0",
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
  };
}

/** Booleans only — safe to render in the admin UI. Never returns values. */
export function whatsappEnvStatus() {
  const has = (n: string) => Boolean(process.env[n]);
  return {
    accessToken: has("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: has("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountId: has("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v23.0 (default)",
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en (default)",
    webhookVerifyToken: has("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    appSecret: has("WHATSAPP_APP_SECRET"),
    cronSecret: has("CRON_SECRET"),
    serviceRoleKey: has("SUPABASE_SERVICE_ROLE_KEY"),
    aadhaarKey: has("AADHAAR_ENCRYPTION_KEY"),
  };
}

export function testSendAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.WHATSAPP_ALLOW_TEST_SEND === "true";
}
