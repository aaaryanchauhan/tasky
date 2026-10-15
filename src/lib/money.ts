/** Money is stored as integer paise (INR). Never use floats for balances. */

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** "1,500" or "1,500.50" — no currency symbol (used inside WhatsApp template text). */
export function formatRupeesPlain(paise: number): string {
  const whole = paise % 100 === 0;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/** "₹1,500" / "₹1,500.50" */
export function formatINR(paise: number): string {
  return `₹${formatRupeesPlain(paise)}`;
}

/**
 * Parse a user-entered rupee amount ("1500", "1,500.5", "₹ 1500.00") into paise.
 * Returns null for anything that is not a plain non-negative amount with ≤ 2 decimals.
 */
export function parseRupeesToPaise(input: string | number): number | null {
  const raw = String(input).replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [whole = "0", frac = ""] = raw.split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}
