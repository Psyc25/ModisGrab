-- =====================================================================
-- MODIS Field App — melengkapi spec v1: issue, input susulan TL, master crew & venue,
-- mutasi stok gudang, pool mix, progres per jam, akun office per orang,
-- laporan Grab dari data baru (agregat), retensi data pribadi.
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Laporan issue lapangan --------------------------------------------------------
create table if not exists public.modis_issues (
  id            text primary key,
  created_at    timestamptz not null,
  day           date not null,
  unit_id       text not null references public.modis_units (id),
  shift         text,
  by_name       text,
  role          text,
  poi_location  text,
  category      text not null,
  note          text,
  status        text not null default 'open' check (status in ('open', 'done')),
  resolved_note text,
  resolved_at   timestamptz
);
create index if not exists modis_issues_day_idx on public.modis_issues (day, unit_id);
alter table public.modis_issues enable row level security;
revoke all on public.modis_issues from anon;
drop policy if exists "admin baca issue" on public.modis_issues;
create policy "admin baca issue" on public.modis_issues for select to authenticated using (public.modis_is_admin());

create or replace function public.modis_f1_issue(p_token uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.modis_sessions; v_at timestamptz;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null then raise exception 'Sesi tidak sah, login ulang' using errcode = '28000'; end if;
  if coalesce(p->>'id', '') = '' or length(coalesce(p->>'category', '')) < 2 then raise exception 'Data issue tidak lengkap'; end if;
  v_at := coalesce((p->>'at')::timestamptz, now());
  if v_at > now() + interval '10 minutes' or v_at < now() - interval '3 days' then v_at := now(); end if;
  insert into public.modis_issues (id, created_at, day, unit_id, shift, by_name, role, poi_location, category, note)
  values (left(p->>'id', 64), v_at, public.modis_wib_day(v_at), s.unit_id, s.shift, s.spg_name, s.role,
          left(p->>'poi_location', 120), left(p->>'category', 40), left(p->>'note', 1000))
  on conflict (id) do nothing;
end; $$;
grant execute on function public.modis_f1_issue(uuid, jsonb) to anon, authenticated;

create or replace function public.modis_f1_issue_resolve(p_id text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  update public.modis_issues set status = 'done', resolved_note = left(p_note, 500), resolved_at = now() where id = p_id;
end; $$;
revoke all on function public.modis_f1_issue_resolve(text, text) from public, anon;
grant execute on function public.modis_f1_issue_resolve(text, text) to authenticated;

-- 2. Input susulan oleh TL (fallback Google Form / kertas) ------------------------------
alter table public.modis_conversions add column if not exists backfill boolean not null default false;
alter table public.modis_conversions add column if not exists entered_by text;
grant select (backfill, entered_by) on public.modis_conversions to authenticated;

create or replace function public.modis_f1_submit(p_token uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.modis_sessions;
  v_id text := left(coalesce(p->>'id', ''), 64);
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9]', '', 'g');
  v_type text := p->>'type';
  v_reward text := coalesce(p->>'reward', 'none');
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

  -- Input susulan hanya TL: nama SPG, shift, dan waktu kejadian diisi manual (maks 3 hari ke belakang)
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
    phone_hash, phone_enc, phone_last4, name, type, reward, extra_draw, photobooth, consent, consent_ver, status, conflict_note, backfill, entered_by)
  values (v_id, v_at, v_day, s.unit_id, v_shift, v_spg, s.token, left(p->>'poi_location', 120), left(p->>'poi_category', 40),
    v_hash, extensions.pgp_sym_encrypt(v_phone, v_key), right(v_phone, 4), left(trim(coalesce(p->>'name', '')), 80), v_type,
    v_reward, coalesce((p->>'extra_draw')::boolean, false), coalesce((p->>'photobooth')::boolean, false),
    true, left(p->>'consent_ver', 20), v_status, v_note, v_bf, case when v_bf then s.spg_name end);
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end; $$;
grant execute on function public.modis_f1_submit(uuid, jsonb) to anon, authenticated;

-- 3. Master crew (nama SPG/TL per unit) ------------------------------------------------
create table if not exists public.modis_crew (
  id       bigserial primary key,
  unit_id  text not null references public.modis_units (id),
  name     text not null check (length(name) between 2 and 60),
  role     text not null default 'spg' check (role in ('spg', 'tl')),
  active   boolean not null default true,
  unique (unit_id, name)
);
alter table public.modis_crew enable row level security;
revoke all on public.modis_crew from anon;
drop policy if exists "admin baca crew" on public.modis_crew;
create policy "admin baca crew" on public.modis_crew for select to authenticated using (public.modis_is_admin());

-- Daftar nama untuk layar login (nama saja, tanpa data lain)
create or replace function public.modis_f1_crew()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('unit_id', unit_id, 'name', name, 'role', role) order by unit_id, role desc, name), '[]'::jsonb)
  from public.modis_crew where active;
