/**
 * Aadhaar number helpers (pure). An Aadhaar number is 12 digits, never starts with 0 or 1, and its
 * last digit is a Verhoeff check digit — so most typos and made-up numbers can be rejected locally.
 */

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** True when `digits` (including its trailing check digit) passes the Verhoeff checksum. */
export function verhoeffValid(digits: string): boolean {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = D[c]![P[i % 8]![Number(rev[i])]!]!;
  return c === 0;
}

/** Check digit to append to `digits` so the result validates (used to build test fixtures). */
export function verhoeffCheckDigit(digits: string): number {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = D[c]![P[(i + 1) % 8]![Number(rev[i])]!]!;
  return INV[c]!;
}

/** Strip spaces/hyphens and return the 12 digits, or null if it is not a plausible Aadhaar number. */
export function normalizeAadhaar(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^[2-9]\d{11}$/.test(digits)) return null;
  return verhoeffValid(digits) ? digits : null;
}

/** "1234 5678 9012" */
export function formatAadhaar(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/** "XXXX XXXX 9012" — all the UI shows by default. */
export function maskAadhaar(last4: string): string {
  return `XXXX XXXX ${last4}`;
}
