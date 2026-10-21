-- =====================================================================
-- MODIS Cek Boros - laporan v2 (9 Okt 2026)
-- 1. modis_settings      : periode campaign, target KPI, stok merch, kunci link report klien
-- 2. modis_slot_reports  : laporan akhir slot dari SPG (Reach, Contact, Conversion, merch keluar)
-- 3. modis_submit_slot_report() : dipanggil tablet SPG (tanpa akun) untuk kirim/ubah laporan slot
-- 4. modis_public_report()      : data halaman report klien (pakai kunci link, TANPA nama/WA/email lengkap)
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Pengaturan ---------------------------------------------------------
create table if not exists public.modis_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.modis_settings enable row level security;

drop policy if exists "admin baca pengaturan" on public.modis_settings;
create policy "admin baca pengaturan" on public.modis_settings
  for select to authenticated using (public.modis_is_admin());
drop policy if exists "owner ubah pengaturan" on public.modis_settings;
create policy "owner ubah pengaturan" on public.modis_settings
  for all to authenticated using (public.modis_is_owner()) with check (public.modis_is_owner());

insert into public.modis_settings (key, value) values
  ('campaign', jsonb_build_object(
      'start', '2026-10-26', 'days', 98,
      'name', 'Mobile Activation PAHE (Paket Hemat) – Jakarta & Bogor',
      'client', 'Grab · Milli')),
  ('targets', jsonb_build_object(
      'reach', 295000, 'contact', 146000, 'conversion', 58800,
      'reach_per_spg', 500, 'contact_per_spg', 250, 'conversion_per_spg', 100,
      'spg_per_unit', 2, 'units', 3)),
  ('merch_stock', jsonb_build_object('a', 1000, 'b', 5000, 'c', 10000, 'drinks', 0)),
  ('report_key', to_jsonb(replace(gen_random_uuid()::text, '-', ''))),
  ('live_sheet_url', to_jsonb(''::text))
on conflict (key) do nothing;

-- 2. Laporan akhir slot -------------------------------------------------
create table if not exists public.modis_slot_reports (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null,
  unit_type     text not null,
  duty_hours    text not null default '',
  poi_location  text not null default '',
  poi_category  text,
  spg_name      text,
  reach         integer not null default 0 check (reach between 0 and 100000),
  contact       integer not null default 0 check (contact between 0 and 100000),
  conversion    integer not null default 0 check (conversion between 0 and 100000),
  merch_a       integer not null default 0 check (merch_a between 0 and 100000),
  merch_b       integer not null default 0 check (merch_b between 0 and 100000),
  merch_c       integer not null default 0 check (merch_c between 0 and 100000),
  drinks        integer not null default 0 check (drinks between 0 and 100000),
  notes         text check (coalesce(length(notes), 0) <= 500),
  device_id     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint modis_slot_reports_text_len check (
    length(unit_type) <= 40 and length(duty_hours) <= 20 and length(poi_location) <= 120
    and coalesce(length(poi_category), 0) <= 40 and coalesce(length(spg_name), 0) <= 60 and length(device_id) <= 60
  ),
  constraint modis_slot_reports_uniq unique (report_date, unit_type, duty_hours, poi_location, device_id)
);
alter table public.modis_slot_reports enable row level security;
create index if not exists modis_slot_reports_date_idx on public.modis_slot_reports (report_date);

drop policy if exists "admin baca laporan slot" on public.modis_slot_reports;
create policy "admin baca laporan slot" on public.modis_slot_reports
  for select to authenticated using (public.modis_is_admin());
drop policy if exists "owner ubah laporan slot" on public.modis_slot_reports;
create policy "owner ubah laporan slot" on public.modis_slot_reports
  for update to authenticated using (public.modis_is_owner()) with check (public.modis_is_owner());
drop policy if exists "owner hapus laporan slot" on public.modis_slot_reports;
create policy "owner hapus laporan slot" on public.modis_slot_reports
  for delete to authenticated using (public.modis_is_owner());