$$;
grant execute on function public.modis_f1_crew() to anon, authenticated;

-- Simpan seluruh daftar (yang tidak dikirim = nonaktif)
create or replace function public.modis_f1_crew_save(p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  update public.modis_crew set active = false;
  for r in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if length(trim(coalesce(r->>'name', ''))) >= 2 and r->>'unit_id' in (select id from public.modis_units) then
      insert into public.modis_crew (unit_id, name, role, active)
      values (r->>'unit_id', left(trim(r->>'name'), 60), case when r->>'role' = 'tl' then 'tl' else 'spg' end, true)
      on conflict (unit_id, name) do update set role = excluded.role, active = true;
    end if;
  end loop;
end; $$;
revoke all on function public.modis_f1_crew_save(jsonb) from public, anon;
grant execute on function public.modis_f1_crew_save(jsonb) to authenticated;

-- 4. Master venue / POI ---------------------------------------------------------------
create table if not exists public.modis_pois (
  name       text primary key check (length(name) between 2 and 120),
  category   text not null check (category in ('Station', 'Campus', 'Office', 'HOP & Public Space')),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.modis_pois enable row level security;
revoke all on public.modis_pois from anon;
drop policy if exists "admin baca poi" on public.modis_pois;
create policy "admin baca poi" on public.modis_pois for select to authenticated using (public.modis_is_admin());

create or replace function public.modis_f1_pois()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'category', category) order by category, name), '[]'::jsonb)
  from public.modis_pois where active;
$$;
grant execute on function public.modis_f1_pois() to anon, authenticated;

