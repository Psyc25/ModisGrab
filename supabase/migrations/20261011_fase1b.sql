-- =====================================================================
-- MODIS Field App — Fase 1 lanjutan: Golden coupon, purge data uji, stok idempotent.
-- Aman dijalankan ulang.
-- =====================================================================

-- Golden: tanggal disimpan di modis_settings('golden'), kode PM (hash) di modis_secrets
create or replace function public.modis_f1_set_golden(p_dates date[], p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya owner' using errcode = '42501'; end if;
  insert into public.modis_settings (key, value, updated_at)
  values ('golden', jsonb_build_object('dates', to_jsonb(coalesce(p_dates, '{}'::date[]))), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  if p_code is not null and length(p_code) > 0 then
    if p_code !~ '^[A-Za-z0-9]{4,12}$' then raise exception 'Kode PM 4-12 huruf/angka'; end if;
    insert into public.modis_secrets (k, v) values ('golden_code', extensions.crypt(upper(p_code), extensions.gen_salt('bf')))
    on conflict (k) do update set v = excluded.v;
  end if;
end; $$;
revoke all on function public.modis_f1_set_golden(date[], text) from public, anon;
grant execute on function public.modis_f1_set_golden(date[], text) to authenticated;

create or replace function public.modis_f1_golden_today()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value->'dates') ? public.modis_wib_day(now())::text from public.modis_settings s where s.key = 'golden'), false);
$$;
revoke all on function public.modis_f1_golden_today() from public, anon, authenticated;

