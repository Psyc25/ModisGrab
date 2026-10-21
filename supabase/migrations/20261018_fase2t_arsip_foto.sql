-- Arsip foto bukti ke PC kantor: Supabase hanya perantara. Skrip di PC mengunduh lalu menghapus file dari Storage.
alter table public.modis_conversions add column if not exists photo_archived_at timestamptz;
alter table public.modis_conversions add column if not exists photo_archive_file text;

-- Daftar foto yang belum diarsipkan (hanya office)
create or replace function public.modis_f1_photos_pending(p_limit int default 200)
returns table (id text, photo_path text, name text, created_at timestamptz, unit_id text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  return query
    select c.id, c.photo_path, c.name, c.created_at, c.unit_id
    from public.modis_conversions c
    where c.photo_path is not null and c.photo_archived_at is null
    order by c.created_at
    limit greatest(1, least(coalesce(p_limit, 200), 500));
end; $$;
revoke all on function public.modis_f1_photos_pending(int) from public, anon;
grant execute on function public.modis_f1_photos_pending(int) to authenticated;

-- Tandai foto sudah tersimpan di PC: p_items = [{"id":"...","file":"nama.jpg"}]
create or replace function public.modis_f1_photos_archived(p_items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  update public.modis_conversions c
     set photo_archived_at = now(), photo_archive_file = x.file
    from jsonb_to_recordset(p_items) as x(id text, file text)
   where c.id = x.id;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.modis_f1_photos_archived(jsonb) from public, anon;
grant execute on function public.modis_f1_photos_archived(jsonb) to authenticated;

-- Jumlah foto menunggu & storage terpakai, untuk indikator di dashboard
create or replace function public.modis_f1_photo_backlog()
returns table (pending bigint, oldest timestamptz, archived bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.modis_is_admin() then raise exception 'Hanya office' using errcode = '42501'; end if;
  return query
    select count(*) filter (where photo_path is not null and photo_archived_at is null),
           min(created_at) filter (where photo_path is not null and photo_archived_at is null),
           count(*) filter (where photo_archived_at is not null)
    from public.modis_conversions;
end; $$;
revoke all on function public.modis_f1_photo_backlog() from public, anon;
grant execute on function public.modis_f1_photo_backlog() to authenticated;

grant select (photo_archived_at, photo_archive_file) on public.modis_conversions to authenticated;
