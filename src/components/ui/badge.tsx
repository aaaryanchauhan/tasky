import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700",
  good: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-900",
  bad: "bg-red-100 text-red-800",
  info: "bg-sky-100 text-sky-800",
  brand: "bg-tiger-100 text-tiger-900",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