-- Login: sertakan status Golden hari ini
create or replace function public.modis_f1_login(p_unit text, p_pin text, p_spg text, p_shift text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u public.modis_units;
  v_role text;
  v_tok uuid;
  v_exp timestamptz := now() + interval '12 hours';
begin
  select * into u from public.modis_units where id = p_unit;
  if not found then raise exception 'Unit tidak dikenal'; end if;
  if length(trim(coalesce(p_spg, ''))) < 2 then raise exception 'Isi nama SPG'; end if;
  if p_shift not in ('AM', 'PM') then raise exception 'Pilih shift AM atau PM'; end if;
  if (select count(*) from public.modis_login_fails f where f.unit_id = p_unit and f.at > now() - interval '10 minutes') >= 15 then
    raise exception 'Terlalu banyak PIN salah. Coba lagi 10 menit lagi.';
  end if;
  if u.tl_pin_hash is not null and u.tl_pin_hash = extensions.crypt(p_pin, u.tl_pin_hash) then v_role := 'tl';
  elsif u.pin_hash is not null and u.pin_hash = extensions.crypt(p_pin, u.pin_hash) then v_role := 'spg';
  else
    insert into public.modis_login_fails (unit_id) values (p_unit);
    raise exception 'PIN salah';
  end if;
  insert into public.modis_sessions (unit_id, spg_name, role, shift, device_id, expires_at)
  values (p_unit, left(trim(p_spg), 60), v_role, p_shift, left(p_device, 60), v_exp)
  returning token into v_tok;
  return jsonb_build_object('token', v_tok, 'role', v_role, 'unit_id', u.id, 'unit_name', u.name, 'spg_name', left(trim(p_spg), 60),
    'shift', p_shift, 'expires_at', v_exp, 'golden_today', public.modis_f1_golden_today());
end; $$;
grant execute on function public.modis_f1_login(text, text, text, text, text) to anon, authenticated;

-- Submit: Golden hanya TL, hanya tanggal Golden, kode PM benar. Bila tidak sah: ditandai conflict.
create or replace function public.modis_f1_submit(p_token uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.modis_sessions;
  v_id text := left(coalesce(p->>'id', ''), 64);
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9]', '', 'g');
  v_type text := p->>'type';
  v_reward text := coalesce(p->>'reward', 'none');
  v_at timestamptz;
  v_day date;
  v_hash text;
  v_status text := 'ok';
  v_note text;
  v_key text;
  v_gc text;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null then raise exception 'Sesi tidak sah, login ulang' using errcode = '28000'; end if;
  if v_id = '' then raise exception 'ID kosong'; end if;
  if exists (select 1 from public.modis_conversions where id = v_id) then
    return jsonb_build_object('id', v_id, 'status', 'duplicate');
  end if;
  if v_phone !~ '^628[0-9]{7,11}$' then raise exception 'Nomor HP tidak valid'; end if;
  if v_type not in ('pahe_new', 'pahe_lapsed', 'gb_hemat') then raise exception 'Tipe tidak valid'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'Consent wajib'; end if;
  v_at := coalesce((p->>'created_at')::timestamptz, now());
  if v_at > now() + interval '10 minutes' or v_at < now() - interval '3 days' then v_at := now(); end if;
  v_day := public.modis_wib_day(v_at);
  v_hash := public.modis_f1_phone_hash(v_phone);

  if v_type like 'pahe%' and exists (select 1 from public.modis_conversions c where c.phone_hash = v_hash and c.type like 'pahe%' and c.status = 'ok') then
    v_status := 'conflict'; v_note := 'PaHe sudah pernah diklaim nomor ini';
  elsif v_type = 'gb_hemat' and exists (select 1 from public.modis_conversions c where c.phone_hash = v_hash and c.type = 'gb_hemat' and c.claim_day = v_day and c.status = 'ok') then
    v_status := 'conflict'; v_note := 'GB Hemat sudah diklaim hari ini';
  end if;

  if v_reward = 'golden' then
    select v into v_gc from public.modis_secrets where k = 'golden_code';
    if s.role <> 'tl' then v_status := 'conflict'; v_note := 'Golden hanya boleh diinput TL';
    elsif not coalesce((select (st.value->'dates') ? v_day::text from public.modis_settings st where st.key = 'golden'), false) then
      v_status := 'conflict'; v_note := 'Bukan tanggal Golden';
    elsif v_gc is null or v_gc <> extensions.crypt(upper(coalesce(p->>'golden_code', '')), v_gc) then
      v_status := 'conflict'; v_note := 'Kode PM Golden salah';
    end if;
  end if;

  select v into v_key from public.modis_secrets where k = 'phone_key';
  insert into public.modis_conversions (id, created_at, claim_day, unit_id, shift, spg_name, session_token, poi_location, poi_category,
    phone_hash, phone_enc, phone_last4, name, type, reward, extra_draw, photobooth, consent, consent_ver, status, conflict_note)
  values (v_id, v_at, v_day, s.unit_id, s.shift, s.spg_name, s.token, left(p->>'poi_location', 120), left(p->>'poi_category', 40),
    v_hash, extensions.pgp_sym_encrypt(v_phone, v_key), right(v_phone, 4), left(trim(coalesce(p->>'name', '')), 80), v_type,
    v_reward, coalesce((p->>'extra_draw')::boolean, false), coalesce((p->>'photobooth')::boolean, false),
    true, left(p->>'consent_ver', 20), v_status, v_note);
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end; $$;
grant execute on function public.modis_f1_submit(uuid, jsonb) to anon, authenticated;

-- Stok: idempotent per operasi (op_id) supaya antrean offline tidak dobel
alter table public.modis_stock_moves add column if not exists op_id text;
create unique index if not exists modis_stock_op_idx on public.modis_stock_moves (op_id, item) where op_id is not null;

create or replace function public.modis_f1_stock(p_token uuid, p_kind text, p_items jsonb, p_op text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.modis_sessions; k text; v int;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null or s.role <> 'tl' then raise exception 'Khusus Team Leader' using errcode = '42501'; end if;
  if p_kind not in ('opening', 'refill', 'closing') then raise exception 'Jenis stok tidak valid'; end if;
  if p_op is not null and exists (select 1 from public.modis_stock_moves where op_id = p_op) then return; end if;
  for k, v in select key, (value)::int from jsonb_each_text(p_items) loop
    insert into public.modis_stock_moves (unit_id, day, shift, kind, item, qty, by_name, op_id)
    values (s.unit_id, public.modis_wib_day(now()), s.shift, p_kind, left(k, 30), greatest(0, v), s.spg_name, left(p_op, 64));
  end loop;
end; $$;
grant execute on function public.modis_f1_stock(uuid, text, jsonb, text) to anon, authenticated;
drop function if exists public.modis_f1_stock(uuid, text, jsonb);

-- Purge data uji: juga conversion [QC] dan sesi uji, serta semua data sebelum tanggal tertentu
create or replace function public.modis_purge_test_data(p_qc boolean default true, p_before date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_vis int := 0; v_slot int := 0; v_pos int := 0; v_conv int := 0; n int;
begin
  if not public.modis_is_owner() then raise exception 'Hanya owner yang boleh menghapus data' using errcode = '42501'; end if;
  if p_qc then
    delete from public.modis_visitors where device_id = 'qc-dummy' or full_name like '[QC]%';
    get diagnostics n = row_count; v_vis := v_vis + n;
    delete from public.modis_conversions where name like '[QC]%' or spg_name like '[QC]%' or id like 'qc_%';
    get diagnostics n = row_count; v_conv := v_conv + n;
    delete from public.modis_stock_moves where by_name like '[QC]%';
    delete from public.modis_close_days where closed_by like '[QC]%';
    delete from public.modis_sessions s where s.spg_name like '[QC]%' and not exists (select 1 from public.modis_conversions c where c.session_token = s.token);
  end if;
  if p_before is not null then
    delete from public.modis_visitors where (created_at at time zone 'Asia/Jakarta')::date < p_before;
    get diagnostics n = row_count; v_vis := v_vis + n;
    delete from public.modis_slot_reports where report_date < p_before;
    get diagnostics n = row_count; v_slot := v_slot + n;
    delete from public.modis_position_log where (created_at at time zone 'Asia/Jakarta')::date < p_before;
    get diagnostics n = row_count; v_pos := v_pos + n;
    delete from public.modis_device_positions where (updated_at at time zone 'Asia/Jakarta')::date < p_before;
    delete from public.modis_conversions where claim_day < p_before;
    get diagnostics n = row_count; v_conv := v_conv + n;
    delete from public.modis_stock_moves where day < p_before;
    delete from public.modis_close_days where day < p_before;
  end if;
  return jsonb_build_object('visitors', v_vis, 'slot_reports', v_slot, 'positions', v_pos, 'conversions', v_conv);
end; $$;
revoke all on function public.modis_purge_test_data(boolean, date) from public, anon;
grant execute on function public.modis_purge_test_data(boolean, date) to authenticated;

-- Office: export dengan nomor penuh (khusus owner), per rentang tanggal
create or replace function public.modis_f1_export(p_from date, p_to date)
returns table (id text, created_at timestamptz, claim_day date, unit_id text, shift text, spg_name text, poi_location text, poi_category text,
  name text, phone text, type text, reward text, extra_draw boolean, photobooth boolean, status text, conflict_note text, photo_path text)
language plpgsql stable security definer set search_path = '' as $$
declare v_key text;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  select v into v_key from public.modis_secrets where k = 'phone_key';
  return query select c.id, c.created_at, c.claim_day, c.unit_id, c.shift, c.spg_name, c.poi_location, c.poi_category, c.name,
    extensions.pgp_sym_decrypt(c.phone_enc, v_key), c.type, c.reward, c.extra_draw, c.photobooth, c.status, c.conflict_note, c.photo_path
  from public.modis_conversions c where c.claim_day between p_from and p_to order by c.created_at;
end; $$;
revoke all on function public.modis_f1_export(date, date) from public, anon;
grant execute on function public.modis_f1_export(date, date) to authenticated;

-- Office menandai conflict sebagai sah / tetap ditolak
create or replace function public.modis_f1_resolve(p_id text, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  update public.modis_conversions set status = case when p_ok then 'ok' else 'conflict' end,
    conflict_note = case when p_ok then coalesce('Disetujui office: ' || nullif(p_note, ''), 'Disetujui office') else coalesce(p_note, conflict_note) end
  where id = p_id;
end; $$;
revoke all on function public.modis_f1_resolve(text, boolean, text) from public, anon;
grant execute on function public.modis_f1_resolve(text, boolean, text) to authenticated;
