"use client";

import { useFormStatus } from "react-dom";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { buttonClass } from "./button";

export const inputClass =
  "block w-full min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-stone-400 focus:border-tiger-500 disabled:bg-stone-100 aria-[invalid=true]:border-red-500";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-soft">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ error, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string; id: string }) {
  return (
    <input
      id={id}
      name={props.name ?? id}
      className={inputClass}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
  );
}

export function SelectInput({ error, id, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { error?: string; id: string }) {
  return (
    <select
      id={id}
      name={props.name ?? id}
      className={inputClass}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
  );
}

export function TextArea({ error, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string; id: string }) {
  return (
    <textarea
      id={id}
      name={props.name ?? id}
      rows={3}
      className={inputClass}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  size = "md",
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message?: string } | null }) {
  if (!state?.message) return null;
  return (
    <div
      role={state.ok ? "status" : "alert"}
      className={`rounded-xl px-3 py-2 text-sm font-medium ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}
    >
      {state.message}
    </div>
  );
}
