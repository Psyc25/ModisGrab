-- DATA UJI [QC] Grab MODIS (100 conversion + foto, Cek Boros, close day, stok, issue, stamp). Hapus: hapus-data-uji.sql
do $q$
declare
  fn text[] := array['Budi','Siti','Agus','Dewi','Rizky','Putri','Andi','Nur','Fajar','Ayu','Hendra','Rina','Yoga','Maya','Dimas','Lestari','Eko','Wulan','Reza','Intan','Bagas','Citra','Galih','Sinta','Arif','Mega','Taufik','Nadia','Rudi','Fitri','Ilham','Anisa','Bayu','Laras','Joko','Salsa','Krisna','Dian','Farhan','Tiara'];
  ln text[] := array['Santoso','Wijaya','Pratama','Lestari','Saputra','Rahman','Hidayat','Kusuma','Nugroho','Permata','Susanto','Firmansyah','Utami','Setiawan','Maulana','Handayani','Purnama','Ramadhan','Wibowo','Anggraini'];
  vn text[] := array['Kota Kasablanka','Grand Indonesia','Plaza Senayan','Stasiun Sudirman','Terminal Blok M','Universitas Indonesia Depok','Summarecon Mall Serpong','Stasiun Manggarai','Pasar Santa','Taman Anggrek'];
  vc text[] := array['Mall','Mall','Mall','Stasiun','Terminal','Kampus','Mall','Stasiun','Pasar','Mall'];
  units text[] := array['mobil','kiosk1','kiosk2'];
  spg text[][] := array[array['Rina','Dita','Lestari','Maya'],array['Sari','Nanda','Tika','Vina'],array['Putri','Wulan','Yuni','Wati']];
  wm text[] := array['w_roti','w_pisang','w_telur']; wd text[] := array['w_caffino','w_isoplus','w_nobo'];
  n int; u int; v int; d date; h int; mi int; t text; r text; mer text; ph text; at timestamptz; k text; x float;
  key text;
