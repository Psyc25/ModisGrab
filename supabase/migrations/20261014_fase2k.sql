-- Fase 2k: hasil Cek Boros tersimpan + laporan klien lengkap (stamp, merchandise, Cek Boros).
-- Tidak ada data pribadi di tabel Cek Boros (tanpa nama / nomor HP).

create table if not exists public.modis_boros_checks (
  op_id         text primary key,
  unit_id       text not null,
  day           date not null,
  shift         text,
  spg_name      text,
  poi_location  text,
  trips_day     text,
  trip_cost     text,
  trips_month   int,
  monthly_cost  int,
  discount      int,
  savings       int,
  status        text,
  created_at    timestamptz not null default now()
);
create index if not exists modis_boros_day_idx on public.modis_boros_checks (day, unit_id);
alter table public.modis_boros_checks enable row level security;
revoke all on public.modis_boros_checks from anon;
drop policy if exists "admin baca cek boros" on public.modis_boros_checks;
create policy "admin baca cek boros" on public.modis_boros_checks for select to authenticated using (public.modis_is_admin());

-- Dipanggil aplikasi crew (SPG / TL) setiap Cek Boros selesai; idempotent per op_id
create or replace function public.modis_f1_boros(p_token uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.modis_sessions;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null then raise exception 'Sesi tidak valid' using errcode = '42501'; end if;
  insert into public.modis_boros_checks (op_id, unit_id, day, shift, spg_name, poi_location, trips_day, trip_cost, trips_month, monthly_cost, discount, savings, status)
  values (left(p->>'op', 64), s.unit_id, public.modis_wib_day(now()), s.shift, s.spg_name, left(p->>'poi', 120),
    left(p->>'trips_day', 20), left(p->>'trip_cost', 20),
    least(greatest(coalesce((p->>'trips_month')::int, 0), 0), 1000),
    least(greatest(coalesce((p->>'monthly_cost')::int, 0), 0), 100000000),
    least(greatest(coalesce((p->>'discount')::int, 0), 0), 100000),
    least(greatest(coalesce((p->>'savings')::int, 0), 0), 10000000),
    left(p->>'status', 20))
  on conflict (op_id) do nothing;
end; $$;
grant execute on function public.modis_f1_boros(uuid, jsonb) to anon, authenticated;

-- Laporan klien: tambah merchandise per barang, kartu stamp lengkap per hari, dan ringkasan Cek Boros
create or replace function public.modis_f1_public_field(p_key text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_key text;
begin
  select value #>> '{}' into v_key from public.modis_settings where key = 'report_key';
  if v_key is null or p_key is distinct from v_key then raise exception 'Link laporan tidak valid' using errcode = '28000'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Rentang tanggal tidak valid'; end if;
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_array(claim_day, unit_id, coalesce(poi_location, '-'), coalesce(poi_category, '-'), type, n, pb) order by claim_day)
      from (select claim_day, unit_id, poi_location, poi_category, type, count(*) n, count(*) filter (where photobooth) pb
            from public.modis_conversions where status = 'ok' and claim_day between p_from and p_to
            group by 1, 2, 3, 4, 5) t), '[]'::jsonb),
    'rewards', coalesce((
      select jsonb_object_agg(r, n) from (select r, count(*) n from (
          select reward r from public.modis_conversions where status = 'ok' and claim_day between p_from and p_to
          union all
          select reward2 from public.modis_conversions where status = 'ok' and claim_day between p_from and p_to and reward2 is not null) x
        group by r) t), '{}'::jsonb),
    'merch', coalesce((
      select jsonb_object_agg(m, n) from (select m, count(*) n from (
          select merch m from public.modis_conversions where status = 'ok' and claim_day between p_from and p_to and merch is not null
          union all
          select merch2 from public.modis_conversions where status = 'ok' and claim_day between p_from and p_to and merch2 is not null
          union all
          select prize from public.modis_conversions where status = 'ok' and claim_day between p_from and p_to and prize is not null) x
        group by m) t), '{}'::jsonb),
    'reach', coalesce((
      select jsonb_agg(jsonb_build_array(day, unit_id, reach, contacts) order by day)
      from public.modis_close_days where day between p_from and p_to), '[]'::jsonb),
    'stamps', coalesce((
      select jsonb_agg(jsonb_build_array(day, coalesce(unit_id, '-'), n) order by day)
      from (select day, unit_id, count(*) n from public.modis_stamp_cards where day between p_from and p_to group by 1, 2) t), '[]'::jsonb),
    'boros', coalesce((
      select jsonb_agg(jsonb_build_array(day, unit_id, status, n, s) order by day)
      from (select day, unit_id, coalesce(status, '-') status, count(*) n, coalesce(sum(savings), 0) s
            from public.modis_boros_checks where day between p_from and p_to group by 1, 2, 3) t), '[]'::jsonb)
  );
end; $$;
grant execute on function public.modis_f1_public_field(text, date, date) to anon, authenticated;

select 'FASE2K-OK' as status;
