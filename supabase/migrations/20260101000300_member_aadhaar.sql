-- Optional Aadhaar number per member.
--
-- Stored ENCRYPTED (AES-256-GCM, key only on the server) in its own table, so it never rides along
-- in member lists or views, and only the last 4 digits are available without decrypting.
-- A row exists only while a number is on file; removing/archiving deletes the row.

create table public.member_sensitive (
  member_id           uuid primary key references public.members (id) on delete cascade,
  aadhaar_ciphertext  text not null check (length(aadhaar_ciphertext) between 20 and 500),
  aadhaar_last4       text not null check (aadhaar_last4 ~ '^[0-9]{4}$'),
  updated_at          timestamptz not null default now()
);

create trigger member_sensitive_updated before update on public.member_sensitive
  for each row execute function public.set_updated_at();

alter table public.member_sensitive enable row level security;
revoke all on public.member_sensitive from anon;

create policy sensitive_admin_read   on public.member_sensitive for select to authenticated using (public.is_admin());
create policy sensitive_admin_insert on public.member_sensitive for insert to authenticated with check (public.is_admin());
create policy sensitive_admin_update on public.member_sensitive for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy sensitive_admin_delete on public.member_sensitive for delete to authenticated using (public.is_admin());
