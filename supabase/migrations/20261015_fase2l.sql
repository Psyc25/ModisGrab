-- Fase 2l: laporan klien Cek Boros per venue + rata-rata ongkos (tambahan kolom di akhir array, kompatibel dengan versi lama)

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
      select jsonb_agg(jsonb_build_array(day, unit_id, status, n, s, poi, c) order by day)
      from (select day, unit_id, coalesce(status, '-') status, count(*) n, coalesce(sum(savings), 0) s,
                   coalesce(poi_location, '-') poi, coalesce(sum(monthly_cost), 0) c
            from public.modis_boros_checks where day between p_from and p_to group by 1, 2, 3, 6) t), '[]'::jsonb)
  );
end; $$;
grant execute on function public.modis_f1_public_field(text, date, date) to anon, authenticated;

select 'FASE2L-OK' as status;
