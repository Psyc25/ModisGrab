-- Pemantauan: status PC kantor (arsip foto) dan galat dari tablet crew.

create table if not exists public.modis_pc_status (
  key text primary key,
  seen_at timestamptz not null default now(),
  info jsonb not null default '{}'::jsonb
);
alter table public.modis_pc_status enable row level security;
revoke all on public.modis_pc_status from anon, authenticated;

create or replace function public.modis_f1_pc_heartbeat(p_info jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  insert into public.modis_pc_status as s (key, seen_at, info) values ('arsip', now(), coalesce(p_info, '{}'::jsonb))
  on conflict (key) do update set seen_at = now(), info = coalesce(p_info, '{}'::jsonb);
end; $$;
revoke all on function public.modis_f1_pc_heartbeat(jsonb) from public, anon;
grant execute on function public.modis_f1_pc_heartbeat(jsonb) to authenticated;

drop function if exists public.modis_f1_photo_backlog();
create or replace function public.modis_f1_photo_backlog()
returns table (pending bigint, oldest timestamptz, archived bigint, pc_seen timestamptz, pc_info jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.modis_is_admin() then raise exception 'Hanya office' using errcode = '42501'; end if;
  return query
    select count(*) filter (where c.photo_path is not null and c.photo_archived_at is null),
           min(c.created_at) filter (where c.photo_path is not null and c.photo_archived_at is null),
           count(*) filter (where c.photo_archived_at is not null),
           (select s.seen_at from public.modis_pc_status s where s.key = 'arsip'),
           (select s.info from public.modis_pc_status s where s.key = 'arsip')
    from public.modis_conversions c;
end; $$;
revoke all on function public.modis_f1_photo_backlog() from public, anon;
grant execute on function public.modis_f1_photo_backlog() to authenticated;

create table if not exists public.modis_client_errors (
  id bigserial primary key,
  at timestamptz not null default now(),
  first_at timestamptz not null default now(),
  unit_id text,
  spg text,
  app_ver text,
  message text not null,
  stack text,
  url text,
  ua text,
  hits int not null default 1
);
alter table public.modis_client_errors enable row level security;
revoke all on public.modis_client_errors from anon, authenticated;
create index if not exists modis_client_errors_at on public.modis_client_errors (at desc);

create or replace function public.modis_f1_log_error(p_unit text, p_spg text, p_ver text, p_msg text, p_stack text, p_url text, p_ua text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_msg text := left(coalesce(p_msg, ''), 300); v_id bigint;
begin
  if v_msg = '' then return; end if;
  if (select count(*) from public.modis_client_errors where at > now() - interval '1 hour') > 300 then return; end if;
  select id into v_id from public.modis_client_errors
   where message = v_msg and coalesce(unit_id, '') = coalesce(left(p_unit, 30), '') and at > now() - interval '15 minutes'
   order by at desc limit 1;
  if v_id is not null then
    update public.modis_client_errors set hits = hits + 1, at = now() where id = v_id;
  else
    insert into public.modis_client_errors (unit_id, spg, app_ver, message, stack, url, ua)
    values (left(p_unit, 30), left(p_spg, 60), left(p_ver, 30), v_msg, left(p_stack, 1500), left(p_url, 200), left(p_ua, 200));
  end if;
end; $$;
revoke all on function public.modis_f1_log_error(text, text, text, text, text, text, text) from public;
grant execute on function public.modis_f1_log_error(text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.modis_f1_errors(p_limit int default 100)
returns table (id bigint, at timestamptz, first_at timestamptz, unit_id text, spg text, app_ver text, message text, stack text, url text, ua text, hits int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.modis_is_admin() then raise exception 'Hanya office' using errcode = '42501'; end if;
  return query select e.id, e.at, e.first_at, e.unit_id, e.spg, e.app_ver, e.message, e.stack, e.url, e.ua, e.hits
    from public.modis_client_errors e order by e.at desc limit greatest(1, least(coalesce(p_limit, 100), 300));
end; $$;
revoke all on function public.modis_f1_errors(int) from public, anon;
grant execute on function public.modis_f1_errors(int) to authenticated;

create or replace function public.modis_f1_errors_clear()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.modis_is_owner() then raise exception 'Hanya office' using errcode = '42501'; end if;
  delete from public.modis_client_errors where true;
end; $$;
revoke all on function public.modis_f1_errors_clear() from public, anon;
grant execute on function public.modis_f1_errors_clear() to authenticated;
