-- =====================================================================
-- MODIS: kartu stamp digital (2 stamp: PaHe + GB Hemat di hari yang sama).
-- Saat stamp ke-2 terpenuhi, kartu lengkap otomatis tercatat di database.
-- Nama/nomor diambil dari data conversion (ikut terhapus saat retensi). Aman dijalankan ulang.
-- =====================================================================

create table if not exists public.modis_stamp_cards (
  id           bigserial primary key,
  phone_hash   text not null,
  day          date not null,
  unit_id      text,
  poi_location text,
  pahe_id      text,
  gb_id        text,
  completed_at timestamptz not null default now(),
  unique (phone_hash, day)
);
alter table public.modis_stamp_cards enable row level security;
revoke all on public.modis_stamp_cards from anon;
drop policy if exists "admin baca stamp" on public.modis_stamp_cards;
create policy "admin baca stamp" on public.modis_stamp_cards for select to authenticated using (public.modis_is_admin());
grant select on public.modis_stamp_cards to authenticated;

create or replace function public.modis_stamp_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pahe text; v_gb text;
begin
  if new.status <> 'ok' or new.phone_hash like 'purged:%' then return new; end if;
  select id into v_pahe from public.modis_conversions
    where phone_hash = new.phone_hash and claim_day = new.claim_day and type like 'pahe%' and status = 'ok' order by created_at limit 1;
  select id into v_gb from public.modis_conversions
    where phone_hash = new.phone_hash and claim_day = new.claim_day and type = 'gb_hemat' and status = 'ok' order by created_at limit 1;
  if v_pahe is not null and v_gb is not null then
    insert into public.modis_stamp_cards (phone_hash, day, unit_id, poi_location, pahe_id, gb_id)
    values (new.phone_hash, new.claim_day, new.unit_id, new.poi_location, v_pahe, v_gb)
    on conflict (phone_hash, day) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists modis_stamp_after on public.modis_conversions;
create trigger modis_stamp_after after insert or update of status on public.modis_conversions
for each row execute function public.modis_stamp_check();

select 'FASE2I-OK' as hasil;
