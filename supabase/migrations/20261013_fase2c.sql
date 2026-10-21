-- =====================================================================
-- MODIS Field App — revisi QC 13 Okt: email customer (opsional, terenkripsi),
-- data untuk isi otomatis opening stok (closing terakhir + kiriman gudang hari ini).
-- =====================================================================
alter table public.modis_conversions add column if not exists email_enc bytea;

create or replace function public.modis_f1_submit(p_token uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.modis_sessions;
  v_id text := left(coalesce(p->>'id', ''), 64);
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9]', '', 'g');
  v_type text := p->>'type';
  v_reward text := coalesce(p->>'reward', 'none');
  v_reward2 text := nullif(p->>'reward2', '');
  v_bf boolean;
  v_spg text;
  v_shift text;
  v_at timestamptz;
  v_day date;
  v_hash text;
  v_status text := 'ok';
  v_note text;
  v_key text;
  v_gc text;
  v_email text := lower(trim(coalesce(p->>'email', '')));
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
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Format email tidak valid'; end if;
  if v_reward2 is not null and v_reward2 not in ('candy', 'tier_c', 'tier_b', 'tier_a') then v_reward2 := null; end if;

  v_bf := coalesce((p->>'backfill')::boolean, false) and s.role = 'tl';
  v_spg := case when v_bf and length(trim(coalesce(p->>'spg_name', ''))) >= 2 then left(trim(p->>'spg_name'), 60) else s.spg_name end;
  v_shift := case when v_bf and p->>'shift' in ('AM', 'PM') then p->>'shift' else s.shift end;
  v_at := coalesce((p->>'created_at')::timestamptz, now());
  if v_at > now() + interval '10 minutes' or v_at < now() - interval '3 days' then
    if v_bf then raise exception 'Input susulan maksimal 3 hari ke belakang'; end if;
    v_at := now();
  end if;
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
    phone_hash, phone_enc, phone_last4, name, type, reward, extra_draw, photobooth, consent, consent_ver, status, conflict_note, backfill, entered_by,
    merch, reward2, merch2, prize, email_enc)
  values (v_id, v_at, v_day, s.unit_id, v_shift, v_spg, s.token, left(p->>'poi_location', 120), left(p->>'poi_category', 40),
    v_hash, extensions.pgp_sym_encrypt(v_phone, v_key), right(v_phone, 4), left(trim(coalesce(p->>'name', '')), 80), v_type,
    v_reward, coalesce((p->>'extra_draw')::boolean, false), coalesce((p->>'photobooth')::boolean, false),
    true, left(p->>'consent_ver', 20), v_status, v_note, v_bf, case when v_bf then s.spg_name end,
    left(nullif(p->>'merch', ''), 30), v_reward2, left(nullif(p->>'merch2', ''), 30), left(nullif(p->>'prize', ''), 30),
    case when v_email = '' then null else extensions.pgp_sym_encrypt(left(v_email, 120), v_key) end);
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end; $$;
grant execute on function public.modis_f1_submit(uuid, jsonb) to anon, authenticated;

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
        where unit_id = s.unit_id and day = d and kind in ('out', 'return') group by item) t), '{}'::jsonb)
  );
end; $$;
grant execute on function public.modis_f1_unit_today(uuid) to anon, authenticated;

drop function if exists public.modis_f1_export(date, date);
create or replace function public.modis_f1_export(p_from date, p_to date)
returns table (id text, created_at timestamptz, claim_day date, unit_id text, shift text, spg_name text, poi_location text, poi_category text,
  name text, phone text, email text, type text, reward text, merch text, reward2 text, merch2 text, prize text, extra_draw boolean, photobooth boolean,
  status text, conflict_note text, photo_path text, backfill boolean, entered_by text)
language plpgsql stable security definer set search_path = '' as $$
declare v_key text;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  select v into v_key from public.modis_secrets where k = 'phone_key';
  return query select c.id, c.created_at, c.claim_day, c.unit_id, c.shift, c.spg_name, c.poi_location, c.poi_category, c.name,
    extensions.pgp_sym_decrypt(c.phone_enc, v_key), case when c.email_enc is null then null else extensions.pgp_sym_decrypt(c.email_enc, v_key) end,
    c.type, c.reward, c.merch, c.reward2, c.merch2, c.prize, c.extra_draw, c.photobooth, c.status, c.conflict_note, c.photo_path,
    c.backfill, c.entered_by
  from public.modis_conversions c where c.claim_day between p_from and p_to order by c.created_at;
end; $$;
revoke all on function public.modis_f1_export(date, date) from public, anon;
grant execute on function public.modis_f1_export(date, date) to authenticated;

-- Retensi: email ikut dihapus
create or replace function public.modis_f1_purge_personal_internal(p_before date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key text; v_n int; v_photos jsonb;
begin
  select v into v_key from public.modis_secrets where k = 'phone_key';
  select coalesce(jsonb_agg(photo_path), '[]'::jsonb) into v_photos from public.modis_conversions
    where claim_day < p_before and reward <> 'golden' and photo_path is not null;
  update public.modis_conversions set name = '(dihapus)', phone_enc = extensions.pgp_sym_encrypt('', v_key), email_enc = null,
    phone_last4 = null, phone_hash = 'purged:' || id
  where claim_day < p_before and reward <> 'golden' and phone_hash not like 'purged:%';
  get diagnostics v_n = row_count;
  return jsonb_build_object('rows', v_n, 'photos', v_photos);
end; $$;
revoke all on function public.modis_f1_purge_personal_internal(date) from public, anon, authenticated;
select 'FASE2C-OK' as hasil;
