-- Fase 2j: opening & closing bersifat "nilai terakhir per item" (simpan ulang = koreksi, tidak dobel).
-- Refill tetap ditambahkan (bisa beberapa kali sehari).
create or replace function public.modis_f1_stock(p_token uuid, p_kind text, p_items jsonb, p_op text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.modis_sessions; k text; v int; d date := public.modis_wib_day(now());
begin
  s := public.modis_f1_session(p_token);
  if s.token is null or s.role <> 'tl' then raise exception 'Khusus Team Leader' using errcode = '42501'; end if;
  if p_kind not in ('opening', 'refill', 'closing') then raise exception 'Jenis stok tidak valid'; end if;
  if p_op is not null and exists (select 1 from public.modis_stock_moves where op_id = p_op) then return; end if;
  for k, v in select key, (value)::int from jsonb_each_text(p_items) loop
    if p_kind in ('opening', 'closing') then
      delete from public.modis_stock_moves where unit_id = s.unit_id and day = d and kind = p_kind and item = left(k, 30);
    end if;
    insert into public.modis_stock_moves (unit_id, day, shift, kind, item, qty, by_name, op_id)
    values (s.unit_id, d, s.shift, p_kind, left(k, 30), greatest(0, v), s.spg_name, left(p_op, 64));
  end loop;
end; $$;
grant execute on function public.modis_f1_stock(uuid, text, jsonb, text) to anon, authenticated;

-- Rapikan data yang sudah dobel: sisakan baris terakhir per unit/hari/jenis/item untuk opening & closing
delete from public.modis_stock_moves m
using public.modis_stock_moves n
where m.kind in ('opening', 'closing') and n.kind = m.kind and n.unit_id = m.unit_id and n.day = m.day and n.item = m.item and n.id > m.id;

select 'FASE2J-OK' as status;
