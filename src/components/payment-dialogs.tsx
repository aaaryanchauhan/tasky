"use client";

import { useActionState, useEffect, useState } from "react";
import { cancelPeriodAction, recordPaymentAction, voidPaymentAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SelectInput, SubmitButton, TextInput } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToastingAction } from "@/components/ui/toast";
import { formatINR } from "@/lib/money";
import type { ActionState } from "@/app/actions/shared";

/** Close the dialog when an action succeeds (the toast is fired by useToastingAction). */
function useCloseOnSuccess(state: ActionState, onClose: () => void) {
  useEffect(() => {
    if (state?.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function RecordPaymentButton({
  periodId,
  memberName,
  outstandingPaise,
  dueLabel,
  today,
  label = "Record payment",
  variant = "primary",
  size = "md",
  className = "",
}: {
  periodId: string;
  memberName: string;
  outstandingPaise: number;
  dueLabel: string;
  today: string;
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record payment">
        {open ? (
          <PaymentForm
            periodId={periodId}
            memberName={memberName}
            outstandingPaise={outstandingPaise}
            dueLabel={dueLabel}
            today={today}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </Modal>
    </>
  );
}

function PaymentForm({
  periodId,
  memberName,
  outstandingPaise,
  dueLabel,
  today,
  onClose,
}: {
  periodId: string;
  memberName: string;
  outstandingPaise: number;
  dueLabel: string;
  today: string;
  onClose: () => void;
}) {
  const [state, action] = useActionState(useToastingAction(recordPaymentAction), null);
  // One key per opened dialog: a double-tap or retry re-sends the same key and is de-duplicated server-side.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useCloseOnSuccess(state, onClose);
  const errors = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  // Controlled: a failed submit resets uncontrolled selects to their initial option.
  const [method, setMethod] = useState("cash");

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
        <span className="font-semibold">{memberName}</span> · due {dueLabel}
        <br />
        Outstanding <span className="font-bold">{formatINR(outstandingPaise)}</span>
      </p>
      <Field label="Amount received (₹)" htmlFor="amount" error={errors.amount} hint="Enter less than the balance for a partial payment.">
        <TextInput id="amount" inputMode="decimal" required defaultValue={v.amount ?? String(outstandingPaise / 100)} error={errors.amount} />
      </Field>
      <Field label="Payment date" htmlFor="paidOn" error={errors.paidOn}>
        <TextInput id="paidOn" type="date" required max={today} defaultValue={v.paidOn ?? today} error={errors.paidOn} />
      </Field>
      <Field label="Method" htmlFor="method" error={errors.method}>
        <SelectInput id="method" required value={method} onChange={(e) => setMethod(e.target.value)} error={errors.method}>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="bank">Bank transfer</option>
          <option value="other">Other</option>
        </SelectInput>
      </Field>
      <Field label="Reference (optional)" htmlFor="reference" error={errors.reference}>
        <TextInput id="reference" maxLength={120} placeholder="UPI ref / receipt no." defaultValue={v.reference ?? ""} error={errors.reference} />
      </Field>
      <Field label="Notes (optional)" htmlFor="notes" error={errors.notes}>
        <TextInput id="notes" maxLength={500} defaultValue={v.notes ?? ""} error={errors.notes} />
      </Field>
      {!state?.ok ? <FormMessage state={state} /> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Recording…">Save payment</SubmitButton>
      </div>
    </form>
  );
}

function ReasonDialog({
  buttonLabel,
  title,
  intro,
  action,
  idName,
  idValue,
  confirmLabel,
}: {
  buttonLabel: string;
  title: string;
  intro: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  idName: string;
  idValue: string;
  confirmLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        {open ? <ReasonForm intro={intro} action={action} idName={idName} idValue={idValue} confirmLabel={confirmLabel} onClose={() => setOpen(false)} /> : null}
      </Modal>
    </>
  );
}

function ReasonForm({
  intro,
  action,
  idName,
  idValue,
  confirmLabel,
  onClose,
}: {
  intro: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  idName: string;
  idValue: string;
  confirmLabel: string;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(useToastingAction(action), null);
  useCloseOnSuccess(state, onClose);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name={idName} value={idValue} />
      <p className="text-sm text-ink-soft">{intro}</p>
      <Field label="Reason" htmlFor="reason" error={state?.fieldErrors?.reason}>
        <TextInput id="reason" required maxLength={300} defaultValue={state?.values?.reason ?? ""} error={state?.fieldErrors?.reason} />
      </Field>
      {!state?.ok ? <FormMessage state={state} /> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Keep it
        </Button>
        <SubmitButton variant="danger" pendingLabel="Working…">
          {confirmLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

export function VoidPaymentButton({ paymentId, amountLabel }: { paymentId: string; amountLabel: string }) {
  return (
    <ReasonDialog
      buttonLabel="Reverse"
      title={`Reverse ${amountLabel} payment`}
      intro="The payment stays in the history marked as reversed, and the balance is restored. No reminder is sent automatically because of a reversal."
      action={voidPaymentAction}
      idName="paymentId"
      idValue={paymentId}
      confirmLabel="Reverse payment"
    />
  );
}

export function CancelPeriodButton({ periodId }: { periodId: string }) {
  return (
    <ReasonDialog
      buttonLabel="Cancel period"
      title="Cancel this billing period"
      intro="Use this to waive a charge raised in error. It disappears from dues and reminders but stays in the history. Reverse any payments on it first."
      action={cancelPeriodAction}
      idName="periodId"
      idValue={periodId}
      confirmLabel="Cancel period"
    />
  );
}
