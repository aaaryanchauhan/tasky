"use client";

import { useActionState, useState } from "react";
import { changeStatusAction } from "@/app/actions/members";
import { ConfirmSubmit } from "@/components/ui/confirm";
import { Field, FormMessage, SelectInput, TextInput } from "@/components/ui/form";

export function StatusControls({ memberId, today }: { memberId: string; today: string }) {
  const [state, action] = useActionState(changeStatusAction.bind(null, memberId), null);
  const errors = state?.fieldErrors ?? {};
  const [status, setStatus] = useState("inactive");
  return (
    <details className="rounded-xl border border-line bg-white">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">Deactivate or archive</summary>
      <form action={action} className="space-y-4 border-t border-line p-4" noValidate>
        <p className="text-sm text-ink-soft">
          From the effective date, no new fees are billed and no reminders are sent. Unpaid fees for terms that start on or after that date are
          cancelled; anything already billed keeps its balance and history. Archiving keeps all payment history and can&apos;t be undone.
        </p>
        <Field label="Action" htmlFor="status" error={errors.status}>
          <SelectInput id="status" value={status} onChange={(e) => setStatus(e.target.value)} error={errors.status}>
            <option value="inactive">Deactivate (can be reactivated)</option>
            <option value="archived">Archive (hidden from lists)</option>
          </SelectInput>
        </Field>
        <Field label="Effective from" htmlFor="effectiveOn" error={errors.effectiveOn}>
          <TextInput id="effectiveOn" type="date" required defaultValue={state?.values?.effectiveOn ?? today} error={errors.effectiveOn} />
        </Field>
        <FormMessage state={state} />
        <ConfirmSubmit
          label="Continue…"
          variant="danger"
          title="Stop billing this member?"
          description="This stops future fees and reminders from the effective date. You can review the result on the member page."
          confirmLabel="Yes, stop billing"
        />
      </form>
    </details>
  );
}