-- Tambah / ubah / nonaktifkan sebagian venue: [{name, category, active}]
create or replace function public.modis_f1_pois_save(p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.modis_pois (name, category, active, updated_at)
    values (left(trim(r->>'name'), 120), r->>'category', coalesce((r->>'active')::boolean, true), now())
    on conflict (name) do update set category = excluded.category, active = excluded.active, updated_at = now();
  end loop;
end; $$;
revoke all on function public.modis_f1_pois_save(jsonb) from public, anon;
grant execute on function public.modis_f1_pois_save(jsonb) to authenticated;

-- 5. Mutasi stok gudang (office) -------------------------------------------------------
create table if not exists public.modis_warehouse_moves (
  id         bigserial primary key,
  day        date not null,
  unit_id    text not null references public.modis_units (id),
  kind       text not null check (kind in ('out', 'return')),
  item       text not null,
  qty        int not null check (qty between 1 and 100000),
  note       text,
  by_user    uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists modis_wh_day_idx on public.modis_warehouse_moves (day, unit_id);
alter table public.modis_warehouse_moves enable row level security;
revoke all on public.modis_warehouse_moves from anon;
drop policy if exists "admin baca gudang" on public.modis_warehouse_moves;
create policy "admin baca gudang" on public.modis_warehouse_moves for select to authenticated using (public.modis_is_admin());

create or replace function public.modis_f1_warehouse(p_day date, p_unit text, p_kind text, p_items jsonb, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare k text; v int;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  if p_kind not in ('out', 'return') then raise exception 'Jenis mutasi tidak valid'; end if;
  for k, v in select key, (value)::int from jsonb_each_text(p_items) loop
    if v > 0 then
      insert into public.modis_warehouse_moves (day, unit_id, kind, item, qty, note) values (p_day, p_unit, p_kind, left(k, 30), v, left(p_note, 300));
    end if;
  end loop;
end; $$;
revoke all on function public.modis_f1_warehouse(date, text, text, jsonb, text) from public, anon;
grant execute on function public.modis_f1_warehouse(date, text, text, jsonb, text) to authenticated;

create or replace function public.modis_f1_warehouse_delete(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  delete from public.modis_warehouse_moves where id = p_id;
end; $$;
revoke all on function public.modis_f1_warehouse_delete(bigint) from public, anon;
grant execute on function public.modis_f1_warehouse_delete(bigint) to authenticated;

-- 6. Pengaturan office (pool mix, tanggal program) --------------------------------------
create or replace function public.modis_f1_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  if p_key not in ('pool_mix', 'program') then raise exception 'Pengaturan tidak dikenal'; end if;
  insert into public.modis_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end; $$;
revoke all on function public.modis_f1_set_setting(text, jsonb) from public, anon;
grant execute on function public.modis_f1_set_setting(text, jsonb) to authenticated;

-- 7. Ringkasan unit hari ini + per jam + pool mix ----------------------------------------
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
    'by_hour', coalesce((select jsonb_object_agg(h, n) from (select extract(hour from created_at at time zone 'Asia/Jakarta')::int h, count(*) n from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'ok' group by 1) t), '{}'::jsonb),
    'photobooth', (select count(*) from public.modis_conversions where unit_id = s.unit_id and claim_day = d and photobooth),
    'conflicts', (select count(*) from public.modis_conversions where unit_id = s.unit_id and claim_day = d and status = 'conflict'),
    'stock', coalesce((select jsonb_object_agg(kind || ':' || item, q) from (select kind, item, sum(qty) q from public.modis_stock_moves where unit_id = s.unit_id and day = d group by kind, item) t), '{}'::jsonb),
    'pool_mix', (select value from public.modis_settings where key = 'pool_mix'),
    'open_issues', (select count(*) from public.modis_issues where unit_id = s.unit_id and status = 'open')
  );
end; $$;
grant execute on function public.modis_f1_unit_today(uuid) to anon, authenticated;

-- 8. Akun office per orang ------------------------------------------------------------
-- Akun dibuat sendiri oleh tim di Supabase Auth; office cukup mendaftarkan email-nya di sini.
create or replace function public.modis_f1_admins()
returns table (user_id uuid, email text, role text, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  return query select a.user_id, u.email::text, a.role, a.user_id = auth.uid()
    from public.modis_admins a join auth.users u on u.id = a.user_id order by a.role, u.email;
end; $$;
revoke all on function public.modis_f1_admins() from public, anon;
grant execute on function public.modis_f1_admins() to authenticated;

create or replace function public.modis_f1_admin_add(p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  if p_role not in ('owner', 'client') then raise exception 'Peran tidak valid'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'Email belum terdaftar. Buat akunnya dulu di Supabase (Authentication > Users).'; end if;
  insert into public.modis_admins (user_id, role, label) values (v_uid, p_role, lower(trim(p_email)))
  on conflict (user_id) do update set role = excluded.role;
end; $$;
revoke all on function public.modis_f1_admin_add(text, text) from public, anon;
grant execute on function public.modis_f1_admin_add(text, text) to authenticated;

create or replace function public.modis_f1_admin_remove(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'Tidak bisa menghapus akun sendiri'; end if;
  delete from public.modis_admins where user_id = p_user;
end; $$;
revoke all on function public.modis_f1_admin_remove(uuid) from public, anon;
grant execute on function public.modis_f1_admin_remove(uuid) to authenticated;

-- 9. Laporan Grab dari data Field App (agregat, tanpa data pribadi) ----------------------
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
      select jsonb_object_agg(reward, n) from (select reward, count(*) n from public.modis_conversions
        where status = 'ok' and claim_day between p_from and p_to group by reward) t), '{}'::jsonb),
    'reach', coalesce((
      select jsonb_agg(jsonb_build_array(day, unit_id, reach, contacts) order by day)
      from public.modis_close_days where day between p_from and p_to), '[]'::jsonb)
  );
end; $$;
grant execute on function public.modis_f1_public_field(text, date, date) to anon, authenticated;

-- 10. Retensi: hapus data pribadi 90 hari setelah program selesai (kecuali pemenang Golden) --
create or replace function public.modis_f1_purge_personal_internal(p_before date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key text; v_n int; v_photos jsonb;
begin
  select v into v_key from public.modis_secrets where k = 'phone_key';
  select coalesce(jsonb_agg(photo_path), '[]'::jsonb) into v_photos from public.modis_conversions
    where claim_day < p_before and reward <> 'golden' and photo_path is not null;
  update public.modis_conversions set name = '(dihapus)', phone_enc = extensions.pgp_sym_encrypt('', v_key),
    phone_last4 = null, phone_hash = 'purged:' || id
  where claim_day < p_before and reward <> 'golden' and phone_hash not like 'purged:%';
  get diagnostics v_n = row_count;
  return jsonb_build_object('rows', v_n, 'photos', v_photos);
end; $$;
revoke all on function public.modis_f1_purge_personal_internal(date) from public, anon, authenticated;

create or replace function public.modis_f1_purge_personal(p_before date)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  return public.modis_f1_purge_personal_internal(p_before);
end; $$;
revoke all on function public.modis_f1_purge_personal(date) from public, anon;
grant execute on function public.modis_f1_purge_personal(date) to authenticated;

-- Dipanggil setelah foto dihapus dari storage oleh dashboard
create or replace function public.modis_f1_clear_photo_paths(p_paths text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  update public.modis_conversions set photo_path = null where photo_path = any (p_paths);
end; $$;
revoke all on function public.modis_f1_clear_photo_paths(text[]) from public, anon;
grant execute on function public.modis_f1_clear_photo_paths(text[]) to authenticated;

-- Office boleh menghapus foto bukti (untuk retensi)
drop policy if exists "owner hapus foto bukti" on storage.objects;
create policy "owner hapus foto bukti" on storage.objects for delete to authenticated
  using (bucket_id = 'modis-proof' and public.modis_is_owner());

-- Otomatis: bila tanggal akhir program + 90 hari sudah lewat, data pribadi dihapus (nama & HP).
create or replace function public.modis_f1_auto_purge()
returns void language plpgsql security definer set search_path = '' as $$
declare v_end date;
begin
  select (value->>'end_date')::date into v_end from public.modis_settings where key = 'program';
  if v_end is not null and public.modis_wib_day(now()) >= v_end + 90 then
    perform public.modis_f1_purge_personal_internal(v_end + 1);
  end if;
end; $$;
revoke all on function public.modis_f1_auto_purge() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('modis-retensi-harian', '0 18 * * *', 'select public.modis_f1_auto_purge()');
  end if;
exception when others then null;
end $do$;

-- Data uji [QC] di tabel baru
create or replace function public.modis_f1_purge_qc_extra()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  delete from public.modis_issues where by_name like '[QC]%';
end; $$;
revoke all on function public.modis_f1_purge_qc_extra() from public, anon;
grant execute on function public.modis_f1_purge_qc_extra() to authenticated;

-- Export office: sertakan penanda input susulan
drop function if exists public.modis_f1_export(date, date);
create or replace function public.modis_f1_export(p_from date, p_to date)
returns table (id text, created_at timestamptz, claim_day date, unit_id text, shift text, spg_name text, poi_location text, poi_category text,
  name text, phone text, type text, reward text, extra_draw boolean, photobooth boolean, status text, conflict_note text, photo_path text,
  backfill boolean, entered_by text)
language plpgsql stable security definer set search_path = '' as $$
declare v_key text;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  select v into v_key from public.modis_secrets where k = 'phone_key';
  return query select c.id, c.created_at, c.claim_day, c.unit_id, c.shift, c.spg_name, c.poi_location, c.poi_category, c.name,
    extensions.pgp_sym_decrypt(c.phone_enc, v_key), c.type, c.reward, c.extra_draw, c.photobooth, c.status, c.conflict_note, c.photo_path,
    c.backfill, c.entered_by
  from public.modis_conversions c where c.claim_day between p_from and p_to order by c.created_at;
end; $$;
revoke all on function public.modis_f1_export(date, date) from public, anon;
grant execute on function public.modis_f1_export(date, date) to authenticated;

-- Daftar venue awal diimpor dari dashboard office (tombol "Impor daftar bawaan") bila tabel masih kosong.
