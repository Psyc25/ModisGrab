-- =====================================================================
-- MODIS Field App rev2: pengaturan rotasi welcome snack mingguan.
-- Aman dijalankan ulang.
-- =====================================================================

create or replace function public.modis_f1_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  if p_key not in ('pool_mix', 'program', 'welcome') then raise exception 'Pengaturan tidak dikenal'; end if;
  if p_key = 'welcome' and (jsonb_typeof(p_value->'rotation') is distinct from 'array' or jsonb_array_length(p_value->'rotation') = 0) then
    raise exception 'Rotasi welcome tidak valid';
  end if;
  insert into public.modis_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end; $$;
revoke all on function public.modis_f1_set_setting(text, jsonb) from public, anon;
grant execute on function public.modis_f1_set_setting(text, jsonb) to authenticated;

insert into public.modis_settings (key, value, updated_at)
values ('welcome', '{"rotation":["w_pisang","w_telur"]}'::jsonb, now())
on conflict (key) do nothing;

create or replace function public.modis_f1_unit_today(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.modis_sessions; d date := public.modis_wib_day(now());
begin
  s := public.modis_f1_session(p_token);
  if s.token is null then raise exception 'Sesi habis' using errcode = '28000'; end if;
  return jsonb_build_object(
    'day', d,
    'by_type', coalesce((select jsonb_object_agg(type, n) from (select type, count(*) n from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'ok' group by type) t), '{}'::jsonb),
    'by_reward', coalesce((select jsonb_object_agg(r, n) from (
        select r, count(*) n from (
          select reward r from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'ok'
          union all
          select reward2 from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'ok' and reward2 is not null
        ) x group by r) t), '{}'::jsonb),
    'by_merch', coalesce((select jsonb_object_agg(m, n) from (
        select m, count(*) n from (
          select merch m from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'ok' and merch is not null
          union all
          select merch2 from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'ok' and merch2 is not null
        ) x group by m) t), '{}'::jsonb),
    'by_hour', coalesce((select jsonb_object_agg(h, n) from (select extract(hour from created_at at time zone 'Asia/Jakarta')::int h, count(*) n from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'ok' group by 1) t), '{}'::jsonb),
    'photobooth', (select count(*) from public.modis_conversions where unit_id = s.unit_id and claim_day = d and photobooth),
    'conflicts', (select count(*) from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'conflict'),
    'stock', coalesce((select jsonb_object_agg(kind || ':' || item, q) from (select kind, item, sum(qty) q from public.modis_stock_moves where unit_id = s.unit_id and day = d group by kind, item) t), '{}'::jsonb),
    'pool_mix', (select value from public.modis_settings where key = 'pool_mix'),
    'open_issues', (select count(*) from public.modis_issues where unit_id = s.unit_id and status = 'open'),
    -- Untuk isi otomatis opening: closing terakhir unit + kiriman gudang hari ini
    'prev_closing', coalesce((select jsonb_object_agg(item, q) from (select item, sum(qty) q from public.modis_stock_moves
        where unit_id = s.unit_id and kind = 'closing' and day = (select max(day) from public.modis_stock_moves where unit_id = s.unit_id and kind = 'closing' and day < d)
        group by item) t), '{}'::jsonb),
    'wh_today', coalesce((select jsonb_object_agg(item, q) from (select item, sum(case when kind = 'out' then qty else -qty end) q from public.modis_warehouse_moves
        where unit_id = s.unit_id and day = d and kind in ('out', 'return') group by item) t), '{}'::jsonb),
    -- Rotasi welcome snack mingguan (roti setiap hari + item mingguan)
    'welcome', (select value from public.modis_settings where key = 'welcome')
  );
end; $$;
grant execute on function public.modis_f1_unit_today(uuid) to anon, authenticated;

select 'FASE2D-OK' as hasil;
