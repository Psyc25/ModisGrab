-- Fase 2q: rapikan sisa lama.
-- 1) Sesi login 12 jam -> 11 jam (satu shift 9 jam + selisih)  2) hapus fungsi pengaturan Golden yang sudah tidak dipakai aplikasi.
do $$
declare r record; d text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'modis_f1_login' and p.prosrc like '%interval ''12 hours''%'
  loop
    d := replace(pg_get_functiondef(r.oid), 'interval ''12 hours''', 'interval ''11 hours''');
    execute d;
  end loop;
end $$;

drop function if exists public.modis_f1_set_golden(date[], text);
drop function if exists public.modis_f1_set_golden2(date[], date[], text);

select 'FASE2Q-OK' as status,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'modis_f1_login' and p.prosrc like '%interval ''11 hours''%') as login_11jam,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'modis_f1_set_golden%') as golden_tersisa;