begin
  select s.v into key from public.modis_secrets s where s.k = 'phone_key';
  perform setseed(0.26);
  for n in 1..100 loop
    d := case when n <= 22 then date '2026-10-17' when n <= 49 then date '2026-10-18' when n <= 78 then date '2026-10-19' else date '2026-10-20' end;
    x := random(); u := case when x < 0.36 then 1 when x < 0.71 then 2 else 3 end;
    v := case u when 1 then 1 + floor(random()*4)::int when 2 then 5 + floor(random()*3)::int else 8 + floor(random()*3)::int end;
    h := 6 + floor(random() * case when d = date '2026-10-20' then 7 else 14 end)::int; mi := floor(random()*60)::int;
    at := (d::text || ' ' || lpad(h::text,2,'0') || ':' || lpad(mi::text,2,'0') || ':00+07')::timestamptz;
    x := random(); t := case when x < 0.45 then 'pahe_new' when x < 0.65 then 'pahe_lapsed' else 'gb_hemat' end;
    x := random(); mer := null;
    if t = 'gb_hemat' then
      r := case when x < 0.40 then 'tier_c' when x < 0.65 then 'tier_b' when x < 0.75 then 'tier_a' when x < 0.90 then 'candy' else 'none' end;
      mer := case r when 'tier_c' then (array['c_keychain','c_sticker','c_pen'])[1+floor(random()*3)::int] when 'tier_b' then (array['b_tote','b_pouch','b_lanyard'])[1+floor(random()*3)::int] when 'tier_a' then (array['a_umbrella','a_tumbler','a_fan'])[1+floor(random()*3)::int] else null end;
    else
      r := case when x < 0.5 then 'snack' else 'drink' end;
      mer := case r when 'snack' then wm[1+floor(random()*3)::int] else wd[1+floor(random()*3)::int] end;
    end if;
    ph := '628999' || lpad((100000 + n*37)::text, 6, '0');
    insert into public.modis_conversions (id, created_at, claim_day, unit_id, shift, spg_name, poi_location, poi_category, phone_hash, phone_enc, phone_last4, name, type, reward, extra_draw, photobooth, consent, consent_ver, status, merch, photo_path)
    values ('qc_' || lpad(n::text,3,'0'), at, public.modis_wib_day(at), units[u], case when h < 13 then 'AM' else 'PM' end, '[QC] ' || spg[u][1+floor(random()*4)::int], vn[v], vc[v],
      public.modis_f1_phone_hash(ph), extensions.pgp_sym_encrypt(ph, key), right(ph,4), fn[(n*7)%40+1] || ' ' || ln[(n*3 + n/40)%20+1], t, r, false, random() < 0.3, true, 'v1', 'ok', mer,
      'proof/' || d::text || '/qc_' || lpad(n::text,3,'0') || '.jpg')
    on conflict (id) do nothing;
  end loop;

  for n in 1..70 loop
    k := 'qc_' || lpad((1 + floor(random()*100)::int)::text, 3, '0');
    insert into public.modis_boros_checks (op_id, unit_id, day, shift, spg_name, poi_location, trips_day, trip_cost, trips_month, monthly_cost, discount, savings, status, created_at)
    select 'qc_b_' || lpad(n::text,3,'0'), c.unit_id, c.claim_day, c.shift, c.spg_name, c.poi_location, (array['2','4','6'])[1+floor(random()*3)::int], (array['18000','25000','32000'])[1+floor(random()*3)::int],
      (array[20,30,40])[1+floor(random()*3)::int], m.cost, 40, (m.cost * 0.4 * (0.5 + random()*0.3))::int,
      case when m.cost >= 1800000 then 'Sangat Boros' when m.cost >= 1000000 then 'Boros' when m.cost >= 600000 then 'Lumayan Boros' else 'Cukup Hemat' end, c.created_at
    from public.modis_conversions c, (select (array[450000,600000,800000,1000000,1200000,1500000,1800000,2200000])[1+floor(random()*8)::int] as cost) m
    where c.id = k
    on conflict (op_id) do nothing;
  end loop;

  insert into public.modis_close_days (unit_id, day, shift, reach, contacts, closed_by, notes)
  select b.unit_id, b.day, case when b.unit_id = 'kiosk2' then 'PM' else 'AM' end, 140 + floor(random()*190)::int, count(*)::int,
    '[QC] ' || case b.unit_id when 'mobil' then 'Rina' when 'kiosk1' then 'Sari' else 'Putri' end, 'Data uji'
  from public.modis_boros_checks b where b.op_id like 'qc\_%' group by b.unit_id, b.day
  on conflict (unit_id, day) do nothing;

  insert into public.modis_stock_moves (unit_id, day, shift, kind, item, qty, by_name)
  select g.unit_id, g.claim_day, case when g.unit_id = 'kiosk2' then 'PM' else 'AM' end, 'opening', g.item, 60, '[QC] Data uji'
  from (select distinct c.unit_id, c.claim_day, i.item from public.modis_conversions c, (values ('w_roti'),('w_pisang'),('w_caffino'),('w_isoplus')) i(item) where c.id like 'qc\_%') g;
  insert into public.modis_stock_moves (unit_id, day, shift, kind, item, qty, by_name)
  select g.unit_id, g.claim_day, case when g.unit_id = 'kiosk2' then 'PM' else 'AM' end, 'closing', g.item,
    greatest(0, 60 - (select count(*) from public.modis_conversions c where c.id like 'qc\_%' and c.unit_id = g.unit_id and c.claim_day = g.claim_day and c.merch = g.item)::int - (array[0,0,0,2,4])[1+floor(random()*5)::int]), '[QC] Data uji'
  from (select distinct c.unit_id, c.claim_day, i.item from public.modis_conversions c, (values ('w_roti'),('w_pisang'),('w_caffino'),('w_isoplus')) i(item) where c.id like 'qc\_%') g;

  insert into public.modis_issues (id, created_at, day, unit_id, shift, by_name, role, poi_location, category, note, status, resolved_note, resolved_at) values
  ('qc_i1','2026-10-18 11:20:00+07','2026-10-18','mobil','AM','[QC] Rina','spg','Kota Kasablanka','Perangkat','Tablet sempat lambat saat sinyal lemah (data uji)','done','Pindah ke hotspot cadangan',now()),
  ('qc_i2','2026-10-19 15:05:00+07','2026-10-19','kiosk1','PM','[QC] Sari','spg','Universitas Indonesia Depok','Stok','Welcome snack Pisang menipis, minta refill (data uji)','open',null,null),
  ('qc_i3','2026-10-20 09:40:00+07','2026-10-20','kiosk2','AM','[QC] Putri','tl','Stasiun Manggarai','Lokasi','Area booth sedikit bergeser karena renovasi peron (data uji)','open',null,null)
  on conflict (id) do nothing;

  insert into public.modis_stamp_cards (phone_hash, day, unit_id, poi_location, pahe_id)
  select c.phone_hash, c.claim_day, c.unit_id, c.poi_location, c.id from public.modis_conversions c where c.id like 'qc\_%' and c.type = 'pahe_new' order by c.id limit 12
  on conflict (phone_hash, day) do nothing;
end
$q$;
select 'SEED-OK' as hasil, (select count(*) from public.modis_conversions where id like 'qc\_%') as conversion, (select count(*) from public.modis_boros_checks where op_id like 'qc\_%') as cek_boros, (select count(*) from public.modis_stamp_cards where pahe_id like 'qc\_%') as stamp;
