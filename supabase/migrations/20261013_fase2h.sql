-- =====================================================================
-- MODIS: data visitor untuk klien Grab (disetujui owner), dibuka dengan link klien + PIN klien.
-- PIN disimpan sebagai hash (bcrypt). Aman dijalankan ulang.
-- =====================================================================

create or replace function public.modis_f1_set_client_pin(p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{6,8}$' then raise exception 'PIN klien 6-8 angka'; end if;
  insert into public.modis_secrets (k, v) values ('client_pin', extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (k) do update set v = excluded.v;
end; $$;
revoke all on function public.modis_f1_set_client_pin(text) from public, anon;
grant execute on function public.modis_f1_set_client_pin(text) to authenticated;

create or replace function public.modis_f1_client_pin_set()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.modis_secrets where k = 'client_pin');
$$;
grant execute on function public.modis_f1_client_pin_set() to authenticated;

create or replace function public.modis_f1_public_visitors(p_key text, p_pin text, p_from date, p_to date)
returns table (created_at timestamptz, claim_day date, unit_id text, shift text, spg_name text, poi_location text,
  name text, phone text, email text, type text, reward text, merch text, prize text, photobooth boolean)
language plpgsql security definer set search_path = '' as $$
declare v_rk text; v_pin text; v_key text;
begin
  select value #>> '{}' into v_rk from public.modis_settings where key = 'report_key';
  if v_rk is null or p_key is distinct from v_rk then raise exception 'Link laporan tidak valid' using errcode = '28000'; end if;
  select v into v_pin from public.modis_secrets where k = 'client_pin';
  if v_pin is null then raise exception 'PIN klien belum diatur oleh tim proyek' using errcode = '28000'; end if;
  if coalesce(p_pin, '') = '' or v_pin <> extensions.crypt(p_pin, v_pin) then
    perform pg_sleep(1.5);
    raise exception 'PIN salah' using errcode = '28000';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Rentang tanggal tidak valid'; end if;
  select v into v_key from public.modis_secrets where k = 'phone_key';
  return query select c.created_at, c.claim_day, c.unit_id, c.shift, c.spg_name, c.poi_location, c.name,
    nullif(extensions.pgp_sym_decrypt(c.phone_enc, v_key), ''),
    case when c.email_enc is null then null else extensions.pgp_sym_decrypt(c.email_enc, v_key) end,
    c.type, c.reward, c.merch, c.prize, c.photobooth
  from public.modis_conversions c
  where c.status = 'ok' and c.claim_day between p_from and p_to and c.phone_hash not like 'purged:%'
  order by c.created_at desc
  limit 20000;
end; $$;
revoke all on function public.modis_f1_public_visitors(text, text, date, date) from public;
grant execute on function public.modis_f1_public_visitors(text, text, date, date) to anon, authenticated;

select 'FASE2H-OK' as hasil;
