-- =====================================================================
-- MODIS Cek Boros - pelacakan lokasi tablet unit (9 Okt 2026)
-- Tablet SPG mengirim posisi GPS selama jam jaga. Hanya akun owner/klien
-- (dashboard internal) yang bisa membaca. Tablet tidak punya akun, jadi
-- kirim lewat fungsi security definer dengan validasi & batas frekuensi.
-- Aman dijalankan ulang.
-- =====================================================================

create table if not exists public.modis_device_positions (
  device_id     text primary key,
  spg_name      text,
  unit_type     text,
  poi_location  text,
  duty_hours    text,
  lat           double precision not null,
  lng           double precision not null,
  accuracy      real,
  updated_at    timestamptz not null default now()
);

create table if not exists public.modis_position_log (
  id            bigserial primary key,
  device_id     text not null,
  spg_name      text,
  unit_type     text,
  poi_location  text,
  lat           double precision not null,
  lng           double precision not null,
  accuracy      real,
  created_at    timestamptz not null default now()
);
create index if not exists modis_position_log_time_idx on public.modis_position_log (created_at);
create index if not exists modis_position_log_dev_idx on public.modis_position_log (device_id, created_at);

alter table public.modis_device_positions enable row level security;
alter table public.modis_position_log enable row level security;

drop policy if exists "admin baca posisi" on public.modis_device_positions;
create policy "admin baca posisi" on public.modis_device_positions for select to authenticated using (public.modis_is_admin());
drop policy if exists "admin baca log posisi" on public.modis_position_log;
create policy "admin baca log posisi" on public.modis_position_log for select to authenticated using (public.modis_is_admin());
drop policy if exists "owner hapus log posisi" on public.modis_position_log;
create policy "owner hapus log posisi" on public.modis_position_log for delete to authenticated using (public.modis_is_owner());

create or replace function public.modis_report_position(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dev text := left(coalesce(p->>'device_id', ''), 60);
  v_lat double precision := (p->>'lat')::double precision;
  v_lng double precision := (p->>'lng')::double precision;
  v_last timestamptz;
begin
  if v_dev = '' or v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'Posisi tidak valid';
  end if;

  insert into public.modis_device_positions as d (device_id, spg_name, unit_type, poi_location, duty_hours, lat, lng, accuracy, updated_at)
  values (v_dev, left(p->>'spg_name', 60), left(p->>'unit_type', 40), left(p->>'poi_location', 120), left(p->>'duty_hours', 20),
          v_lat, v_lng, least(greatest(coalesce((p->>'accuracy')::real, 0), 0), 100000), now())
  on conflict (device_id) do update set
    spg_name = excluded.spg_name, unit_type = excluded.unit_type, poi_location = excluded.poi_location,
    duty_hours = excluded.duty_hours, lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, updated_at = now();

  -- Jejak perjalanan: paling sering 1 titik per 50 detik per tablet
  select max(created_at) into v_last from public.modis_position_log where device_id = v_dev and created_at > now() - interval '1 minute';
  if v_last is null or v_last < now() - interval '50 seconds' then
    insert into public.modis_position_log (device_id, spg_name, unit_type, poi_location, lat, lng, accuracy)
    values (v_dev, left(p->>'spg_name', 60), left(p->>'unit_type', 40), left(p->>'poi_location', 120), v_lat, v_lng,
            least(greatest(coalesce((p->>'accuracy')::real, 0), 0), 100000));
  end if;
end;
$$;
revoke all on function public.modis_report_position(jsonb) from public;
grant execute on function public.modis_report_position(jsonb) to anon, authenticated;
