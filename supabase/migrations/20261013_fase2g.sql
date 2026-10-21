-- MODIS: tiap hadiah Golden maksimal 3 unit (sesuai pengadaan: 3 Smartphone, 3 Emas, 3 TWS, 3 Powerbank, 3 Smartwatch)
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
  v_gkind text;
  v_prize text;
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
    v_gkind := public.modis_f1_golden_kind(v_day);
    v_prize := nullif(p->>'prize', '');
    -- satu Golden per tanggal untuk semua unit: kunci supaya dua tablet tidak lolos bersamaan
    perform pg_advisory_xact_lock(hashtext('modis_golden_' || v_day::text));
    if s.role <> 'tl' then v_status := 'conflict'; v_note := 'Golden hanya boleh diinput TL';
    elsif v_gkind is null then v_status := 'conflict'; v_note := 'Bukan tanggal Golden';
    elsif v_gc is null or v_gc <> extensions.crypt(upper(coalesce(p->>'golden_code', '')), v_gc) then
      v_status := 'conflict'; v_note := 'Kode PM Golden salah';
    elsif v_gkind = 'main' and coalesce(v_prize, '') not in ('h_phone', 'h_gold') then
      v_status := 'conflict'; v_note := 'Hari ini jadwal grand prize utama';
    elsif v_gkind = 'support' and coalesce(v_prize, '') not in ('h_tws', 'h_powerbank', 'h_watch') then
      v_status := 'conflict'; v_note := 'Hari ini jadwal grand prize pendukung';
    elsif exists (select 1 from public.modis_conversions c where c.reward = 'golden' and c.status = 'ok' and c.claim_day = v_day) then
      v_status := 'conflict'; v_note := 'Golden tanggal ini sudah keluar';
    elsif (select count(*) from public.modis_conversions c where c.reward = 'golden' and c.status = 'ok'
           and c.prize = any (case when v_gkind = 'main' then array['h_phone', 'h_gold'] else array['h_tws', 'h_powerbank', 'h_watch'] end))
          >= public.modis_f1_golden_quota(v_gkind) then
      v_status := 'conflict'; v_note := 'Kuota grand prize sudah habis';
    elsif (select count(*) from public.modis_conversions c where c.reward = 'golden' and c.status = 'ok' and c.prize = v_prize) >= 3 then
      v_status := 'conflict'; v_note := 'Hadiah ini sudah keluar 3 unit (habis)';
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

select 'FASE2G-OK' as hasil;
