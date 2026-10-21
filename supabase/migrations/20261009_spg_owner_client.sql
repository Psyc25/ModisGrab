-- =====================================================================
-- MODIS Cek Boros - migrasi 9 Okt 2026
-- 1. Pertanyaan usia dihapus dari aplikasi: age_group boleh kosong.
-- 2. Jam jaga SPG ikut tercatat di setiap visitor (duty_hours).
-- 3. Peran akun dashboard: owner (kelola penuh) dan client (lihat & unduh).
--    SPG tidak punya akun, jadi tidak bisa login ke dashboard.
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Usia opsional
alter table public.modis_visitors alter column age_group drop not null;

-- 2. Jam jaga SPG
alter table public.modis_visitors add column if not exists duty_hours text;
alter table public.modis_visitors drop constraint if exists modis_visitor_duty_hours_len;
alter table public.modis_visitors add constraint modis_visitor_duty_hours_len
  check (coalesce(length(duty_hours), 0) <= 20);

-- 3. Peran owner / client
alter table public.modis_admins add column if not exists role text not null default 'owner';
alter table public.modis_admins drop constraint if exists modis_admins_role_check;
alter table public.modis_admins add constraint modis_admins_role_check check (role in ('owner', 'client'));

create or replace function public.modis_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role from public.modis_admins a where a.user_id = auth.uid();
$$;
revoke all on function public.modis_admin_role() from public;
grant execute on function public.modis_admin_role() to anon, authenticated;

create or replace function public.modis_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.modis_admins a where a.user_id = auth.uid() and a.role = 'owner');
$$;
revoke all on function public.modis_is_owner() from public;
grant execute on function public.modis_is_owner() to anon, authenticated;

-- Owner & client boleh membaca data visitor (modis_is_admin = terdaftar sebagai owner/client).
-- Mengubah & menghapus data visitor hanya owner.
drop policy if exists "admin boleh mengubah" on public.modis_visitors;
create policy "admin boleh mengubah" on public.modis_visitors
  for update to authenticated
  using (public.modis_is_owner())
  with check (public.modis_is_owner());

drop policy if exists "admin boleh menghapus" on public.modis_visitors;
create policy "admin boleh menghapus" on public.modis_visitors
  for delete to authenticated
  using (public.modis_is_owner());

-- Stok hadiah: semua boleh lihat, hanya owner yang mengubah.
drop policy if exists "admin kelola stok" on public.modis_merch;
create policy "admin kelola stok" on public.modis_merch
  for all to authenticated
  using (public.modis_is_owner())
  with check (public.modis_is_owner());

-- ---------------------------------------------------------------------
-- Cara menambah akun dashboard:
-- a) Authentication > Users > Add user (email + password).
-- b) Jalankan salah satu (ganti email):
--
-- insert into public.modis_admins (user_id, label, role)
-- select id, 'Owner Magna', 'owner' from auth.users where email = 'OWNER@contoh.com'
-- on conflict (user_id) do update set role = excluded.role, label = excluded.label;
--
-- insert into public.modis_admins (user_id, label, role)
-- select id, 'Klien Grab', 'client' from auth.users where email = 'KLIEN@contoh.com'
-- on conflict (user_id) do update set role = excluded.role, label = excluded.label;
-- ---------------------------------------------------------------------
