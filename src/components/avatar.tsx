import { initials } from "@/lib/photo";

const sizes = { sm: "size-11 text-sm", md: "size-14 text-lg", lg: "size-20 text-2xl" } as const;

/** Member photo (signed URL) or an initials badge. Decorative: the name is always shown beside it. */
export function Avatar({ name, url, size = "md" }: { name: string; url?: string | null; size?: keyof typeof sizes }) {
  const cls = `${sizes[size]} shrink-0 rounded-full`;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image can't optimise it
    return <img src={url} alt="" loading="lazy" decoding="async" className={`${cls} bg-stone-200 object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${cls} inline-flex items-center justify-center bg-tiger-100 font-bold text-tiger-900`}>
      {initials(name)}
    </span>
  );
}
