-- Stok uji [QC] konsisten dengan conversion (opening + refill - pemakaian = closing). Jalankan setelah seed-data-uji.sql.
delete from public.modis_stock_moves where by_name like '[QC]%';
create temp table qc_stock as
select g.unit_id, g.claim_day as day, g.item,
  (select case g.item
    when 'kapsul_candy' then count(*) filter (where c.reward = 'candy') + count(*) filter (where c.reward2 = 'candy')
    when 'kapsul_c' then count(*) filter (where c.reward = 'tier_c') + count(*) filter (where c.reward2 = 'tier_c')
    when 'kapsul_b' then count(*) filter (where c.reward = 'tier_b') + count(*) filter (where c.reward2 = 'tier_b')
    when 'kapsul_a' then count(*) filter (where c.reward = 'tier_a') + count(*) filter (where c.reward2 = 'tier_a')
    when 'kapsul_golden' then count(*) filter (where c.reward = 'golden')
    when 'candy_pcs' then 5 * (count(*) filter (where c.reward = 'candy') + count(*) filter (where c.reward2 = 'candy'))
    when 'kertas_foto' then count(*) filter (where c.photobooth)
    else count(*) filter (where c.merch = g.item) + count(*) filter (where c.merch2 = g.item) end
   from public.modis_conversions c where c.unit_id = g.unit_id and c.claim_day = g.claim_day and c.status = 'ok')::int as used
from (select distinct unit_id, claim_day, i.item from public.modis_conversions,
  unnest(array['w_roti','w_pisang','w_telur','w_caffino','w_isoplus','w_nobo','kapsul_candy','kapsul_c','kapsul_b','kapsul_a','kapsul_golden','c_keychain','c_sticker','c_pen','b_tote','b_pouch','b_lanyard','a_umbrella','a_tumbler','a_fan','candy_pcs','kertas_foto']) as i(item)
  where status = 'ok' and claim_day between date '2026-10-16' and date '2026-10-20') g;
insert into public.modis_stock_moves (unit_id, day, shift, kind, item, qty, by_name)
select q.unit_id, q.day, case when q.unit_id = 'kiosk2' then 'PM' else 'AM' end, 'opening', q.item, (ceil((q.used + 20) / 10.0) * 10)::int, '[QC] Data uji' from qc_stock q;
insert into public.modis_stock_moves (unit_id, day, shift, kind, item, qty, by_name)
select q.unit_id, q.day, case when q.unit_id = 'kiosk2' then 'PM' else 'AM' end, 'refill', q.item, 20, '[QC] Data uji' from qc_stock q where q.used >= 8 and (length(q.item) + extract(day from q.day)::int) % 3 = 0;
insert into public.modis_stock_moves (unit_id, day, shift, kind, item, qty, by_name)
select q.unit_id, q.day, case when q.unit_id = 'kiosk2' then 'PM' else 'AM' end, 'closing', q.item,
  greatest(0, (ceil((q.used + 20) / 10.0) * 10)::int + case when q.used >= 8 and (length(q.item) + extract(day from q.day)::int) % 3 = 0 then 20 else 0 end - q.used
    - case when q.item = 'w_roti' and q.unit_id = 'mobil' and q.day = date '2026-10-18' then 6 else 0 end), '[QC] Data uji' from qc_stock q;
drop table qc_stock;
