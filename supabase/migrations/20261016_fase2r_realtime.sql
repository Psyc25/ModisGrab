-- Fase 2r: realtime dashboard office. Tabel ditambahkan ke publikasi supabase_realtime.
-- Realtime tetap tunduk pada RLS: hanya admin (policy select) yang menerima perubahan.
do $$
declare t text;
begin
  foreach t in array array['modis_conversions','modis_issues','modis_close_days','modis_stock_moves','modis_warehouse_moves','modis_gb_history','modis_device_positions','modis_position_log','modis_slot_reports','modis_boros_checks']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
select 'FASE2R-OK' as status, count(*) as tabel_realtime from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';
