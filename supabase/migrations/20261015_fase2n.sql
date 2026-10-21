-- Fase 2n: modul Peringkat GrabBike Hemat (menggantikan grand prize Golden).
-- SPG mencatat jumlah order GrabBike Hemat (PaHe, bike only) customer pada 30 hari terakhir, dihitung mundur dari saat customer bertemu SPG.
-- Peringkat memakai entri terakhir per nomor HP. Pihak Grab (Mas Ale) yang menetapkan pemenang dari peringkat ini.
-- Tabel tidak berisi data pribadi: nama / nomor diambil dari modis_conversions lewat conv_id (ikut terhapus saat retensi 90 hari).

create table if not exists public.modis_gb_history (
  op_id         text primary key,
  conv_id       text not null,
  unit_id       text not null,
  day           date not null,
  shift         text,
  spg_name      text,
  poi_location  text,
  gb30          int not null check (gb30 between 0 and 99),
  created_at    timestamptz not null default now()
);
create index if not exists modis_gb_history_conv_idx on public.modis_gb_history (conv_id);
create index if not exists modis_gb_history_day_idx on public.modis_gb_history (day);
alter table public.modis_gb_history enable row level security;
revoke all on public.modis_gb_history from anon;
drop policy if exists "admin baca riwayat gb" on public.modis_gb_history;
create policy "admin baca riwayat gb" on public.modis_gb_history for select to authenticated using (public.modis_is_admin());

-- Dipanggil aplikasi crew; idempotent per op_id
create or replace function public.modis_f1_gb30(p_token uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.modis_sessions;
begin
  s := public.modis_f1_session(p_token);
  if s.token is null then raise exception 'Sesi tidak valid' using errcode = '42501'; end if;
  insert into public.modis_gb_history (op_id, conv_id, unit_id, day, shift, spg_name, poi_location, gb30)
  values (left(p->>'op', 64), left(coalesce(p->>'conv', ''), 64), s.unit_id, public.modis_wib_day(now()), s.shift, s.spg_name,
    left(p->>'poi', 120), least(greatest(coalesce((p->>'gb30')::int, 0), 0), 99))
  on conflict (op_id) do nothing;
end; $$;
grant execute on function public.modis_f1_gb30(uuid, jsonb) to anon, authenticated;

-- Inti peringkat: satu baris per nomor HP, memakai entri terakhir di rentang tanggal
create or replace function public.modis_f1_lb_internal(p_from date, p_to date, p_full boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_key text;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Rentang tanggal tidak valid'; end if;
  select v into v_key from public.modis_secrets where k = 'phone_key';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'rank', t.rk, 'name', t.name, 'last4', t.phone_last4, 'gb30', t.gb30, 'day', t.day, 'unit', t.unit_id,
      'poi', t.poi_location, 'spg', t.spg_name, 'entries', t.n_entries,
      'phone', case when p_full then nullif(extensions.pgp_sym_decrypt(t.phone_enc, v_key), '') else null end
    ) order by t.rk, t.created_at)
    from (
      select e.*, rank() over (order by e.gb30 desc) rk
      from (
        select g.gb30, g.day, g.unit_id, g.poi_location, g.spg_name, g.created_at, c.name, c.phone_last4, c.phone_enc,
          row_number() over (partition by c.phone_hash order by g.created_at desc) rn,
          count(*) over (partition by c.phone_hash) n_entries
        from public.modis_gb_history g
        join public.modis_conversions c on c.id = g.conv_id
        where g.day between p_from and p_to and c.phone_hash not like 'purged:%'
      ) e where e.rn = 1
    ) t), '[]'::jsonb);
end; $$;
revoke all on function public.modis_f1_lb_internal(date, date, boolean) from public, anon, authenticated;

-- Office (admin): peringkat; nomor HP lengkap hanya untuk owner
create or replace function public.modis_f1_leaderboard(p_from date, p_to date, p_full boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.modis_is_admin() then raise exception 'Hanya office' using errcode = '42501'; end if;
  return public.modis_f1_lb_internal(p_from, p_to, p_full and public.modis_is_owner());
end; $$;
revoke all on function public.modis_f1_leaderboard(date, date, boolean) from public, anon;
grant execute on function public.modis_f1_leaderboard(date, date, boolean) to authenticated;

-- Klien (Grab): link laporan + PIN klien; hanya 4 digit terakhir nomor HP
create or replace function public.modis_f1_public_leaderboard(p_key text, p_pin text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rk text; v_pin text;
begin
  select value #>> '{}' into v_rk from public.modis_settings where key = 'report_key';
  if v_rk is null or p_key is distinct from v_rk then raise exception 'Link laporan tidak valid' using errcode = '28000'; end if;
  select v into v_pin from public.modis_secrets where k = 'client_pin';
  if v_pin is null then raise exception 'PIN klien belum diatur oleh tim proyek' using errcode = '28000'; end if;
  if coalesce(p_pin, '') = '' or v_pin <> extensions.crypt(p_pin, v_pin) then
    perform pg_sleep(1.5);
    raise exception 'PIN salah' using errcode = '28000';
  end if;
  return public.modis_f1_lb_internal(p_from, p_to, false);
end; $$;
revoke all on function public.modis_f1_public_leaderboard(text, text, date, date) from public;
grant execute on function public.modis_f1_public_leaderboard(text, text, date, date) to anon, authenticated;

select 'FASE2N-OK' as status;
