import { z } from "zod";
import { PLAN_CODES } from "./billing";
import { addDays, compareDates, isValidDate } from "./dates";
import { parseRupeesToPaise } from "./money";
import { normalizeAadhaar } from "./aadhaar";
import { normalizeIndianNumber } from "./phone";

/** MVP guard rails against typos: ₹1 – ₹1,00,000 per term. */
const MIN_PRICE_PAISE = 100;
const MAX_PRICE_PAISE = 10_000_000;

const text = (max: number) => z.string().trim().max(max);

export const dateField = z
  .string()
  .trim()
  .refine((v) => isValidDate(v), "Enter a valid date");

export const phoneField = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeIndianNumber(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Indian mobile number, e.g. +91 98765 43210" });
      return z.NEVER;
    }
    return normalized;
  });

export const rupeesField = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const paise = parseRupeesToPaise(value);
    if (paise === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in rupees, e.g. 1500 or 1500.50" });
      return z.NEVER;
    }
    if (paise < MIN_PRICE_PAISE || paise > MAX_PRICE_PAISE) {
      ctx.addIssue({ code: "custom", message: "Amount must be between ₹1 and ₹1,00,000" });
      return z.NEVER;
    }
    return paise;
  });

/** Checkbox: present ("on") means true. */
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

export const planCodeField = z.enum(PLAN_CODES as unknown as [string, ...string[]], {
  error: "Choose a membership plan",
});

const optionalText = (max: number) =>
  text(max)
    .optional()
    .transform((v) => (v ? v : null));

/** Optional. Blank → null; otherwise it must be a real, checksum-valid 12-digit Aadhaar number. */
export const aadhaarField = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const digits = normalizeAadhaar(value);
    if (!digits) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 12-digit Aadhaar number (or leave it blank)" });
      return z.NEVER;
    }
    return digits;
  });

export const memberCreateSchema = z
  .object({
    fullName: text(120).min(2, "Enter the member's full name"),
    phone: phoneField,
    alternateContact: optionalText(40),
    aadhaar: aadhaarField,
    joinedOn: dateField,
    planCode: planCodeField,
    agreedPrice: rupeesField,
    firstDueOn: dateField,
    consent: checkbox,
    consentSource: optionalText(120),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.consent && !v.consentSource) {
      ctx.addIssue({ code: "custom", path: ["consentSource"], message: "Record where the consent was given (e.g. signed enrolment form)" });
    }
    if (isValidDate(v.joinedOn) && isValidDate(v.firstDueOn)) {
      if (compareDates(v.firstDueOn, v.joinedOn) < 0) {
        ctx.addIssue({ code: "custom", path: ["firstDueOn"], message: "The first due date can't be before the joining date" });
      } else if (compareDates(v.firstDueOn, addDays(v.joinedOn, 366)) > 0) {
        ctx.addIssue({ code: "custom", path: ["firstDueOn"], message: "The first due date is more than a year after joining" });
      }
    }
  });

export const memberEditSchema = z
  .object({
    fullName: text(120).min(2, "Enter the member's full name"),
    phone: phoneField,
    alternateContact: optionalText(40),
    aadhaar: aadhaarField,
    joinedOn: dateField,
    consent: checkbox,
    consentSource: optionalText(120),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.consent && !v.consentSource) {
      ctx.addIssue({ code: "custom", path: ["consentSource"], message: "Record where the consent was given" });
    }
  });

export const billingChangeSchema = z.object({
  effectiveOn: dateField,
  planCode: planCodeField,
  agreedPrice: rupeesField,
  requestedAnchor: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isValidDate(v), "Enter a valid date"),
  intent: z.enum(["preview", "apply"]),
});

export const statusChangeSchema = z.object({
  status: z.enum(["inactive", "archived"]),
  effectiveOn: dateField,
});

export const paymentSchema = z.object({
  periodId: z.uuid(),
  amount: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const paise = parseRupeesToPaise(value);
      if (paise === null || paise <= 0) {
        ctx.addIssue({ code: "custom", message: "Enter an amount greater than zero, e.g. 500 or 500.50" });
        return z.NEVER;
      }
      return paise;
    }),
  paidOn: dateField,
  method: z.enum(["cash", "upi", "bank", "other"], { error: "Choose a payment method" }),
  reference: optionalText(120),
  notes: optionalText(500),
  idempotencyKey: z.string().trim().min(8).max(80),
});

export const voidSchema = z.object({
  paymentId: z.uuid(),
  reason: text(300).min(3, "Give a short reason for the reversal"),
});

export const cancelPeriodSchema = z.object({
  periodId: z.uuid(),
  reason: text(300).min(3, "Give a short reason"),
});

export const planPriceSchema = z.object({
  planId: z.uuid(),
  price: rupeesField,
});

export const gymSchema = z.object({
  gymName: text(80).min(1, "Enter the gym name"),
  timezone: text(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid IANA time zone, e.g. Asia/Kolkata"),
});

export const testSendSchema = z.object({ phone: phoneField });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter your email").max(254),
  password: z.string().min(1, "Enter your password").max(200),
});

export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) if (v?.[0]) out[k] = v[0];
  return out;
}
