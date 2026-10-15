import { BrandMark } from "@/components/brand";
import { BottomNav, SideNav } from "@/components/nav-links";
import { logoutAction } from "@/app/actions/auth";
import { getGymSettings, requireAdmin } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const settings = await getGymSettings();

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <span className="font-extrabold leading-tight">{settings.gym_name}</span>
        </div>
        <SideNav />
        <form action={logoutAction} className="mt-auto">
          <button className="min-h-11 w-full rounded-xl px-3 text-left font-semibold text-ink-soft hover:bg-stone-100">Log out</button>
        </form>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="font-extrabold">{settings.gym_name}</span>
          </div>
          <form action={logoutAction}>
            <button className="min-h-11 rounded-lg px-3 text-sm font-semibold text-ink-soft hover:bg-stone-100">Log out</button>
          </form>
        </header>
        <main className="px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
