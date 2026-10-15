/** Pure helpers for interpreting Meta's responses. No I/O, fully unit-tested. */

export type SendOutcome =
  | { kind: "accepted"; messageId: string }
  /** Meta definitively refused. `transient` = rate-limit style, safe to retry later. */
  | { kind: "rejected"; transient: boolean; code: number | null; message: string }
  /** We cannot tell whether Meta accepted the message. Never auto-retried. */
  | { kind: "ambiguous"; message: string };

/** Meta error codes that mean "slow down / try again", and nothing was sent. */
const TRANSIENT_CODES = new Set([4, 17, 32, 613, 80007, 130429, 131048, 131056, 133016]);

/** Strip anything that looks like a phone number or token and cap the length before storing. */
export function sanitizeError(text: string): string {
  return text
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[number]")
    .replace(/\b(EAA|Bearer\s+)[A-Za-z0-9_-]{10,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function classifyGraphResponse(httpStatus: number, body: unknown): SendOutcome {
  const obj = (body && typeof body === "object" ? body : {}) as {
    messages?: { id?: string }[];
    error?: { code?: number; message?: string; error_data?: { details?: string } };
  };

  if (httpStatus >= 200 && httpStatus < 300) {
    const id = obj.messages?.[0]?.id;
    if (id) return { kind: "accepted", messageId: id };
    // 2xx but no message id: we can't prove it was or wasn't accepted.
    return { kind: "ambiguous", message: "Meta responded without a message id" };
  }
  if (httpStatus >= 500) {
    return { kind: "ambiguous", message: `Meta server error (HTTP ${httpStatus})` };
  }
  const code = typeof obj.error?.code === "number" ? obj.error.code : null;
  const detail = obj.error?.error_data?.details ?? obj.error?.message ?? `HTTP ${httpStatus}`;
  const transient = httpStatus === 429 || (code !== null && TRANSIENT_CODES.has(code));
  return {
    kind: "rejected",
    transient,
    code,
    message: sanitizeError(`${code ? `(${code}) ` : ""}${detail}`),
  };
}

/** Auth/permission failures need a human (token expired, template not approved…). */
export function isConfigurationError(code: number | null): boolean {
  return code === 190 || code === 10 || code === 200 || code === 132001 || code === 132000;
}
