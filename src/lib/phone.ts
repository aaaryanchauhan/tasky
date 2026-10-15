/** Indian mobile numbers only (MVP): +91 followed by a 10-digit number starting 6-9. */

const E164_IN = /^\+91[6-9]\d{9}$/;

export function isValidIndianE164(value: string): boolean {
  return E164_IN.test(value);
}

/**
 * Accepts "+91 98765 43210", "98765-43210", "919876543210", "09876543210" and
 * returns canonical E.164, or null when the number is not a valid Indian mobile.
 */
export function normalizeIndianNumber(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
    if (!digits.startsWith("91")) return null;
  } else if (digits.startsWith("0")) {
    digits = "91" + digits.slice(1);
  } else if (digits.length === 10) {
    digits = "91" + digits;
  }
  const candidate = `+${digits}`;
  return isValidIndianE164(candidate) ? candidate : null;
}

/** Meta wants digits only (no leading +) in the `to` field. */
export function toWhatsAppId(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** "+91 98765 43210" for display. */
export function formatPhoneDisplay(e164: string): string {
  if (!isValidIndianE164(e164)) return e164;
  return `+91 ${e164.slice(3, 8)} ${e164.slice(8)}`;
}
