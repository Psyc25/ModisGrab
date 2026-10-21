-- fase2m: shift jadi 3 (AM = Pagi, MID = Siang, PM = Sore/Malam)
-- 1) constraint modis_sessions.shift  2) semua fungsi yang memeriksa ('AM','PM')
do $$
declare r record; d text;
begin
  for r in
    select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.conrelid = 'public.modis_sessions'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%''AM''%'
  loop
    execute format('alter table public.modis_sessions drop constraint %I', r.conname);
  end loop;
  alter table public.modis_sessions add constraint modis_sessions_shift_check check (shift in ('AM', 'MID', 'PM'));

  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%(''AM'', ''PM'')%'
  loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, '(''AM'', ''PM'')', '(''AM'', ''MID'', ''PM'')');
    d := replace(d, 'Pilih shift AM atau PM', 'Pilih shift Pagi, Siang, atau Sore/Malam');
    execute d;
  end loop;
end $$;

select 'FASE2M-OK' as hasil,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind = 'f' and p.prosrc like '%(''AM'', ''PM'')%') as fungsi_lama_tersisa;
