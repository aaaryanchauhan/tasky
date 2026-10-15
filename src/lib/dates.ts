/**
 * Date-only arithmetic. All dates are "YYYY-MM-DD" strings (no time, no zone),
 * which mirrors the Postgres `date` type and sidesteps DST/UTC drift entirely.
 */

export type DateOnly = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  // month is 1-12
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseDate(value: DateOnly): { y: number; m: number; d: number } {
  const match = ISO_RE.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new Error(`Invalid date: ${value}`);
  }
  return { y, m, d };
}

export function isValidDate(value: string): boolean {
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function formatISO(y: number, m: number, d: number): DateOnly {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Days since 1970-01-01 (proleptic Gregorian). Pure integer math, no Date object. */
function toDayNumber(value: DateOnly): number {
  const { y, m, d } = parseDate(value);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromDayNumber(n: number): DateOnly {
  const dt = new Date(n * 86_400_000);
  return formatISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(value: DateOnly, days: number): DateOnly {
  return fromDayNumber(toDayNumber(value) + days);
}

/** Whole calendar days from `a` to `b` (positive when b is later). */
export function diffDays(a: DateOnly, b: DateOnly): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function compareDates(a: DateOnly, b: DateOnly): number {
  return a < b ? -1 : a > b ? 1 : 0; // ISO strings sort lexicographically
}

/**
 * Add calendar months to an *anchor* date. The day-of-month of the anchor is
 * clamped to the last valid day of the target month, but because callers always
 * compute from the original anchor (never from a previously clamped result) the
 * anchor never drifts: Jan 31 → Feb 28/29 → Mar 31 → Apr 30 …
 * A Feb 29 anchor lands on Feb 29 in leap years and Feb 28 otherwise.
 */
export function addMonthsAnchored(anchor: DateOnly, months: number): DateOnly {
  const { y, m, d } = parseDate(anchor);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return formatISO(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

/** Start date of the k-th billing cycle for a given anchor and term length. */
export function cycleStart(anchor: DateOnly, durationMonths: number, k: number): DateOnly {
  return addMonthsAnchored(anchor, durationMonths * k);
}

/** Today's calendar date in an IANA time zone (default Asia/Kolkata). */
export function todayInTimeZone(timeZone = "Asia/Kolkata", now: Date = new Date()): DateOnly {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function startOfMonth(value: DateOnly): DateOnly {
  const { y, m } = parseDate(value);
  return formatISO(y, m, 1);
}

export function startOfNextMonth(value: DateOnly): DateOnly {
  const { y, m } = parseDate(value);
  return m === 12 ? formatISO(y + 1, 1, 1) : formatISO(y, m + 1, 1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Indian-reader friendly: "5 Mar 2026". Used in UI and WhatsApp templates. */
export function formatDateIN(value: DateOnly): string {
  const { y, m, d } = parseDate(value);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Format a UTC timestamp for display in the gym's time zone. */
export function formatTimestampIN(iso: string, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
