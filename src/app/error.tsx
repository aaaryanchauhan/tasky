"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-extrabold">Something went wrong</h1>
      <p className="text-ink-soft">The page couldn&apos;t load. Check your connection and try again.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
