"use client";

import { useEffect, useState, useTransition } from "react";
import { revealAadhaarAction } from "@/app/actions/sensitive";
import { maskAadhaar } from "@/lib/aadhaar";

const VISIBLE_MS = 30_000;

/** Masked by default; "Show" reveals the full number for 30 seconds and is audit-logged server-side. */
export function AadhaarReveal({ memberId, last4 }: { memberId: string; last4: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setValue(null), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono tracking-wide" data-testid="aadhaar-value">
        {value ?? maskAadhaar(last4)}
      </span>
      {value ? (
        <button type="button" onClick={() => setValue(null)} className="min-h-9 text-sm font-semibold text-ink-soft underline">
          Hide
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await revealAadhaarAction(memberId);
              if (r.ok) setValue(r.value);
              else setError(r.error);
            })
          }
          className="min-h-9 text-sm font-semibold text-tiger-700 underline disabled:opacity-60"
        >
          {pending ? "Checking…" : "Show"}
        </button>
      )}
      {error ? (
        <span role="alert" className="w-full text-sm font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
