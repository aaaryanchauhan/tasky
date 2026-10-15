"use client";

import { useRef, useState, type ReactNode } from "react";
import { Modal } from "./modal";
import { Button } from "./button";

/**
 * Wraps a submit button so a financial/destructive action needs an explicit confirmation.
 * Place inside a <form>; confirming submits that form.
 */
export function ConfirmSubmit({
  label,
  title,
  description,
  confirmLabel,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  submitter,
}: {
  label: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  /** Name/value the form is submitted with when confirmed (e.g. intent=apply). */
  submitter?: { name: string; value: string };
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);

  function submit() {
    setOpen(false);
    const form = anchor.current?.closest("form");
    form?.requestSubmit(submitButton.current ?? undefined);
  }

  return (
    <span ref={anchor}>
      {submitter ? (
        <button ref={submitButton} type="submit" name={submitter.name} value={submitter.value} hidden tabIndex={-1} aria-hidden="true" />
      ) : null}
      <Button variant={variant} size={size} className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-4">
          <div className="text-sm text-ink-soft">{description}</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={variant === "primary" ? "primary" : variant} onClick={submit}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </span>
  );
}
