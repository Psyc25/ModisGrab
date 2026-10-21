-- =====================================================================
-- MODIS Field App — penyesuaian dengan [INT] Internal Tracker & [EXT] Project Tracker:
-- item merch per tier, hadiah utama Golden, hasil draw kedua (Ride & Share),
-- stok gudang masuk (IN dari vendor) + saldo gudang. Aman dijalankan ulang.
-- =====================================================================

alter table public.modis_conversions add column if not exists merch text;
alter table public.modis_conversions add column if not exists reward2 text;
alter table public.modis_conversions add column if not exists merch2 text;
alter table public.modis_conversions add column if not exists prize text;
alter table public.modis_conversions drop constraint if exists modis_conv_reward2_chk;
alter table public.modis_conversions add constraint modis_conv_reward2_chk check (reward2 is null or reward2 in ('candy', 'tier_c', 'tier_b', 'tier_a'));
grant select (merch, reward2, merch2, prize) on public.modis_conversions to authenticated;

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
    merch, reward2, merch2, prize)
  values (v_id, v_at, v_day, s.unit_id, v_shift, v_spg, s.token, left(p->>'poi_location', 120), left(p->>'poi_category', 40),
    v_hash, extensions.pgp_sym_encrypt(v_phone, v_key), right(v_phone, 4), left(trim(coalesce(p->>'name', '')), 80), v_type,
    v_reward, coalesce((p->>'extra_draw')::boolean, false), coalesce((p->>'photobooth')::boolean, false),
    true, left(p->>'consent_ver', 20), v_status, v_note, v_bf, case when v_bf then s.spg_name end,
    left(nullif(p->>'merch', ''), 30), v_reward2, left(nullif(p->>'merch2', ''), 30), left(nullif(p->>'prize', ''), 30));
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end; $$;
grant execute on function public.modis_f1_submit(uuid, jsonb) to anon, authenticated;

-- Ringkasan unit: reward termasuk draw kedua, plus jumlah per item merch
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
    'open_issues', (select count(*) from public.modis_issues where unit_id = s.unit_id and status = 'open')
  );
end; $$;
grant execute on function public.modis_f1_unit_today(uuid) to anon, authenticated;

-- Gudang: barang masuk dari vendor (IN) tanpa unit; keluar (OUT) / kembali ke gudang per unit
alter table public.modis_warehouse_moves alter column unit_id drop not null;
alter table public.modis_warehouse_moves drop constraint if exists modis_warehouse_moves_kind_check;
alter table public.modis_warehouse_moves add constraint modis_warehouse_moves_kind_check check (kind in ('in', 'out', 'return'));

create or replace function public.modis_f1_warehouse(p_day date, p_unit text, p_kind text, p_items jsonb, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare k text; v int;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  if p_kind not in ('in', 'out', 'return') then raise exception 'Jenis mutasi tidak valid'; end if;
  if p_kind <> 'in' and (p_unit is null or p_unit not in (select id from public.modis_units)) then raise exception 'Pilih unit'; end if;
  for k, v in select key, (value)::int from jsonb_each_text(p_items) loop
    if v > 0 then
      insert into public.modis_warehouse_moves (day, unit_id, kind, item, qty, note)
      values (p_day, case when p_kind = 'in' then null else p_unit end, p_kind, left(k, 30), v, left(p_note, 300));
    end if;
  end loop;
end; $$;
revoke all on function public.modis_f1_warehouse(date, text, text, jsonb, text) from public, anon;
grant execute on function public.modis_f1_warehouse(date, text, text, jsonb, text) to authenticated;

-- Laporan Grab: reward termasuk draw kedua
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
    'reach', coalesce((
      select jsonb_agg(jsonb_build_array(day, unit_id, reach, contacts) order by day)
      from public.modis_close_days where day between p_from and p_to), '[]'::jsonb)
  );
end; $$;
grant execute on function public.modis_f1_public_field(text, date, date) to anon, authenticated;

select 'fase2b ok' as hasil;
