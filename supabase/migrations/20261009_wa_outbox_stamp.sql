-- =====================================================================
-- MODIS Cek Boros - stamp 1x per nomor per hari & antrean WhatsApp otomatis (9 Okt 2026)
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Cek visitor ulang: claimed_today = stamp SUDAH diberikan hari ini untuk nomor ini
--    (stamp hari ini lebih tinggi dari stamp terakhir sebelum hari ini).
create or replace function public.modis_lookup_visitor(p_phone text)
returns table (found boolean, previous_stamps integer, total_visits integer, claimed_today boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select v.stamps_count,
           (v.created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date as is_today
    from public.modis_visitors v
    where p_phone ~ '^\+628[0-9]{7,11}$'
      and v.phone_number = p_phone
  )
  select
    count(*) > 0,
    coalesce(max(stamps_count), 0)::integer,
    count(*)::integer,
    coalesce(max(stamps_count) filter (where is_today), 0)
      > coalesce(max(stamps_count) filter (where not is_today), 0)
  from v;
$$;
revoke all on function public.modis_lookup_visitor(text) from public;
grant execute on function public.modis_lookup_visitor(text) to anon, authenticated;

-- 2. Antrean pesan WhatsApp hasil Cek Boros ----------------------------
create table if not exists public.modis_wa_outbox (
  id          bigserial primary key,
  visitor_id  text not null unique references public.modis_visitors (id) on delete cascade,
  phone       text not null,
  message     text not null,
  status      text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  sent_at     timestamptz
);
create index if not exists modis_wa_outbox_status_idx on public.modis_wa_outbox (status, created_at);
alter table public.modis_wa_outbox enable row level security;
drop policy if exists "admin baca antrean wa" on public.modis_wa_outbox;
create policy "admin baca antrean wa" on public.modis_wa_outbox for select to authenticated using (public.modis_is_admin());

create or replace function public.modis_rupiah(n integer)
returns text language sql immutable set search_path = '' as $$
  select 'Rp' || replace(to_char(coalesce(n, 0), 'FM999,999,999'), ',', '.');
$$;

-- Teks pesan: rapi, tanpa simbol berlebihan.
create or replace function public.modis_wa_message(v public.modis_visitors)
returns text language sql stable set search_path = '' as $$
  select
    'Halo ' || coalesce(nullif(split_part(trim(v.full_name), ' ', 1), ''), 'Sobat Hemat') || ',' || E'\n\n' ||
    'Terima kasih sudah mampir ke Grab MODIS' || coalesce(' di ' || nullif(v.poi_location, ''), '') || '.' || E'\n\n' ||
    '*Hasil Cek Boros kamu*' || E'\n' ||
    'Status: ' || coalesce(v.boros_status, '-') || E'\n' ||
    'Perkiraan ongkos GrabBike: ' || public.modis_rupiah(v.monthly_cost_normal) || ' per bulan' || E'\n' ||
    'Potensi hemat dengan PAHE: ' || public.modis_rupiah(v.monthly_savings) || ' per bulan' || E'\n' ||
    'Kartu stamp: ' || coalesce(v.stamps_count, 0) || ' dari 6' || E'\n\n' ||
    'Aktifkan PAHE (Paket Hemat GrabBike) di aplikasi Grab, tarif tetap mulai Rp7 ribuan. ' ||
    'Syarat dan ketentuan mengikuti aplikasi Grab.' || E'\n\n' ||
    'Sampai jumpa lagi di Pit-Stop MODIS berikutnya untuk menambah stamp kamu.';
$$;

-- Setiap visitor dewasa yang setuju dan mengisi nomor WA otomatis masuk antrean.
create or replace function public.modis_queue_wa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.phone_number ~ '^\+628[0-9]{7,11}$' and coalesce(new.privacy_agreed, false) and not coalesce(new.is_minor, false) then
    insert into public.modis_wa_outbox (visitor_id, phone, message)
    values (new.id, new.phone_number, public.modis_wa_message(new))
    on conflict (visitor_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists modis_visitors_queue_wa on public.modis_visitors;
create trigger modis_visitors_queue_wa after insert on public.modis_visitors
  for each row execute function public.modis_queue_wa();

-- 3. Untuk pengirim (n8n + GOWA) memakai kunci service_role ------------------
-- Ambil maksimal p_limit pesan dan tandai "sending" (aman dijalankan paralel).
create or replace function public.modis_wa_claim(p_limit integer default 10)
returns table (id bigint, phone text, wa_number text, message text)
language plpgsql security definer set search_path = '' as $$
begin
  -- Pesan "sending" yang macet > 10 menit dikembalikan ke antrean
  update public.modis_wa_outbox o set status = 'queued'
  where o.status = 'sending' and o.claimed_at < now() - interval '10 minutes' and o.attempts < 5;

  return query
  with c as (
    select o.id from public.modis_wa_outbox o
    where o.status = 'queued' and o.attempts < 5
    order by o.created_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  update public.modis_wa_outbox o
     set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
    from c where o.id = c.id
  returning o.id, o.phone, substr(o.phone, 2), o.message;
end;
$$;

create or replace function public.modis_wa_mark(p_id bigint, p_ok boolean, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.modis_wa_outbox
     set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'queued' end,
         sent_at = case when p_ok then now() else sent_at end,
         last_error = case when p_ok then null else left(p_error, 300) end
   where id = p_id;
$$;

revoke all on function public.modis_wa_claim(integer) from public, anon, authenticated;
revoke all on function public.modis_wa_mark(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.modis_wa_claim(integer) to service_role;
grant execute on function public.modis_wa_mark(bigint, boolean, text) to service_role;
revoke all on function public.modis_wa_message(public.modis_visitors) from public, anon;
revoke all on function public.modis_queue_wa() from public, anon, authenticated;
