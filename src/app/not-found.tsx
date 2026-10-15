import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-extrabold">Not found</h1>
      <p className="text-ink-soft">That page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <LinkButton href="/">Back to dashboard</LinkButton>
    </main>
  );
}
