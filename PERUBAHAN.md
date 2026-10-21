# Daftar perubahan – MODIS Cek Boros

Versi asli: ekspor AI Studio (`modis---cek-boros-ongkos-harian-grab-pahe_1.zip`).

## Keamanan data peserta

| Sebelum | Sesudah | File |
|---|---|---|
| Aturan Supabase `FOR ALL TO anon USING (true)`: siapa pun bisa membaca, mengubah, menghapus semua data | Publik hanya bisa **menambah**. Baca/ubah/hapus hanya untuk akun di tabel `modis_admins` | `supabase/schema.sql` |
| Login owner pakai PIN `modis2026` yang tertulis di layar dan dicek di browser | Login admin pakai akun Supabase (email + password), dicek di server | `AdminDrawer.tsx`, `services/supabase.ts` |
| URL & kunci Supabase bisa diubah lewat panel di tiap perangkat | Dari environment saat build (`VITE_SUPABASE_*`) | `config/supabase.ts` |
| Nama & nomor WA lengkap muncul di notifikasi panel SPG dan antrean offline | Disamarkan (`+62812••••890`) | `AdminDrawer.tsx`, `ConnectionStatusIndicator.tsx` |
| Data lengkap tersimpan permanen di tablet | Nama lengkap, email, WA otomatis dihapus dari tablet setelah terkirim ke server | `services/storage.ts`, `services/queuedSync.ts` |
| Tombol "Tes Simulasi Alert" membuat data palsu yang ikut ke Supabase | Dihapus | `AdminDrawer.tsx` |
| Cek visitor ulang hanya dari data tablet itu | Lewat fungsi server `modis_lookup_visitor` yang hanya mengembalikan angka (stamp, jumlah kunjungan) | `schema.sql`, `storage.ts` |
| Ekspor CSV/Excel bisa disusupi formula | Sel yang diawali `= + - @` diamankan | `storage.ts` |

## Persetujuan data & peserta di bawah umur

- Pertanyaan **usia** di awal. Di bawah 18: nama, email, WA **tidak diminta dan tidak disimpan** (dijaga juga oleh aturan database).
- Kotak persetujuan **kosong** secara default; wajib dicentang oleh peserta dewasa.
- Email jadi **opsional**.
- Versi teks persetujuan ikut tersimpan (`consent_version`).
- Kebijakan privasi berisi pengelola data, lama simpan, dan kontak — **bagian dalam [kurung siku] wajib diisi** setelah konfirmasi Milli/Grab.

## Validitas data & kalkulator

- Jawaban kebiasaan **kosong** secara default; keempatnya wajib dipilih.
- Rumus konsisten: nilai tengah tiap rentang × 22 hari kerja (1–2→1,5; 3–4→3,5; 5–6→5,5; 7+→7 kali/hari).
- Pertanyaan GrabFood diubah menjadi **per minggu** (× 4,3 minggu).
- Semua angka bisnis dipindah ke `src/config/campaign.ts`.
- "Simulasi resmi program Grab PAHE" diganti teks estimasi.

## Voucher, stamp, gacha

- "Kode unik aktivasi" → **"Kode klaim booth"** + penjelasan bahwa ini bukan kode promo di aplikasi Grab.
- Kode dibuat dengan acak kriptografis, 6 karakter.
- Stamp **tidak bisa diketuk visitor**. Stamp baru masuk setelah SPG memasukkan **PIN SPG**.
- Gacha hanya bisa diputar setelah verifikasi SPG, **diundi di server**, dan stok berkurang atomik untuk semua unit.
- Visitor tidak bisa lagi memilih hadiah sendiri dengan mengetuk kartu hadiah.
- Tombol "Simulasi Scan SPG" dihapus.
- Data kini mencatat `spg_verified` (sudah diverifikasi SPG atau belum).

## Tampilan & performa

