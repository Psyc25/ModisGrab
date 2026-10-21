-- =====================================================================
-- MODIS Field App — Fase 1 (spec v1, 10 Okt 2026)
-- Unit + PIN, sesi shift (12 jam), conversion (HP terenkripsi), aturan double claim,
-- bukti foto, stok unit, close day. Semua tulis lewat fungsi security definer bertoken sesi.
-- Aman dijalankan ulang.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- Kunci enkripsi nomor HP (tidak bisa dibaca anon/authenticated)
create table if not exists public.modis_secrets (k text primary key, v text not null);
alter table public.modis_secrets enable row level security;
revoke all on public.modis_secrets from anon, authenticated;
insert into public.modis_secrets (k, v) values ('phone_key', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (k) do nothing;

-- Unit & PIN ------------------------------------------------------------
create table if not exists public.modis_units (
  id          text primary key,             -- mobil | kiosk1 | kiosk2
  name        text not null,
  pin_hash    text,                          -- PIN unit untuk SPG
  tl_pin_hash text,                          -- PIN Team Leader
  sort_order  int not null default 0
);
alter table public.modis_units enable row level security;
revoke all on public.modis_units from anon;
drop policy if exists "admin baca unit" on public.modis_units;
create policy "admin baca unit" on public.modis_units for select to authenticated using (public.modis_is_admin());
insert into public.modis_units (id, name, sort_order) values
  ('mobil', 'Mobil Diskon', 1), ('kiosk1', 'Kiosk Diskon 1', 2), ('kiosk2', 'Kiosk Diskon 2', 3)
on conflict (id) do nothing;

-- Daftar unit untuk layar login (tanpa PIN)
create or replace function public.modis_f1_units()
returns table (id text, name text, ready boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.name, (u.pin_hash is not null) from public.modis_units u order by u.sort_order;
$$;
grant execute on function public.modis_f1_units() to anon, authenticated;

-- Owner mengganti PIN unit / TL
create or replace function public.modis_f1_set_pin(p_unit text, p_role text, p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya owner' using errcode = '42501'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN harus 4-8 angka'; end if;
  if p_role = 'tl' then
    update public.modis_units set tl_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')) where id = p_unit;
  else
    update public.modis_units set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')) where id = p_unit;
  end if;
end; $$;
revoke all on function public.modis_f1_set_pin(text, text, text) from public, anon;
grant execute on function public.modis_f1_set_pin(text, text, text) to authenticated;

-- Sesi shift --------------------------------------------------------------
create table if not exists public.modis_sessions (
  token       uuid primary key default gen_random_uuid(),
  unit_id     text not null references public.modis_units (id),
  spg_name    text not null,
  role        text not null check (role in ('spg', 'tl')),
  shift       text not null check (shift in ('AM', 'PM')),
  device_id   text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  ended_at    timestamptz
);
alter table public.modis_sessions enable row level security;
revoke all on public.modis_sessions from anon;
drop policy if exists "admin baca sesi" on public.modis_sessions;
create policy "admin baca sesi" on public.modis_sessions for select to authenticated using (public.modis_is_admin());

create table if not exists public.modis_login_fails (unit_id text, at timestamptz default now());
alter table public.modis_login_fails enable row level security;
revoke all on public.modis_login_fails from anon, authenticated;

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
  return jsonb_build_object('token', v_tok, 'role', v_role, 'unit_id', u.id, 'unit_name', u.name, 'spg_name', left(trim(p_spg), 60), 'shift', p_shift, 'expires_at', v_exp);
end; $$;
grant execute on function public.modis_f1_login(text, text, text, text, text) to anon, authenticated;

-- Sesi yang sah untuk mengirim data: dibuat < 36 jam lalu (input offline tetap diterima setelah token habis)
create or replace function public.modis_f1_session(p_token uuid)
returns public.modis_sessions language sql stable security definer set search_path = '' as $$
  select * from public.modis_sessions s where s.token = p_token and s.created_at > now() - interval '36 hours';
$$;
revoke all on function public.modis_f1_session(uuid) from public, anon, authenticated;

create or replace function public.modis_f1_logout(p_token uuid)
returns void language sql security definer set search_path = '' as $$
  update public.modis_sessions set ended_at = now() where token = p_token and ended_at is null;
$$;
grant execute on function public.modis_f1_logout(uuid) to anon, authenticated;

-- Conversion ---------------------------------------------------------------
create table if not exists public.modis_conversions (
  id             text primary key,                 -- dibuat di tablet (idempotent saat sync ulang)
  created_at     timestamptz not null,             -- waktu input di tablet
  synced_at      timestamptz not null default now(),
  claim_day      date not null,                    -- hari WIB
  unit_id        text not null references public.modis_units (id),
  shift          text not null,
  spg_name       text not null,
  session_token  uuid,
  poi_location   text,
  poi_category   text,
  phone_hash     text not null,                    -- sha256('modis|62xxx')
  phone_enc      bytea not null,                   -- nomor HP terenkripsi
  phone_last4    text,
  name           text not null,
  type           text not null check (type in ('pahe_new', 'pahe_lapsed', 'gb_hemat')),
  reward         text not null check (reward in ('snack', 'drink', 'candy', 'tier_c', 'tier_b', 'tier_a', 'golden', 'none')),
  extra_draw     boolean not null default false,   -- Ride & Share (venue long momentum)
  photobooth     boolean not null default false,
  consent        boolean not null,
  consent_ver    text,
  photo_path     text,
  status         text not null default 'ok' check (status in ('ok', 'conflict')),
  conflict_note  text,
  constraint modis_conv_len check (length(name) <= 80 and length(spg_name) <= 60 and coalesce(length(poi_location), 0) <= 120)
);
create index if not exists modis_conv_day_idx on public.modis_conversions (claim_day, unit_id);
create index if not exists modis_conv_hash_idx on public.modis_conversions (phone_hash, type);
alter table public.modis_conversions enable row level security;
revoke all on public.modis_conversions from anon;
drop policy if exists "admin baca conversion" on public.modis_conversions;
create policy "admin baca conversion" on public.modis_conversions for select to authenticated using (public.modis_is_admin());
drop policy if exists "owner hapus conversion" on public.modis_conversions;
create policy "owner hapus conversion" on public.modis_conversions for delete to authenticated using (public.modis_is_owner());
-- Kolom terenkripsi tidak diberikan ke dashboard; nomor penuh hanya lewat fungsi khusus owner.
revoke all on public.modis_conversions from authenticated;
grant select (id, created_at, synced_at, claim_day, unit_id, shift, spg_name, poi_location, poi_category, phone_hash, phone_last4,
  name, type, reward, extra_draw, photobooth, consent, consent_ver, photo_path, status, conflict_note) on public.modis_conversions to authenticated;
grant delete on public.modis_conversions to authenticated;

create or replace function public.modis_f1_phone_hash(p_phone text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest('modis|' || p_phone, 'sha256'), 'hex');
$$;

create or replace function public.modis_wib_day(t timestamptz)
returns date language sql immutable set search_path = '' as $$ select (t at time zone 'Asia/Jakarta')::date; $$;

-- Status klaim satu nomor (dipakai saat input online)
create or replace function public.modis_f1_lookup(p_token uuid, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.modis_sessions;
  h text;
  r jsonb;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null then raise exception 'Sesi habis, login ulang' using errcode = '28000'; end if;
  h := public.modis_f1_phone_hash(p_phone);
  select jsonb_build_object(
    'pahe', (select c.type from public.modis_conversions c where c.phone_hash = h and c.type like 'pahe%' order by c.created_at limit 1),
    'pahe_day', (select c.claim_day from public.modis_conversions c where c.phone_hash = h and c.type like 'pahe%' order by c.created_at limit 1),
    'gb_today', exists (select 1 from public.modis_conversions c where c.phone_hash = h and c.type = 'gb_hemat' and c.claim_day = public.modis_wib_day(now())),
    'name', (select c.name from public.modis_conversions c where c.phone_hash = h order by c.created_at desc limit 1)
  ) into r;
  return r;
end; $$;
grant execute on function public.modis_f1_lookup(uuid, text) to anon, authenticated;

-- Cache untuk cek double claim saat offline: 16 karakter awal hash, bukan nomor asli
create or replace function public.modis_f1_claim_cache(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.modis_sessions;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null then raise exception 'Sesi habis, login ulang' using errcode = '28000'; end if;
  return jsonb_build_object(
    'day', public.modis_wib_day(now()),
    'pahe', coalesce((select jsonb_agg(distinct left(c.phone_hash, 16)) from public.modis_conversions c where c.type like 'pahe%'), '[]'::jsonb),
    'gb', coalesce((select jsonb_agg(distinct left(c.phone_hash, 16)) from public.modis_conversions c where c.type = 'gb_hemat' and c.claim_day = public.modis_wib_day(now())), '[]'::jsonb)
  );
end; $$;
grant execute on function public.modis_f1_claim_cache(uuid) to anon, authenticated;

-- Simpan satu conversion (dipanggil saat online / saat antrean sync)
create or replace function public.modis_f1_submit(p_token uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.modis_sessions;
  v_id text := left(coalesce(p->>'id', ''), 64);
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9]', '', 'g');
  v_type text := p->>'type';
  v_at timestamptz;
  v_day date;
  v_hash text;
  v_status text := 'ok';
  v_note text;
  v_key text;
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

  -- Double claim: ditandai, tidak dihapus
  if v_type like 'pahe%' and exists (select 1 from public.modis_conversions c where c.phone_hash = v_hash and c.type like 'pahe%' and c.status = 'ok') then
    v_status := 'conflict'; v_note := 'PaHe sudah pernah diklaim nomor ini';
  elsif v_type = 'gb_hemat' and exists (select 1 from public.modis_conversions c where c.phone_hash = v_hash and c.type = 'gb_hemat' and c.claim_day = v_day and c.status = 'ok') then
    v_status := 'conflict'; v_note := 'GB Hemat sudah diklaim hari ini';
  end if;

  select v into v_key from public.modis_secrets where k = 'phone_key';
  insert into public.modis_conversions (id, created_at, claim_day, unit_id, shift, spg_name, session_token, poi_location, poi_category,
    phone_hash, phone_enc, phone_last4, name, type, reward, extra_draw, photobooth, consent, consent_ver, status, conflict_note)
  values (v_id, v_at, v_day, s.unit_id, s.shift, s.spg_name, s.token, left(p->>'poi_location', 120), left(p->>'poi_category', 40),
    v_hash, extensions.pgp_sym_encrypt(v_phone, v_key), right(v_phone, 4), left(trim(coalesce(p->>'name', '')), 80), v_type,
    coalesce(p->>'reward', 'none'), coalesce((p->>'extra_draw')::boolean, false), coalesce((p->>'photobooth')::boolean, false),
    true, left(p->>'consent_ver', 20), v_status, v_note);
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end; $$;
grant execute on function public.modis_f1_submit(uuid, jsonb) to anon, authenticated;

-- Foto bukti -----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('modis-proof', 'modis-proof', false, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

drop policy if exists "tablet unggah bukti" on storage.objects;
create policy "tablet unggah bukti" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'modis-proof' and (storage.foldername(name))[1] = 'proof');
drop policy if exists "admin lihat bukti" on storage.objects;
create policy "admin lihat bukti" on storage.objects for select to authenticated
  using (bucket_id = 'modis-proof' and public.modis_is_admin());

create or replace function public.modis_f1_attach_photo(p_token uuid, p_id text, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.modis_sessions;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null then raise exception 'Sesi tidak sah' using errcode = '28000'; end if;
  if p_path !~ '^proof/[0-9-]+/[A-Za-z0-9_-]+\.(jpg|webp)$' then raise exception 'Path foto tidak valid'; end if;
  update public.modis_conversions set photo_path = p_path where id = p_id and unit_id = s.unit_id;
end; $$;
grant execute on function public.modis_f1_attach_photo(uuid, text, text) to anon, authenticated;

-- Stok unit (TL) -------------------------------------------------------------------
create table if not exists public.modis_stock_moves (
  id          bigserial primary key,
  unit_id     text not null references public.modis_units (id),
  day         date not null,
  shift       text not null,
  kind        text not null check (kind in ('opening', 'refill', 'closing')),
  item        text not null,
  qty         int not null check (qty between 0 and 100000),
  by_name     text,
  created_at  timestamptz not null default now()
);
create index if not exists modis_stock_day_idx on public.modis_stock_moves (day, unit_id);
alter table public.modis_stock_moves enable row level security;
revoke all on public.modis_stock_moves from anon;
drop policy if exists "admin baca stok" on public.modis_stock_moves;
create policy "admin baca stok" on public.modis_stock_moves for select to authenticated using (public.modis_is_admin());

create or replace function public.modis_f1_stock(p_token uuid, p_kind text, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.modis_sessions; k text; v int;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null or s.role <> 'tl' then raise exception 'Khusus Team Leader' using errcode = '42501'; end if;
  if p_kind not in ('opening', 'refill', 'closing') then raise exception 'Jenis stok tidak valid'; end if;
  for k, v in select key, (value)::int from jsonb_each_text(p_items) loop
    insert into public.modis_stock_moves (unit_id, day, shift, kind, item, qty, by_name)
    values (s.unit_id, public.modis_wib_day(now()), s.shift, p_kind, left(k, 30), greatest(0, v), s.spg_name);
  end loop;
end; $$;
grant execute on function public.modis_f1_stock(uuid, text, jsonb) to anon, authenticated;

-- Close day (TL) ----------------------------------------------------------------
create table if not exists public.modis_close_days (
  unit_id     text not null references public.modis_units (id),
  day         date not null,
  shift       text not null,
  reach       int not null default 0,
  contacts    int not null default 0,
  notes       text,
  summary     jsonb,
  closed_by   text,
  created_at  timestamptz not null default now(),
  primary key (unit_id, day)
);
alter table public.modis_close_days enable row level security;
revoke all on public.modis_close_days from anon;
drop policy if exists "admin baca close day" on public.modis_close_days;
create policy "admin baca close day" on public.modis_close_days for select to authenticated using (public.modis_is_admin());

create or replace function public.modis_f1_close_day(p_token uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.modis_sessions;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null or s.role <> 'tl' then raise exception 'Khusus Team Leader' using errcode = '42501'; end if;
  insert into public.modis_close_days (unit_id, day, shift, reach, contacts, notes, summary, closed_by)
  values (s.unit_id, public.modis_wib_day(now()), s.shift, greatest(0, coalesce((p->>'reach')::int, 0)), greatest(0, coalesce((p->>'contacts')::int, 0)),
          left(p->>'notes', 500), p->'summary', s.spg_name)
  on conflict (unit_id, day) do update set reach = excluded.reach, contacts = excluded.contacts, notes = excluded.notes,
    summary = excluded.summary, closed_by = excluded.closed_by, created_at = now();
end; $$;
grant execute on function public.modis_f1_close_day(uuid, jsonb) to anon, authenticated;

-- Ringkasan hari ini untuk unit (progres di layar SPG, saat online) -------------------
create or replace function public.modis_f1_unit_today(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.modis_sessions; d date := public.modis_wib_day(now());
begin
  s := public.modis_f1_session(p_token);
  if s.token is null then raise exception 'Sesi habis' using errcode = '28000'; end if;
  return jsonb_build_object(
    'day', d,
    'by_type', coalesce((select jsonb_object_agg(type, n) from (select type, count(*) n from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'ok' group by type) t), '{}'::jsonb),
    'by_reward', coalesce((select jsonb_object_agg(reward, n) from (select reward, count(*) n from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'ok' group by reward) t), '{}'::jsonb),
    'photobooth', (select count(*) from public.modis_conversions where unit_id = s.unit_id and claim_day = d and photobooth),
    'conflicts', (select count(*) from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'conflict'),
    'stock', coalesce((select jsonb_object_agg(kind || ':' || item, q) from (select kind, item, sum(qty) q from public.modis_stock_moves where unit_id = s.unit_id and day = d group by kind, item) t), '{}'::jsonb)
  );
end; $$;
grant execute on function public.modis_f1_unit_today(uuid) to anon, authenticated;

-- Nomor penuh hanya untuk owner (office)
create or replace function public.modis_f1_phone(p_id text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_key text; r text;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  select v into v_key from public.modis_secrets where k = 'phone_key';
  select extensions.pgp_sym_decrypt(phone_enc, v_key) into r from public.modis_conversions where id = p_id;
  return r;
end; $$;
revoke all on function public.modis_f1_phone(text) from public, anon;
grant execute on function public.modis_f1_phone(text) to authenticated;
