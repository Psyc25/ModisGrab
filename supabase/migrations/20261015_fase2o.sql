-- Fase 2o: jadwal kerja crew (satu hari = satu shift 9 jam), diatur office di dashboard.
-- Setting 'jadwal' = {shifts:{AM:{name,jam},...}, weekdays:{"0".."6":"AM|MID|PM|"}, days:{"YYYY-MM-DD":"AM|MID|PM|"}}.
-- Jadwal tidak rahasia: tablet crew membacanya sebelum login lewat modis_f1_jadwal().

create or replace function public.modis_f1_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  if p_key not in ('pool_mix', 'program', 'welcome', 'plotting', 'jadwal') then raise exception 'Pengaturan tidak dikenal'; end if;
  if p_key = 'welcome' and (jsonb_typeof(p_value->'rotation') is distinct from 'array' or jsonb_array_length(p_value->'rotation') = 0) then
    raise exception 'Rotasi welcome tidak valid';
  end if;
  if p_key = 'plotting' and jsonb_typeof(p_value->'days') is distinct from 'object' then
    raise exception 'Format plotting tidak valid';
  end if;
  if p_key = 'jadwal' and (jsonb_typeof(p_value) is distinct from 'object' or length(p_value::text) > 20000) then
    raise exception 'Format jadwal tidak valid';
  end if;
  insert into public.modis_settings (key, value, updated_at)
  values (p_key, case when p_key = 'plotting' then p_value || jsonb_build_object('updated_at', now()) else p_value end, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end; $$;
revoke all on function public.modis_f1_set_setting(text, jsonb) from public, anon;
grant execute on function public.modis_f1_set_setting(text, jsonb) to authenticated;

create or replace function public.modis_f1_jadwal()
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.modis_settings where key = 'jadwal';
$$;
grant execute on function public.modis_f1_jadwal() to anon, authenticated;

select 'FASE2O-OK' as status;
