import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ChevronRightIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { ConsentBadge, DueBadge, MemberStatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { inputClass } from "@/components/ui/form";
import { formatDateIN, todayInTimeZone } from "@/lib/dates";
import { memberDueInfo } from "@/lib/member-status";
import { formatINR } from "@/lib/money";
import { formatPhoneDisplay } from "@/lib/phone";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { signedPhotoUrls } from "@/server/photos";
import { listMembers, MEMBER_FILTERS, parseFilter } from "@/server/queries";

export const metadata = { title: "Members" };
export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const settings = await getGymSettings();
  const today = todayInTimeZone(settings.timezone);
  const filter = parseFilter(sp.filter);
  const q = (sp.q ?? "").slice(0, 60);
  const members = await listMembers(supabase, { q, filter, today });
  const photos = await signedPhotoUrls(supabase, members.map((m) => m.photo_path));

  const href = (f: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("filter", f);
    const s = p.toString();
    return s ? `/members?${s}` : "/members";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Members"
        subtitle={`${members.length} shown`}
        action={
          <LinkButton href="/members/new">
            <PlusIcon width={20} height={20} /> Add member
          </LinkButton>
        }
      />

      <form action="/members" method="get" role="search" className="relative">
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <label htmlFor="q" className="sr-only">
          Search by name or phone number
        </label>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" width={20} height={20} />
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Search name or phone" className={`${inputClass} pl-10`} />
      </form>

      <nav aria-label="Filter members" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2 pb-1">
          {MEMBER_FILTERS.map((f) => {
            const active = f.value === filter;
            return (
              <li key={f.value}>
                <Link
                  href={href(f.value)}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold ${active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:bg-stone-50"}`}
                >
                  {f.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {members.length === 0 ? (
        <EmptyState
          title={q || filter !== "all" ? "No members match" : "No members yet"}
          hint={q || filter !== "all" ? "Try a different search or filter." : "Add your first member to start tracking fees."}
          action={
            q || filter !== "all" ? undefined : (
              <LinkButton href="/members/new">
                <PlusIcon width={20} height={20} /> Add member
              </LinkButton>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {members.map((m) => {
            const due = memberDueInfo(m, today);
            return (
              <li key={m.id}>
                <Link href={`/members/${m.id}`} className="block rounded-2xl">
                  <Card className="transition-colors hover:border-tiger-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={m.full_name} url={m.photo_path ? photos.get(m.photo_path) : null} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-lg font-bold">{m.full_name}</p>
                          <p className="text-sm text-ink-soft">{formatPhoneDisplay(m.whatsapp_e164)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <DueBadge info={due} />
                        {m.status !== "active" ? <MemberStatusBadge status={m.status} /> : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <Badge tone="brand">{m.plan_name}</Badge>
                      <span className="font-semibold">{formatINR(m.agreed_price_paise)}</span>
                      <span className="text-ink-soft">
                        {due.dueOn ? `${due.kind === "paid_up" ? "Next due" : "Due"} ${formatDateIN(due.dueOn)}` : "—"}
                        {due.outstandingPaise > 0 ? ` · owes ${formatINR(due.outstandingPaise)}` : ""}
                      </span>
                      <ChevronRightIcon className="ml-auto text-stone-400" width={18} height={18} />
                    </div>
                    <div className="mt-2">
                      <ConsentBadge optInAt={m.whatsapp_opt_in_at} optOutAt={m.whatsapp_opt_out_at} />
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
