-- =====================================================================
-- MODIS Cek Boros - skema database Supabase
-- Jalankan SEKALI di Supabase > SQL Editor pada project baru.
-- Aman dijalankan ulang (idempotent).
--
-- Prinsip keamanan:
--   * Publik (anon key di aplikasi) HANYA boleh MENAMBAH data visitor.
--     Tidak bisa membaca, mengubah, atau menghapus data siapa pun.
--   * Membaca / mengubah / menghapus / ekspor hanya untuk akun admin
--     yang terdaftar di tabel modis_admins.
--   * Cek visitor ulang & stamp lewat fungsi yang hanya mengembalikan
--     angka (jumlah stamp/kunjungan), tanpa nama/email.
--   * Gacha diundi di server dan stok dikurangi secara atomik.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Admin
-- ---------------------------------------------------------------------
create table if not exists public.modis_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  label      text,
  created_at timestamptz not null default now()
);

alter table public.modis_admins enable row level security;

create or replace function public.modis_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.modis_admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.modis_is_admin() from public;
grant execute on function public.modis_is_admin() to anon, authenticated;

revoke all on public.modis_admins from anon;
revoke insert, update, delete, truncate on public.modis_admins from authenticated;

drop policy if exists "admin lihat daftar admin" on public.modis_admins;
create policy "admin lihat daftar admin" on public.modis_admins
  for select to authenticated
  using (public.modis_is_admin());

-- ---------------------------------------------------------------------
-- 2. Data visitor
-- ---------------------------------------------------------------------
create table if not exists public.modis_visitors (
  id                   text primary key,
  created_at           timestamptz not null default now(),
  -- Profil & persetujuan
  age_group            text not null check (age_group in ('<18', '18-24', '25-34', '35+')),
  is_minor             boolean not null default false,
  full_name            text,
  email                text,
  phone_number         text,          -- format +62xxxxxxxxxx
  privacy_agreed       boolean not null default false,
  consent_version      text,
  -- Kebiasaan (jawaban kuis)
  daily_bike_trips     text,
  avg_trip_cost        text,
  weekly_food_orders   text,
  unlimited_perception text,
  -- Hasil kalkulasi
  monthly_trips        integer,
  monthly_cost_normal  integer,
  cost_per_trip_pahe   integer,
  monthly_savings      integer,
  boros_status         text,
  -- Konversi di booth
  voucher_code         text,
  stamps_count         integer not null default 1 check (stamps_count between 0 and 6),
  reward_claimed       text,
  spg_verified         boolean not null default false,
  -- Lokasi & petugas
  poi_location         text,
  poi_category         text,
  unit_type            text,
  spg_name             text,
  shift                text,
  device_id            text,

  -- Peserta dewasa wajib nama, WA, dan persetujuan.
  -- Peserta di bawah 18 tahun TIDAK boleh menyimpan data pribadi.
  constraint modis_visitor_pii_rules check (
    (is_minor = false and full_name is not null and phone_number is not null and privacy_agreed = true)
    or
    (is_minor = true and full_name is null and email is null and phone_number is null)
  ),
  constraint modis_visitor_minor_matches_age check (is_minor = (age_group = '<18')),
  constraint modis_visitor_phone_format check (phone_number is null or phone_number ~ '^\+628[0-9]{7,11}$'),
  constraint modis_visitor_text_lengths check (
    coalesce(length(full_name), 0) <= 120 and coalesce(length(email), 0) <= 160
  )
);

-- Penyesuaian dari draft SQL sebelumnya (kolom weekly_bike_trips -> daily_bike_trips)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'modis_visitors'
               and column_name = 'weekly_bike_trips') then
    alter table public.modis_visitors rename column weekly_bike_trips to daily_bike_trips;
  end if;
end $$;

create index if not exists idx_modis_visitors_created_at on public.modis_visitors (created_at desc);
create index if not exists idx_modis_visitors_phone      on public.modis_visitors (phone_number);
create index if not exists idx_modis_visitors_spg        on public.modis_visitors (spg_name, shift);
create index if not exists idx_modis_visitors_location   on public.modis_visitors (poi_location);

alter table public.modis_visitors enable row level security;

-- Hapus policy lama dari versi AI Studio bila ada (policy ini membuka seluruh data ke publik).
drop policy if exists "Allow public insert and select" on public.modis_visitors;

drop policy if exists "publik hanya boleh menambah" on public.modis_visitors;
create policy "publik hanya boleh menambah" on public.modis_visitors
  for insert to anon, authenticated
  with check (true);

drop policy if exists "admin boleh membaca" on public.modis_visitors;
create policy "admin boleh membaca" on public.modis_visitors
  for select to authenticated
  using (public.modis_is_admin());

drop policy if exists "admin boleh mengubah" on public.modis_visitors;
create policy "admin boleh mengubah" on public.modis_visitors
  for update to authenticated
  using (public.modis_is_admin())
  with check (public.modis_is_admin());

drop policy if exists "admin boleh menghapus" on public.modis_visitors;
create policy "admin boleh menghapus" on public.modis_visitors
  for delete to authenticated
  using (public.modis_is_admin());

