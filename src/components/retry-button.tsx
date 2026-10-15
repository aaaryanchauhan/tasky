"use client";

import { useActionState } from "react";
import { retryReminderAction } from "@/app/actions/settings";
import { SubmitButton } from "@/components/ui/form";
import { useToastingAction } from "@/components/ui/toast";

export function RetryButton({ jobId, ambiguous }: { jobId: string; ambiguous: boolean }) {
  const [, action] = useActionState(useToastingAction(retryReminderAction, { errors: true }), null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="jobId" value={jobId} />
      {ambiguous ? (
        <label className="flex items-start gap-2 text-xs text-amber-900">
          <input type="checkbox" name="confirmAmbiguous" className="mt-0.5 size-4 accent-tiger-600" required />
          <span>
            The earlier attempt may already have been delivered. I&apos;ve checked and want to resend.
          </span>
        </label>
      ) : null}
      <SubmitButton variant="secondary" size="sm" pendingLabel="Retrying…">
        Retry
      </SubmitButton>
    </form>
  );
}
