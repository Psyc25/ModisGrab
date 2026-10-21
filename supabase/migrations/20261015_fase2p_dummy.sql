-- Fase 2p: DATA DUMMY gambaran jadwal tim (9 TL + 32 SPG, 3 tim, rotasi 3 minggu). Bukan data kampanye asli.
-- Jam kerja: Pagi 05.00-14.00, Siang-Malam 12.00-21.00 (masing-masing 9 jam). Ganti nama/tim di dashboard saat crew sudah ada.
-- Pola: tiap minggu satu tim Pagi, satu tim Siang-Malam, satu tim libur (bergantian), sehingga 05.00-21.00 selalu terisi.

insert into public.modis_crew (unit_id, name, role, active) values
 ('mobil','Andi','tl',true),('kiosk1','Bayu','tl',true),('kiosk2','Raka','tl',true),
 ('mobil','Citra','tl',true),('kiosk1','Dimas','tl',true),('kiosk2','Eko','tl',true),
 ('mobil','Fajar','tl',true),('kiosk1','Gita','tl',true),('kiosk2','Hadi','tl',true),
 ('mobil','Rina','spg',true),('mobil','Dita','spg',true),('mobil','Lestari','spg',true),('mobil','Maya','spg',true),
 ('kiosk1','Sari','spg',true),('kiosk1','Nanda','spg',true),('kiosk1','Tika','spg',true),('kiosk1','Vina','spg',true),
 ('kiosk2','Putri','spg',true),('kiosk2','Wulan','spg',true),('kiosk2','Yuni','spg',true),
 ('mobil','Dewi','spg',true),('mobil','Elsa','spg',true),('mobil','Farah','spg',true),('mobil','Gina','spg',true),
 ('kiosk1','Hana','spg',true),('kiosk1','Indah','spg',true),('kiosk1','Jihan','spg',true),('kiosk1','Kiki','spg',true),
 ('kiosk2','Lia','spg',true),('kiosk2','Mira','spg',true),('kiosk2','Nisa','spg',true),
 ('mobil','Okta','spg',true),('mobil','Prita','spg',true),('mobil','Qori','spg',true),
 ('kiosk1','Rani','spg',true),('kiosk1','Salsa','spg',true),('kiosk1','Tari','spg',true),
 ('kiosk2','Ulfa','spg',true),('kiosk2','Vera','spg',true),('kiosk2','Wati','spg',true),('kiosk2','Yola','spg',true)
on conflict (unit_id, name) do update set role = excluded.role, active = true;

insert into public.modis_settings (key, value, updated_at) values ('jadwal', $j${
 "shifts": {"AM": {"name": "Pagi", "jam": "05.00–14.00"}, "MID": {"name": "Tengah", "jam": "08.30–17.30"}, "PM": {"name": "Siang–Malam", "jam": "12.00–21.00"}},
 "teams": {
  "A": {"tl": ["Andi","Bayu","Raka"], "spg": ["Rina","Dita","Lestari","Maya","Sari","Nanda","Tika","Vina","Putri","Wulan","Yuni"]},
  "B": {"tl": ["Citra","Dimas","Eko"], "spg": ["Dewi","Elsa","Farah","Gina","Hana","Indah","Jihan","Kiki","Lia","Mira","Nisa"]},
  "C": {"tl": ["Fajar","Gita","Hadi"], "spg": ["Okta","Prita","Qori","Rani","Salsa","Tari","Ulfa","Vera","Wati","Yola"]}
 },
 "rotation": [
  {"A": "AM", "B": "PM", "C": ""},
  {"A": "", "B": "AM", "C": "PM"},
  {"A": "PM", "B": "", "C": "AM"}
 ]
}$j$::jsonb, now())
on conflict (key) do update set value = excluded.value, updated_at = now();

select 'FASE2P-OK' as status, (select count(*) from public.modis_crew where active and role = 'tl') as tl, (select count(*) from public.modis_crew where active and role = 'spg') as spg;