- Alat internal (pemilih perangkat, Slide Tim, SPG Panel, simulasi offline) hanya tampil dengan `?staff=1`.
- Tombol melayang "Slide Tim" yang menutupi tombol Klaim dihapus.
- Tombol utama memakai hijau lebih gelap (#00873C) agar teks putih terbaca jelas di luar ruangan.
- Ukuran aplikasi untuk visitor: **483 KB → 167 KB** (gzip). Panel admin, dek slide, grafik, dan pembuat PNG dimuat hanya saat dibuka.
- Sinkronisasi antrean offline berjalan sejak aplikasi dibuka (sebelumnya baru jalan setelah visitor menekan Mulai).

## Teknis

- `npm install` kini berhasil tanpa `--legacy-peer-deps` (konflik esbuild dihapus, `react-is` ditambahkan).
- Paket tak terpakai dihapus: `@google/genai`, `express`, `dotenv`, `tsx`, `@types/express`.
- `bun.lock` lama dihapus (tidak sesuai lagi dengan dependensi).
- Panel admin ditulis ulang (1.849 → ±840 baris, tanpa tampilan data pribadi di mode SPG). Tab "Mockup unit" tidak dibawa; materinya ada di Slide Tim.

## Pengujian yang sudah dilakukan

- Skema SQL dijalankan dua kali di PostgreSQL 16 (aman diulang) dan diuji sebagai publik, user biasa, dan admin.
- Gacha: 3.000 putaran sesuai bobot (39/25/18/12/5%), berhenti tepat saat stok habis.
- Alur visitor dewasa, di bawah 18, visitor ulang + verifikasi SPG + gacha, dan mode offline → online,
  dengan server Supabase tiruan. Data yang dikirim aplikasi lolos aturan database.

## Status backend (8 Okt 2026)

- Skema terpasang di project `lucjgeoaugcsxolgdsfe` (modis-cek-boros) dan diuji langsung lewat API Supabase dengan publishable key: tambah data berhasil; baca/ubah/hapus data, baca daftar admin, dan ubah stok oleh publik ditolak; cek visitor ulang & gacha berjalan. Data uji sudah dihapus.
- Publishable key sudah terpasang di `src/config/supabase.ts`.

## Yang masih menunggu

- Akun admin (dibuat di Authentication → Users, lalu didaftarkan ke `modis_admins`).
- Matikan pendaftaran pengguna baru di pengaturan Authentication.
- Teks kebijakan privasi (pengelola data, lama simpan, kontak).
- Angka resmi PAHE & asumsi hemat GrabFood dari Grab (`config/campaign.ts`).
- Sarapan gratis belum dicatat terpisah dari gacha; stoknya belum dilacak.

## Tampilan baru ala aplikasi Grab (8 Okt 2026)

- Semua logo, latar, dan banner diambil langsung dari deck proposal (`src/assets/brand/`): logo MODIS, logo Grab, PAHE, GrabUnlimited, "Hemat Setiap Hari", key visual jalan & kota, banner GrabBike PAHE / GrabCar Hemat / GrabFood 55%, bola gacha. Logo gambar ulang (SVG buatan) dihapus.
- Font Plus Jakarta Sans (pengganti Inter yang terlalu umum), sans-serif geometris yang paling mendekati karakter font aplikasi Grab. Disertakan di aplikasi sehingga tetap tampil offline. Font resmi "Grab Community" tidak tersedia publik; bila Grab/Milli memberi file-nya, cukup ganti `--font-sans` / `--font-display` di `src/index.css`.
- Kode klaim booth memakai font yang sama dengan teks lain (bukan font mesin ketik), seperti voucher di aplikasi Grab.
- Pola layar mengikuti aplikasi Grab: beranda dengan key visual + lembar putih, kolom "cari", ikon layanan, carousel promo; header putih dengan panah kembali dan progres 3 langkah; isian abu-abu; pilihan berbentuk chip; tombol hijau penuh menempel di bawah; hasil bergaya struk checkout; voucher bergaya tiket; kartu stamp mengikuti desain kartu stamp di deck.
- Indikator koneksi/antrean hanya tampil di tablet petugas (`?staff=1`).
- Catatan: logo Grab putih dari deck beresolusi rendah (126×44 px); ganti `grab-wordmark-white.webp` bila ada versi resmi.

## Panel SPG, dashboard owner/klien, banner otomatis (9 Okt 2026)

- Pertanyaan usia dihapus atas keputusan tim; semua visitor mengisi nama, nomor WA, dan email (kini wajib). Kolom `age_group` di database jadi opsional.
- Banner promo bergeser otomatis (beranda, hasil, klaim): GrabBike PAHE, "Hemat Setiap Hari", GrabCar Hemat, "PAHE ≠ GrabUnlimited", GrabFood 55%. Berhenti saat disentuh, tidak bergerak bila perangkat meminta kurangi animasi.
- Tablet SPG (`?staff=1`) wajib "Mulai tugas jaga" tiap hari: nama SPG, shift, jam jaga, lokasi, unit, target. Jam jaga tersimpan di setiap visitor (`duty_hours`).
- Panel SPG baru: daftar visitor tablet itu (shift ini / hari ini / semua), status terkirim, edit tugas, akhiri tugas, PIN SPG + reset PIN dengan login owner/klien. Akses data lengkap dihapus dari panel SPG.
- Modul `/dashboard` khusus owner & klien (login Supabase): rekap harian per SPG/lokasi/shift, KPI, daftar visitor lengkap, unduh Excel/CSV/Sheets per periode (WIB), grafik, stok hadiah. Peran **owner** bisa hapus data & ubah stok; **client** hanya lihat & unduh. SPG tidak punya akun.
- Migrasi database: `supabase/migrations/20261009_spg_owner_client.sql` (sudah dijalankan di project lucjgeoaugcsxolgdsfe).

## Pembaruan 8 Okt 2026: login kata sandi & Google Sheets live

- Dashboard `/dashboard` cukup memasukkan **kata sandi** (tanpa email). Di balik layar, kata sandi dicek oleh Supabase Auth untuk akun tetap `dashboard@modis-cekboros.app`, jadi tetap diverifikasi di server, bukan di browser.
- Reset PIN SPG ("Lupa PIN?") juga cukup memakai kata sandi dashboard.
- Laporan harian live di Google Sheets: `integrations/google-sheets/` (skrip Apps Script + cara pasang). Data tetap tersimpan di Supabase; setiap hari otomatis dibuat sheet baru `Data YYYY-MM-DD`, ditambah `Ringkasan Harian` dan `Rekap SPG`.

## Pembaruan 9 Okt 2026: data visitor disederhanakan (PAHE GrabBike saja)

Hasil diskusi tim. Dihapus dari aplikasi, laporan, ekspor, dan Google Sheet:
- Pertanyaan persepsi GrabUnlimited
- Pertanyaan & perhitungan GrabFood (PAHE hanya untuk GrabBike). Potensi hemat kini dihitung dari GrabBike saja.
- Kode klaim booth (termasuk QR)
- Kolom "Diverifikasi SPG". PIN SPG tetap dipakai sebagai kunci sebelum memberi stamp & memutar gacha, tapi tidak lagi dicatat sebagai kolom.
- ID (tetap ada di database sebagai kunci, tidak ditampilkan di laporan)
- Shift. SPG cukup mengisi jam jaga (ada isi cepat Pagi / Siang / Sore-Malam / Seharian sesuai Running Schedule).

Kuis Cek Boros sekarang 2 pertanyaan: berapa kali naik GrabBike sehari dan rata-rata ongkos sekali jalan.
Kolom lama di database dibiarkan (kosong untuk data baru) supaya data lama tidak rusak.

Baru: `integrations/google-sheets/MODIS_ClientDashboard.gs` untuk spreadsheet laporan klien (subtotal + grafik, tanpa data pribadi)
dan fungsi database `modis_report_agg` (`supabase/migrations/20261009_report_agg.sql`, sudah dijalankan di produksi).

## Pembaruan 9 Okt 2026: alur SPG
- Mulai tugas: Unit → Slot (Mobil: Pagi/Siang/Sore-Malam, Kiosk: Seharian) → lokasi terisi otomatis dari Running Schedule 98 hari (src/data/runningSchedule.ts, dibuat dari Master Timeline lewat scripts/build_schedule.py). Bisa "Lokasi berbeda / pindah" bila tidak sesuai jadwal.
- PIN SPG wajib dibuat di layar mulai tugas bila tablet belum punya PIN.
- Pengingat "Laporan slot" muncul 15 menit sebelum jam jaga selesai bila belum diisi (bisa ditunda 10 menit).
- "Akhiri tugas" menampilkan ringkasan serah terima: visitor, hadiah, KPI & merch dari laporan slot, data tertunda.

## Satu aplikasi untuk SPG, visitor & internal (9 Okt 2026)

- Hanya dua link: **aplikasi** (`/`) dan **report klien** (`/laporan?k=…`).
- SPG wajib isi data tugas jaga (nama, unit, slot, lokasi sesuai Running Schedule, PIN SPG) sebelum layar visitor terbuka.
- Tombol **Menu petugas** (pojok kanan atas): Panel SPG (PIN SPG), Dashboard internal (PIN admin, keluar otomatis 10 menit, sesi dihapus saat kembali), slide tim, reset otomatis.
- **Pelacakan lokasi** tablet selama jam jaga (kirim saat pindah >50 m atau tiap 3 menit) → tab **Peta unit** di dashboard: marker per unit (hijau ≤5 mnt, oranye ≤30 mnt, abu lebih lama), jejak perjalanan per hari, cek lokasi vs jadwal. Tabel `modis_device_positions`, `modis_position_log`, fungsi `modis_report_position` (`20261009_device_tracking.sql`).
- Tab **Laporan slot**: monitor per hari vs Running Schedule (masuk / berjalan / belum lapor / lokasi beda jadwal), daftar laporan dengan koreksi & hapus oleh owner (tercatat `edited_by`, `edited_at`).
- **Bersihkan data uji** (Pengaturan, owner, ketik HAPUS): visitor [QC] dan/atau semua data sebelum tanggal tertentu (`modis_purge_test_data`, `20261009_internal_tools.sql`).
- Filter tanggal sama untuk tab Laporan, Laporan slot, dan Data visitor.
- Banner promo: gambar dipertajam, geser otomatis tiap 4 detik, bisa di-swipe, efek zoom halus, kilau, dan indikator progres. Animasi layar & kartu bertahap (mengikuti setelan "kurangi gerakan").
- **Ganti shift otomatis**: 10 menit setelah jam jaga selesai, tugas ditutup otomatis bila Laporan slot sudah dikirim; bila belum, layar visitor dikunci dengan pengingat "Isi laporan slot". Form berikutnya kosong (nama SPG baru) dan menyarankan slot berikutnya di unit yang sama. Visitor yang sedang diinput tidak terpotong.

## Layar visitor diperbarui (9 Okt 2026)

- Tombol **Simpan kartu hasil** dihapus (gambarnya hanya tersimpan di tablet, tidak sampai ke visitor).
- **Gacha di aplikasi dihapus** (diganti mesin gacha fisik di booth), termasuk tab Stok hadiah di dashboard. Kolom "Hadiah" di semua laporan sekarang berarti **Stamp diberikan** (tercatat sebagai "Stamp ke-N").
- **Aturan stamp**: dicatat per nomor WhatsApp (nama tidak berpengaruh), maksimal 1 stamp per nomor per hari di unit mana pun, sampai 6 stamp. Stamp dicek ulang ke server saat tombol Lanjut ditekan.
- **Kirim hasil ke WhatsApp otomatis**: tiap visitor masuk antrean `modis_wa_outbox` dengan pesan yang rapi, dikirim oleh workflow n8n + GOWA (`integrations/whatsapp`). Tombol wa.me manual dihapus.
- **Slide tim dihapus** dari aplikasi (beserta file PDF deck dan paket jspdf, qrcode, html2canvas).
- Layar Promo dibuat ulang: voucher PAHE baru, cara klaim 3 langkah, kartu stamp dengan animasi stamp baru, PIN pad untuk SPG. Hasil Cek Boros dengan angka hemat yang naik perlahan.

## Perbaikan layar blank (9 Okt 2026)

- Penyebab: tablet yang dibiarkan terbuka masih memakai versi lama; setelah aplikasi diperbarui, file Panel SPG versi lama sudah tidak ada sehingga layar menjadi putih.
- Sekarang aplikasi otomatis memuat ulang ke versi terbaru saat hal ini terjadi, dan setiap bagian (aplikasi, Panel SPG, dashboard, peta, report klien) punya layar pemulihan "Muat ulang aplikasi" alih-alih layar putih. Error terakhir dicatat di tablet (`modis_last_error`) untuk pengecekan.
- Halaman utama tidak di-cache browser (`vercel.json`), file aset tetap di-cache.
- Layar "Jam jaga sudah selesai" kini punya tombol Menu petugas.

## Report klien (9 Okt 2026)

- KPI di bawah Progres campaign: Reach, Contact, **Diverifikasi SPG (PAHE aktif)**, Contact rate, **Visitor terdaftar**, **Visitor unik**. Rata-rata potensi hemat dan Stamp diberikan dihapus.
- Di halaman klien (web & Excel), angka Conversion diganti **Diverifikasi SPG** = visitor yang PAHE-nya dicek SPG lewat PIN (dapat stamp). Progres, grafik, dan tabel ikut memakai angka ini. Dashboard internal tetap memakai Conversion dari laporan slot.
- **Laporan per lokasi** jadi laci: tertutup dengan ringkasan "3/5 lokasi terisi" (dibanding Running Schedule periode itu), dibuka per lokasi berisi Reach, Contact, Diverifikasi, Visitor, rincian unit · slot, dan jadwal.
- Excel: kotak KPI menjadi 6 (baris kedua: Visitor terdaftar & Visitor unik).

## Fase 1 Field App (spec v1) — hari 1 (10 Okt 2026)

- Dites di **/crew** (alamat utama tetap aplikasi lama sampai tim setuju pindah).
- Database baru: `modis_units` (PIN unit & PIN TL, ter-hash), `modis_sessions` (sesi shift 12 jam), `modis_conversions` (nomor HP terenkripsi + hash, tipe, reward, foto, consent, status double claim), bucket foto privat `modis-proof`, `modis_stock_moves`, `modis_close_days`. Semua tulis lewat fungsi bertoken sesi (`modis_f1_*`), migrasi `20261011_fase1.sql`.
- Login per shift: unit + nama + shift AM/PM + PIN unit (PIN TL membuka mode Team Leader).
- Alur customer: HP → nama (autofill) → tipe (PaHe baru / lapsed / GB Hemat) → foto bukti (kompres ≤300 KB) → reward (welcome snack/drink sesuai shift; kupon Candy/C/B/A untuk GB Hemat; photobooth; Ride & Share) → consent → simpan. Lanjut GB Hemat untuk customer yang sama dengan satu tombol.
- Double claim: PaHe 1x selama program, GB Hemat 1x per hari; dicek ke server saat online dan ke cache hash di tablet saat offline. Bentrok saat sync ditandai, tidak dihapus.
- Antrean offline di IndexedDB: data dikirim dulu, foto belakangan; nomor HP dihapus dari tablet setelah terkirim. Penanda "belum terkirim" selalu terlihat.
- Cek Boros jadi menu terpisah untuk SPG Host; setiap Cek Boros selesai dihitung 1 contact.

## Fase 1 Field App — lengkap (11 Okt 2026)

- **Menu Team Leader** (login PIN TL): Stok unit (opening dengan saran SOP, refill, closing; rekap open/refill/pakai/seharusnya/closing/selisih, tanda merah bila selisih >2%) dan Close day (reach manual, contacts otomatis dari Cek Boros, catatan, ringkasan per tipe & reward, teks siap copy / buka WhatsApp). Operasi TL ikut antrean offline dan tidak dobel saat sync ulang.
- **Golden coupon**: office set tanggal & kode PM di dashboard; tombol Golden hanya muncul untuk TL di tanggal itu, wajib kode PM + foto pemenang + sinyal. Kode salah / bukan tanggalnya ditandai, tidak diterima diam-diam.
- **PWA**: /crew bisa dibuka tanpa internet setelah sekali dibuka online (service worker), bisa dipasang ke layar utama tablet (ikon MODIS Crew).
- **Dashboard office → tab Field App** (default): kumulatif vs 58.800, KPI periode (PaHe baru/lapsed, GB Hemat, reach, contacts, photobooth, double claim), reward per tier, per unit / POI / SPG, daftar conversion + lihat foto bukti, setujui double claim, stok & variance per unit per hari, close day TL, export CSV (owner: nomor lengkap; klien: tersamar), ganti PIN unit/TL, atur Golden. Muat ulang tiap 30 detik.
- **Google Sheet**: `integrations/google-sheets/MODIS_FieldSync.gs` (lembar Conversion, Daily Report, Stok; sync tiap 10 menit).
- Bersihkan data uji kini juga menghapus conversion/stok/close day [QC]. Migrasi `20261011_fase1b.sql`.

## Peringkat GrabBike Hemat menggantikan Golden (15 Okt 2026)

- **Golden coupon dihapus** dari aplikasi crew, dashboard (pengaturan kode PM/tanggal), laporan WA, dan stok kapsul. Label Golden hanya tersisa untuk data lama.
- **Input SPG**: bagian "Order GrabBike Hemat 30 hari" di form customer (stepper + pilihan cepat; konfirmasi bila >60; opsi "Customer tidak ikut peringkat"). Tersimpan lewat antrean offline (`gb30`), idempotent per `op_id`, tabel `modis_gb_history` (migrasi `20261015_fase2n.sql`).
- **Peringkat**: 10 teratas berupa diagram batang, peringkat 11+ di dropdown; skor sama = SERI; memakai entri terakhir per nomor HP; periode seluruh kampanye / Bulan 1-3 / rentang tanggal. Tampil di dashboard office (owner bisa ekspor CSV dengan nomor lengkap) dan tab "Peringkat GrabBike" di laporan klien (PIN klien, hanya 4 digit akhir HP). Pemenang ditetapkan pihak Grab (Mas Ale).
- **3 shift**: Pagi 06.30-09.30, Siang 11.00-14.00, Sore/Malam 16.30-20.00 (`20261014_fase2m.sql`). Welcome snack satu item per minggu (rotasi Roti, Pisang, Telur). Kolom email dihapus. Semua logo MODIS dihapus; header memakai logo Grab putih di hijau Grab.
- Catatan: fungsi server lama `modis_f1_set_golden*` masih ada tetapi tidak dipanggil aplikasi; kolom Golden di Daily Report/Sheet dipertahankan agar urutan kolom tidak bergeser (isinya 0).

## Jadwal shift berbasis tim (15 Okt 2026)

- Jam kerja 9 jam: **Pagi 05.00-14.00** dan **Siang-Malam 12.00-21.00** (shift Tengah 08.30-17.30 disiapkan tetapi belum dipakai). Nama dan jam bisa diubah office.
- Shift bukan pilihan jam, tetapi **shift tim**: tiap tim mendapat Pagi, Siang-Malam, atau Libur per minggu kampanye (mulai 26 Okt), lalu bergantian. Rotasi, anggota tim (TL dan SPG), dan jam diatur di dashboard office > Operasional > **Jadwal kerja crew (shift tim)**, lengkap dengan gambaran 6 minggu ke depan.
- Login: begitu SPG/TL memilih/mengetik nama yang ada di tim, shift terisi otomatis dan terkunci. Tim yang libur diberi pemberitahuan; shift hanya boleh dipilih manual bila menggantikan. Nama yang tidak ada di tim (pengganti) bebas memilih shift.
- Data dummy gambaran (`20261015_fase2p_dummy.sql`): 9 TL + 32 SPG dalam 3 tim (A: 3 TL + 11 SPG, B: 3 TL + 11 SPG, C: 3 TL + 10 SPG), tiap tim punya 1 TL dan 3-4 SPG di setiap unit (mobil, kiosk 1, kiosk 2). Rotasi 3 minggu: A Pagi / B Siang-Malam / C Libur, lalu B Pagi / C Siang-Malam / A Libur, lalu C Pagi / A Siang-Malam / B Libur. Ganti dengan nama asli saat crew sudah ada.
- Disimpan di setting `jadwal` (`20261015_fase2o.sql`), dibaca tablet lewat `modis_f1_jadwal()` dan disimpan untuk offline.

## Perapian akhir (16 Okt 2026)

- Hanya dua shift dipakai: Pagi 05.00-14.00 dan Siang-Malam 12.00-21.00. Shift "Tengah" disembunyikan dari login, input susulan, dan pengaturan jadwal (kodenya dipertahankan agar data lama terbaca). Pilihan shift otomatis menurut jam: sebelum 12.00 Pagi, selebihnya Siang-Malam.
- Keterangan "plotting hari ini" kini memakai jam shift resmi, bukan label lama dari Excel.
- Sesi login 12 jam menjadi 11 jam (`20261016_fase2q.sql`); fungsi pengaturan Golden lama dihapus dari server.
- Google Sheet Daily Report (`MODIS_FieldSync.gs`): label shift AM menjadi 05.00-14.00. Kolom Golden tetap ada (isi 0) agar urutan kolom tidak bergeser.

## Perbaikan 16 Okt (4 poin)
- **Welcome snack**: Roti selalu ada tiap hari. Seminggu sekali ada hari menu lengkap (Roti + Pisang + Telur) yang ditentukan office dengan mengetik nomor (hari 1=Senin … 7=Minggu), bisa per nomor minggu. Setting `welcome` = `{every_dow, weeks}` (field `rotation:['w_roti']` hanya agar lolos validasi server lama). Tidak perlu migrasi SQL.
- **Reward**: kupon 4 kolom rata + panel "Pilih item hadiah" dengan tanda centang.
- **Input terakhir & total**: satu orang (nama + 4 digit nomor sama) digabung jadi satu data; total dan kartu tipe dihitung per orang (tipe utama: PaHe baru > lapsed > GB Hemat). Stok/reward tetap per submission.
- SW v34.

## Realtime dashboard office (16 Okt)
- Hook `useRealtime` (Supabase realtime) di panel Field (conversion, stok, close, GB, boros), Issue, Gudang, Peta, Peringkat GB, Monitor slot; polling cadangan 10–20 detik.
- Migrasi `20261016_fase2r_realtime.sql` (10 tabel ke publikasi `supabase_realtime`, sudah dijalankan).
- Monitor slot: kartu baru "Aktivitas crew hari ini" dari data crew baru; penjelasan "Di luar jadwal" (Running Schedule lama mulai 26 Okt; laporan slot lama tidak diisi app crew).

## Persiapan training klien (16 Okt)
- Polesan visual: kartu masuk bertahap + hover, angka berkedip hijau saat berubah, titik "live", hover baris tabel, fokus input hijau, ripple di laporan klien.
- Total conversion di dashboard office dan laporan klien dihitung per ORANG per hari (migrasi `20261016_fase2s_per_orang.sql`, sudah dijalankan).
- SW v36.

## 18 Okt (malam)
- Label "PaHe Last" diganti "PaHe Right" (aplikasi, dashboard, laporan klien, skrip Google Sheet).
- Monitor slot: kartu crew hari ini dibandingkan dengan plotting terbaru (venue/shift), ada penanda lokasi beda dan unit belum input.
- Skrip Google Sheet: label PaHe New/Right, Daily Report dihitung per orang. Tempel ulang skrip di Apps Script agar berlaku.
- Service worker v38.
- Arsip foto ke PC kantor: migrasi `20261018_fase2t_arsip_foto.sql` (sudah diterapkan), kolom `photo_archived_at/photo_archive_file`, dashboard menampilkan "Tersimpan di PC kantor". Skrip ada di PC (Documents\BUKTI MODIS\_sistem), jalan tiap 30 menit.

## 19 Okt
- Monitor slot: tabel Running Schedule statis dan laporan slot lama dilipat jadi "Arsip" (tidak dihapus), kartu live + plotting jadi pantauan utama.
- PC kantor: skrip arsip foto diuji dengan server tiruan (nama file, kembar, nama kosong, foto hilang, hapus dari server); ditambah skrip cadangan harian `cadangan-data.mjs` (jadwal 02.00, 30 cadangan terakhir).

## 19 Okt 2026 (siang) — Pemantauan, cadangan salinan, uji beban
- Salinan otomatis folder BUKTI MODIS → `C:\MODIS_SALINAN` (jam 03:00; tujuan di `_sistem\tujuan-salinan.txt`, bisa diganti ke disk eksternal).
- PC arsip kirim detak (heartbeat) tiap 30 menit; dashboard menandai LAMBAT (>45 mnt) / MATI (>90 mnt).
- Log galat tablet (`modis_f1_log_error`) + panel "Galat Tablet" di dashboard (owner bisa hapus).
- Uji beban: 200 panggilan serentak 200/200 OK (p95 522 ms); 120 foto @150 KB 120/120 OK (p95 787 ms); data uji sudah dibersihkan.
- SW v39, APP_VER crew-v39.

## 19 Okt 2026 (sore) — Polesan visual
- Hero bergradasi bergerak + orb melayang (dashboard, laporan klien, beranda kru).
- Kartu angka: garis aksen, sorot hijau, terangkat saat disentuh; ikon bergradasi.
- Angka KPI berhitung naik (CountUp); bar progres berkilau.
- Hormati "kurangi gerakan" di perangkat. SW v40.

## 19 Okt 2026 (sore 2) — Mas Adam + desain ulang
- Mas Adam (aset `mas-adam.webp`) tampil di: layar iklan (kanan + balon sapa), beranda & login kru, banner laporan klien, avatar di header dashboard.
- Layar iklan didesain ulang (hero bergerak, judul besar, tombol sentuh menonjol).
- Grafik batang bergradasi + animasi tumbuh; daftar peringkat dengan lencana emas/perak/perunggu.
- Tombol utama bergradasi, tab dashboard aktif bercahaya, tombol "Customer baru" berkilau.
- Perbaikan: .hero-grab tidak lagi menimpa posisi fixed/absolute. SW v42.

## v43 — Revisi web
- "PaHe Right" diganti "PAHE Churn" di aplikasi, laporan klien, dan skrip Google Sheet (kunci DB `pahe_lapsed` tetap). Skrip Sheet perlu ditempel ulang lalu "Sync ulang semua data".
- Kartu stamp memakai desain resmi tim kreatif ("STAMP CARD MODIS", Dapatkan Hadiah!); aturan 2 stamp tetap. Nama pemilik di strip kuning bawah.
- Cek Boros: jumlah rides per hari diketik (dengan tombol − / +), ongkos tetap pilihan; satu layar ringkas, hasil langsung muncul.
- Export XLSX: Ringkasan, Rekap Harian, Per Unit (klien) dan daftar conversion (dashboard); tombol "XLSX contoh (dummy)" untuk showing.
- v45: Order GrabBike Hemat 30 hari diketik manual (chip 0/1/3/5/10/20/30 dihapus; tombol − / + tetap).
- v46: Layar hasil Cek Boros: bagian atas hijau tua Grab polos (tanpa siluet kota), logo Grab di kanan header.
- v47: Banner promo: hanya KV GrabBike Hemat "Amankan Murah Non-Stop · Rp7 ribuan" (KV lain dicabut sesuai arahan tim kreatif).
- v48: Banner promo ditambah KV GrabCar Standard (Standard Electric Car, mulai Rp17 rb); sekarang 2 banner bergantian.
- v49: Banner promo ditambah KV GrabFood Diskon Puas Mantap (s.d. 55%); sekarang 3 banner bergantian.
- v50: Layar hasil Cek Boros: logo 'Hemat Setiap Hari' diganti masthead KV 'Amankan Murah Non-Stop Tiap Harimu'.
- v51: Layar iklan (idle): hanya banner, Mas Adam dan gelembung dihapus; banner dibesarkan menyesuaikan tinggi layar.
- v52: Sinkronisasi data dashboard ↔ laporan klien ↔ Cek Boros lama.
  - Dashboard Field App: tabel per unit/venue/shift kini per ORANG per hari (sama dengan KPI dan laporan klien); Photobooth dihitung per orang.
  - Status Cek Boros dibakukan ("hemat" lama → "Cukup Hemat") di dashboard dan laporan klien, supaya bar dan jumlah status cocok.
  - Tab "Cek Boros (arsip lama)" → "Laporan Cek Boros": kini ikut membaca data lapangan (conversion per orang, reach, contact = jumlah Cek Boros, reward) lewat `src/dashboard/legacyFeed.ts`, digabung dengan data visitor lama bila ada.
  - `dedupePeople` dipindah ke `src/utils/people.ts` (dipakai bersama).
- Skrip Sheet: `MODIS_ExtDailyReport.gs` mengisi tab Daily Report [EXT] (hari sebagai kolom) dari data lapangan; terkunci ke sheet uji sampai dibuka manual untuk H-1/H-2. Menu ditambahkan lewat `MODIS_FieldSync.gs`.
- Skrip Sheet: sheet laporan baru yang tersinkron — `MODIS_Laporan_SatuFile.gs` (FieldSync + tab "Laporan Harian" hari-sebagai-kolom, rumus total/target/kumulatif). Sekali tempel, tanpa menyentuh sheet klien.
- Skrip Sheet (revisi [EXT]): tab Conversion — filter Tipe, nama visitor dirapikan, kolom "+1 draw" & "Catatan" dihapus, "Ada foto" → "Foto" berisi tautan foto bukti di Google Drive (disalin otomatis dari Supabase; folder dibagikan hanya-lihat ke pemegang akses sheet). Arsip foto PC menunggu 20 menit sebelum menghapus dari Supabase. Sync otomatis 5 menit.

## Sheet: tab Dashboard (gaya Looker Studio)
- Baru `MODIS_Dashboard.gs`: tab Dashboard (tab pertama) berisi kartu KPI dan grafik, diperbarui tiap sync.
- Perbaikan: `MODIS_FieldSync.gs` sempat memuat dua salinan fungsi (versi lama menimpa yang baru); salinan lama dihapus.
- Tab "Daily Report" klien di [EXT] tidak lagi ditimpa (data otomatis ke "Data Harian"); hasil Cek Boros ke "Data Cek Boros".

## Data uji 100 conversion (20 Okt)
- `supabase/seed-uji/`: seed-data-uji.sql (100 conversion + Cek Boros, close day, stok, issue, stamp, semua berpenanda [QC] / id `qc_`), foto-uji.ps1 (foto bukti contoh), hapus-data-uji.sql (hapus semuanya sebelum 26 Okt).
- Stok uji lengkap (22 item per unit per hari, opening + refill - pemakaian = closing, satu selisih sengaja >2% untuk contoh penanda): `supabase/seed-uji/stok-uji.sql`.
- Mode uji di Sheet: tanggal data pertama digeser ke 26 Okt pada Laporan Harian dan [EXT] Daily Report (`ujiShift_`).
- Laporan klien: sebelum 26 Okt, "Semua" menampilkan 30 hari terakhir (data dummy ikut tampil).

## 20 Okt 2026 — Dashboard v2, rename PaHe Churned
- Dashboard sheet ditulis ulang (kartu rapi, 6 grafik, angka Date-safe); tab otomatis "Data Harian" agar tab Daily Report klien tidak tertimpa; "CHURN" → "PaHe Churned" (app v53 + sheet).