-- Batasi hak tabel: publik hanya INSERT.
revoke all on public.modis_visitors from anon;
grant insert on public.modis_visitors to anon;
grant select, insert, update, delete on public.modis_visitors to authenticated;

-- ---------------------------------------------------------------------
-- 3. Cek visitor ulang (stamp lintas lokasi) tanpa membocorkan data
-- ---------------------------------------------------------------------
create or replace function public.modis_lookup_visitor(p_phone text)
returns table (found boolean, previous_stamps integer, total_visits integer, claimed_today boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) > 0,
    coalesce(max(v.stamps_count), 0)::integer,
    count(*)::integer,
    coalesce(bool_or((v.created_at at time zone 'Asia/Jakarta')::date
                     = (now() at time zone 'Asia/Jakarta')::date), false)
  from public.modis_visitors v
  where p_phone ~ '^\+628[0-9]{7,11}$'
    and v.phone_number = p_phone;
$$;

revoke all on function public.modis_lookup_visitor(text) from public;
grant execute on function public.modis_lookup_visitor(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Stok merchandise bersama untuk semua unit
-- ---------------------------------------------------------------------
create table if not exists public.modis_merch (
  id                 text primary key,
  name               text not null,
  category           text not null check (category in ('Sarapan', 'Merchandise', 'Grand Prize')),
  stock              integer not null default 0 check (stock >= 0),
  initial_stock      integer not null default 0 check (initial_stock >= 0),
  probability_weight integer not null default 10 check (probability_weight > 0),
  sort_order         integer not null default 0,
  updated_at         timestamptz not null default now()
);

alter table public.modis_merch enable row level security;

drop policy if exists "semua boleh lihat stok" on public.modis_merch;
create policy "semua boleh lihat stok" on public.modis_merch
  for select to anon, authenticated
  using (true);

drop policy if exists "admin kelola stok" on public.modis_merch;
create policy "admin kelola stok" on public.modis_merch
  for all to authenticated
  using (public.modis_is_admin())
  with check (public.modis_is_admin());

revoke all on public.modis_merch from anon;
grant select on public.modis_merch to anon;
grant select, insert, update, delete on public.modis_merch to authenticated;

-- Data awal (stok contoh, ubah sesuai stok riil lewat panel admin)
insert into public.modis_merch (id, name, category, stock, initial_stock, probability_weight, sort_order) values
  ('sarapan_kopi',  'Sarapan Gratis (Kopi / Pisang)',    'Sarapan',     50, 50, 40, 1),
  ('voucher_saldo', 'Voucher Saldo Grab Rp15rb',         'Merchandise', 30, 30, 25, 2),
  ('tote_bag',      'Tote Bag Canvas MODIS',             'Merchandise', 25, 25, 18, 3),
  ('mini_fan',      'Portable Mini Fan Grab',            'Merchandise', 15, 15, 12, 4),
  ('tumbler_grab',  'Tumbler Stainless Eksklusif Grab',  'Grand Prize', 10, 10,  5, 5)
on conflict (id) do nothing;

-- Undian gacha di server: pilih hadiah berbobot dari stok yang tersedia
-- dan kurangi stoknya dalam satu transaksi (aman dari dua unit bersamaan).
create or replace function public.modis_spin_gacha()
returns table (item_id text, item_name text, remaining integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_total  integer;
  v_pick   numeric;
  v_item   public.modis_merch%rowtype;
begin
  for attempt in 1..5 loop
    select coalesce(sum(m.probability_weight), 0) into v_total
    from public.modis_merch m where m.stock > 0;

    if v_total = 0 then
      return;  -- stok habis semua
    end if;

    v_pick := random() * v_total;

    select m.* into v_item
    from (
      select m2.*, sum(m2.probability_weight) over (order by m2.sort_order, m2.id) as cum
      from public.modis_merch m2
      where m2.stock > 0
    ) m
    where m.cum > v_pick
    order by m.cum
    limit 1;

    update public.modis_merch m
      set stock = m.stock - 1, updated_at = now()
      where m.id = v_item.id and m.stock > 0
      returning m.id, m.name, m.stock into item_id, item_name, remaining;

    if found then
      return next;
      return;
    end if;
    -- stok item terpilih baru saja habis oleh unit lain: undi ulang
  end loop;
end;
$$;

revoke all on function public.modis_spin_gacha() from public;
grant execute on function public.modis_spin_gacha() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Mendaftarkan admin
-- ---------------------------------------------------------------------
-- a) Buat user di Authentication > Users > Add user (email + password).
-- b) Jalankan baris di bawah dengan email tersebut:
--
-- insert into public.modis_admins (user_id, label)
-- select id, 'Owner' from auth.users where email = 'EMAIL_ADMIN@contoh.com'
-- on conflict do nothing;
--
-- Disarankan: matikan pendaftaran pengguna baru di pengaturan Authentication
-- (opsi "Allow new users to sign up"), supaya tidak ada yang bisa membuat akun sendiri.

-- =====================================================================
-- 6. Migrasi 9 Okt 2026 (juga ada di supabase/migrations/)

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
