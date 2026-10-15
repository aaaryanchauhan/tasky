-- Member photos: private Storage bucket, admin-only access, path recorded on the member.

alter table public.members add column photo_path text
  check (photo_path is null or (length(photo_path) <= 200 and photo_path !~ '\.\.'));

-- The view expands members.* at creation time, so it must be recreated to expose the new column.
drop view public.member_overview;
create view public.member_overview with (security_invoker = true) as
select
  m.*,
  pl.code as plan_code,
  pl.name as plan_name,
  f.id                as focus_period_id,
  f.due_on            as focus_due_on,
  f.outstanding_paise as focus_outstanding_paise,
  f.status            as focus_status,
  f.is_overdue        as focus_is_overdue,
  f.days_overdue      as focus_days_overdue
from public.members m
join public.membership_plans pl on pl.id = m.plan_id
left join lateral (
  select s.* from public.billing_period_summary s
  where s.member_id = m.id and s.outstanding_paise > 0
  order by s.due_on asc
  limit 1
) f on true;
revoke all on public.member_overview from anon;

-- Private bucket: no public URLs. Photos are only ever served through short-lived signed links
-- created server-side for a signed-in admin. 1 MB cap and an image-type allow-list (no SVG).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy member_photos_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and public.is_admin());
create policy member_photos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos' and public.is_admin());
create policy member_photos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'member-photos' and public.is_admin())
  with check (bucket_id = 'member-photos' and public.is_admin());
create policy member_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and public.is_admin());
