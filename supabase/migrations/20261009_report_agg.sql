-- =====================================================================
-- MODIS Cek Boros - laporan klien (9 Okt 2026)
-- Ringkasan agregat per hari untuk dashboard laporan klien di Google Sheets.
-- Tidak mengembalikan data pribadi (nama, WA, email).
-- security invoker: RLS tetap berlaku, jadi hanya akun owner/client yang dapat data.
-- Aman dijalankan ulang.
-- =====================================================================
create or replace function public.modis_report_agg(p_from date, p_to date)
returns table (
  day date,
  poi_category text,
  poi_location text,
  unit_type text,
  duty_hours text,
  boros_status text,
  reward_claimed text,
  visitors bigint,
  savings_sum bigint,
  stamps_sum bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (v.created_at at time zone 'Asia/Jakarta')::date as day,
    v.poi_category,
    v.poi_location,
    v.unit_type,
    v.duty_hours,
    v.boros_status,
    v.reward_claimed,
    count(*)::bigint as visitors,
    coalesce(sum(v.monthly_savings), 0)::bigint as savings_sum,
    coalesce(sum(v.stamps_count), 0)::bigint as stamps_sum
  from public.modis_visitors v
  where (v.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  group by 1, 2, 3, 4, 5, 6, 7;
$$;

revoke all on function public.modis_report_agg(date, date) from public, anon;
grant execute on function public.modis_report_agg(date, date) to authenticated;