-- 3. Kirim laporan slot dari tablet SPG -------------------------------
create or replace function public.modis_submit_slot_report(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := (p->>'report_date')::date;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_id uuid;
begin
  if v_date is null or v_date < v_today - 2 or v_date > v_today + 1 then
    raise exception 'Tanggal laporan tidak valid';
  end if;
  insert into public.modis_slot_reports as s (
    report_date, unit_type, duty_hours, poi_location, poi_category, spg_name,
    reach, contact, conversion, merch_a, merch_b, merch_c, drinks, notes, device_id
  ) values (
    v_date,
    left(coalesce(p->>'unit_type', ''), 40),
    left(coalesce(p->>'duty_hours', ''), 20),
    left(coalesce(p->>'poi_location', ''), 120),
    left(p->>'poi_category', 40),
    left(p->>'spg_name', 60),
    greatest(0, coalesce((p->>'reach')::int, 0)),
    greatest(0, coalesce((p->>'contact')::int, 0)),
    greatest(0, coalesce((p->>'conversion')::int, 0)),
    greatest(0, coalesce((p->>'merch_a')::int, 0)),
    greatest(0, coalesce((p->>'merch_b')::int, 0)),
    greatest(0, coalesce((p->>'merch_c')::int, 0)),
    greatest(0, coalesce((p->>'drinks')::int, 0)),
    left(p->>'notes', 500),
    left(coalesce(p->>'device_id', ''), 60)
  )
  on conflict (report_date, unit_type, duty_hours, poi_location, device_id) do update set
    poi_category = excluded.poi_category, spg_name = excluded.spg_name,
    reach = excluded.reach, contact = excluded.contact, conversion = excluded.conversion,
    merch_a = excluded.merch_a, merch_b = excluded.merch_b, merch_c = excluded.merch_c,
    drinks = excluded.drinks, notes = excluded.notes, updated_at = now()
  returning s.id into v_id;
  return v_id;
end;
$$;
revoke all on function public.modis_submit_slot_report(jsonb) from public;
grant execute on function public.modis_submit_slot_report(jsonb) to anon, authenticated;

-- 4. Data halaman report klien ---------------------------------------
-- Baris visitor dikirim dalam bentuk ringkas, tanpa nama/WA/email.
-- uid = potongan hash nomor WA, hanya untuk menghitung orang unik.
-- "recent" = 300 visitor terbaru: nama depan + WA tersamar.
create or replace function public.modis_public_report(p_key text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_from timestamptz;
  v_to timestamptz;
begin
  select value #>> '{}' into v_key from public.modis_settings where key = 'report_key';
  if v_key is null or p_key is distinct from v_key then
    raise exception 'Link laporan tidak valid' using errcode = '28000';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Rentang tanggal tidak valid';
  end if;
  v_from := (p_from::text || ' 00:00:00+07')::timestamptz;
  v_to := ((p_to + 1)::text || ' 00:00:00+07')::timestamptz;

  return jsonb_build_object(
    'settings', (
      select jsonb_object_agg(key, value) from public.modis_settings
      where key in ('campaign', 'targets', 'merch_stock', 'live_sheet_url')
    ),
    'visitors', coalesce((
      select jsonb_agg(jsonb_build_array(
        v.created_at, v.poi_location, v.poi_category, v.unit_type, v.duty_hours, v.boros_status,
        v.monthly_savings, v.stamps_count, v.reward_claimed,
        left(md5(coalesce(v.phone_number, v.id::text)), 12)
      ) order by v.created_at)
      from public.modis_visitors v
      where v.created_at >= v_from and v.created_at < v_to
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_array(
        r.created_at, split_part(coalesce(r.full_name, ''), ' ', 1),
        case when r.phone_number is null then '' else
          '0' || substr(r.phone_number, 4, 3) || '****' || right(r.phone_number, 3) end,
        r.poi_location, r.unit_type, r.duty_hours, r.boros_status, r.monthly_savings, r.reward_claimed, r.poi_category
      ) order by r.created_at desc)
      from (
        select * from public.modis_visitors v
        where v.created_at >= v_from and v.created_at < v_to
        order by v.created_at desc limit 300
      ) r
    ), '[]'::jsonb),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_array(
        s.report_date, s.unit_type, s.duty_hours, s.poi_location, s.poi_category,
        s.reach, s.contact, s.conversion, s.merch_a, s.merch_b, s.merch_c, s.drinks
      ) order by s.report_date)
      from public.modis_slot_reports s
      where s.report_date between p_from and p_to
    ), '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;
revoke all on function public.modis_public_report(text, date, date) from public;
grant execute on function public.modis_public_report(text, date, date) to anon, authenticated;
