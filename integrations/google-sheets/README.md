# Dashboard laporan klien versi aplikasi crew (`MODIS_ClientDashboardV2.gs`) — PAKAI INI

Menggantikan `MODIS_ClientDashboard.gs` (yang membaca data aplikasi mandiri lama dan tidak lagi terisi).
Sumbernya sama dengan halaman laporan klien (`/grab/<kunci>`): hanya angka agregat, tanpa nama / nomor HP / email.
Tidak perlu kata sandi dashboard, cukup link laporan klien.

Isi sheet "Dashboard Grab MODIS": Ringkasan, Rekap harian + grafik vs target 600/hari, Mingguan, Bulanan,
Per kategori POI, Per venue, Cek Boros (status, per unit, per venue), Reward & hadiah per barang.

Pasang: spreadsheet laporan klien → Ekstensi → Apps Script → hapus semua isi lama → tempel isi
`MODIS_ClientDashboardV2.gs` → Simpan → muat ulang spreadsheet → menu **MODIS → Hubungkan** → tempel link laporan klien.
Perbarui otomatis tiap 15 menit. Rincian per venue dan rata-rata ongkos Cek Boros memerlukan migrasi `20261015_fase2l.sql`.

---

# Laporan harian live di Google Sheets

Skrip `MODIS_Sync.gs` menarik data visitor dari Supabase ke Google Sheets setiap 5 menit.
Data utama tetap tersimpan di Supabase. Sheet ini hanya salinan untuk pemantauan.

Hasil di spreadsheet:

| Sheet | Isi |
|---|---|
| `Ringkasan Harian` | Satu baris per hari: total visitor, terverifikasi SPG, hadiah diklaim, rata-rata boros, lokasi, SPG |
| `Rekap SPG` | Per hari × SPG × lokasi × shift |
| `Data YYYY-MM-DD` | Sheet baru otomatis setiap hari (WIB), berisi seluruh visitor hari itu, rapi dengan header, filter, dan baris beku |

Sinkron otomatis memperbarui **hari ini dan kemarin**. Tanggal lain bisa ditarik ulang lewat menu.

## Pemasangan (sekali saja, ±3 menit)

1. Buka spreadsheet → **Ekstensi → Apps Script**.
2. Hapus isi `Code.gs`, tempel seluruh isi `MODIS_Sync.gs`, lalu **Simpan**.
3. Kembali ke spreadsheet dan muat ulang halaman. Menu **MODIS** muncul di toolbar.
4. Klik **MODIS → Hubungkan ke database (sekali)**.
   - Google meminta izin (akses spreadsheet, koneksi ke luar, pemicu waktu). Klik **Izinkan**.
   - Masukkan kata sandi dashboard. Kata sandi disimpan di *Script Properties* milik akun Google Anda, bukan di dalam kode atau sheet.
5. Selesai. Sinkron pertama langsung berjalan, lalu otomatis tiap 5 menit.

## Menu MODIS

- **Sinkron sekarang**: tarik data hari ini dan kemarin saat itu juga.
- **Aktifkan / Matikan sinkron otomatis**: hidupkan atau matikan pemicu 5 menit.
- **Tarik ulang tanggal tertentu…**: isi tanggal `YYYY-MM-DD` untuk membangun ulang sheet hari itu.

## Catatan keamanan

- Sheet berisi data pribadi visitor (nama, WA, email). Bagikan hanya ke orang yang berwenang, sebaiknya dengan akses *Viewer*.
- Jika kata sandi dashboard diganti, jalankan lagi **Hubungkan ke database** dengan kata sandi baru.
- Skrip hanya membaca data dari Supabase. Mengubah isi sheet tidak mengubah data di Supabase, dan sync berikutnya akan menimpa sheet hari itu dengan data asli.

---

# Dashboard laporan klien (`MODIS_ClientDashboard.gs`)

Untuk spreadsheet **laporan klien** (terpisah dari spreadsheet internal). Skrip ini hanya membuat satu sheet,
**Dashboard Cek Boros**, berisi subtotal dan grafik dengan gaya tab *Dashboard Harian* di Master Timeline:

- Info campaign, tanggal laporan, hari ke-, waktu berjalan
- Ringkasan: visitor, hadiah, stamp, rata-rata & total potensi hemat, lokasi aktif (hari ini, kemarin, s/d hari ini)
- Laporan per unit · jam jaga di tanggal laporan, dengan total
- Rekap mingguan (Wk 1–14) dan bulanan
- Performa per unit & kategori POI
- Status boros visitor dan hadiah yang keluar
- Grafik: visitor harian & kumulatif, status boros, visitor per unit/kategori
- Rekap harian 98 hari (sumber grafik)

**Tanpa data pribadi.** Skrip mengambil ringkasan lewat fungsi database `modis_report_agg`, bukan baris visitor.
Nama, WA, dan email tidak pernah masuk ke spreadsheet klien.

## Pemasangan

1. Buka spreadsheet laporan klien → **Ekstensi → Apps Script**, tempel isi `MODIS_ClientDashboard.gs`, simpan.
2. Pilih `onOpen` → **Run**, beri izin (Select all → Allow).
3. Muat ulang spreadsheet → **MODIS → Hubungkan ke database (sekali)** → masukkan kata sandi dashboard.
4. Periode default: mulai **26 Okt 2026**, **98 hari**. Untuk uji coba sebelum running, pakai
   **MODIS → Atur periode campaign…** (mis. mulai 2026-10-08), lalu kembalikan ke 2026-10-26 saat running.

Dashboard diperbarui otomatis tiap 15 menit.

**Bagikan ke klien dengan akses _Viewer_.** Editor spreadsheet bisa membuka Apps Script dan melihat
kata sandi yang tersimpan, jadi jangan beri akses edit ke pihak luar.

## MODIS Field App → Google Sheet (fase 1)

File: `MODIS_FieldSync.gs`. Untuk spreadsheet milik akun Milli (mirror data Field App, sumber yang sama dengan backup Google Form).

1. Buka spreadsheet → **Extensions → Apps Script** → buat file baru, tempel isi `MODIS_FieldSync.gs`, Save.
2. Muat ulang spreadsheet → menu **MODIS Field → Hubungkan** → isi kata sandi dashboard.
3. **MODIS Field → Aktifkan sync otomatis (10 menit)**. Izinkan akses saat diminta (pemilik akun yang menyetujui).

Lembar yang dibuat: **Conversion** (satu baris per conversion, HP hanya 4 digit akhir), **Data Harian** (dulu "Daily Report"; per hari per unit: reach, contacts, PaHe New, PaHe Churned, GB Hemat, total vs target 220, reward per tier, photobooth, double claim, item stok selisih), **Stok** (opening, refill, pakai, closing, selisih, tanda >2%), **Issue** (laporan kendala dari crew). Data input susulan TL ditandai di kolom Catatan. Format Daily Report akan disamakan dengan tab Daily Report di [EXT] tracker begitu filenya tersedia.


## Google Form cadangan (fallback)

File: `MODIS_FallbackForm.gs`. Dipasang di spreadsheet yang sama (akun Milli).

1. **Extensions → Apps Script** → file baru, tempel `MODIS_FallbackForm.gs`, Save.
2. Pilih fungsi `createFallbackForm` → **Run** → izinkan akses.
3. Buka link edit di tab **Info Form**, tambahkan pertanyaan **Unggah file** bernama "Foto bukti".
4. Kirim link isi form ke HP setiap unit. Jawaban masuk ke tab baru di spreadsheet.
5. Malam hari TL memasukkan ulang lewat aplikasi: **Menu Team Leader → Input susulan** (tanggal, jam, SPG, venue asli; foto boleh tetap di Google Form).


## Daily Report [EXT] (tabel hari sebagai kolom) — `MODIS_ExtDailyReport.gs`

Mengisi sel biru di tab **Daily Report** milik **[EXT] GRAB MODIS - Project Tracker** dari data lapangan (tab Daily Report [INT], per orang per hari).
Baris TOTAL, target, dan kumulatif di [EXT] adalah rumus dan tidak disentuh.

1. Di spreadsheet [INT]: Apps Script > tambah file > tempel `MODIS_ExtDailyReport.gs`; tempel ulang `MODIS_FieldSync.gs` (menu "MODIS → [EXT]" muncul setelah dibuka ulang).
2. Uji dulu: buat salinan [EXT] (File > Make a copy) → menu **Atur sheet tujuan** (tempel link salinan) → **Isi data dummy ke sheet uji** → **Kirim Daily Report ke tujuan**.
3. H-1 / H-2: hapus data uji dan akun [QC], jalankan **Sync ulang semua data**, lalu **Buka kunci [EXT] asli** → **Aktifkan kirim otomatis (30 menit)**.

Pengaman: bawaan hanya menulis ke sheet uji; hanya tanggal yang punya kolom di [EXT] (mulai 26 Okt 2026) yang diisi, jadi data uji 16–19 Okt otomatis terlewat.


## Sheet laporan baru yang tersinkron (disarankan) — `MODIS_Laporan_SatuFile.gs`

Spreadsheet baru khusus laporan (terpisah dari sheet klien). Satu file skrip, sekali tempel:
1. Buat spreadsheet baru (mis. "MODIS - Laporan Sinkron"). Extensions > Apps Script > hapus isi bawaan > tempel seluruh `MODIS_Laporan_SatuFile.gs` > Save.
2. Muat ulang sheet, menu **MODIS Field** > **Hubungkan** (kata sandi dashboard) > **Sync ulang semua data** > **Aktifkan sync otomatis (10 menit)**.
3. Tab yang terisi otomatis: **Laporan Harian** (hari sebagai kolom, rumus total/target/kumulatif), **Data Harian** (dulu "Daily Report"; per hari per unit), **Conversion**, **Stok**, **Issue**.
4. Uji dengan data uji dulu; jangan sambungkan ke Sheet klien sebelum H-1/H-2 (lihat bagian [EXT] di atas bila perlu mengisi sheet klien).

## Tab Conversion: perubahan v2 (revisi [EXT])
- Kolom: Waktu, Tanggal, Unit, Shift, SPG, Venue, Kategori, Nama, HP (4 digit akhir), Tipe, Reward, Photobooth, Status, **Foto**, ID. Kolom "+1 draw", "Catatan", dan "Ada foto" dihapus.
- **Tipe** (dan semua kolom) punya filter di baris judul; filter dibuat sekali dan tidak direset tiap sync.
- **Nama** dirapikan (huruf awal kapital): "NANDA" → "Nanda"; "QC", "TL", dan "[QC]" dibiarkan.
- **Foto**: tautan "Lihat foto" ke folder Google Drive "… - Foto Bukti" (dibuat otomatis, dibagikan hanya-lihat ke orang yang punya akses ke spreadsheet ini). Status lain: "Menunggu" (belum disalin), "Arsip PC" (hanya di PC kantor), "Belum" (tanpa foto).
- Pertama kali dijalankan setelah tempel ulang, Google meminta izin tambahan (Drive). Tab Conversion otomatis ditulis ulang dengan susunan baru.
- Skrip arsip foto di PC menunggu 20 menit sebelum mengarsipkan/menghapus foto dari Supabase, supaya sempat disalin ke Drive. Sync otomatis kini tiap 5 menit.

## Dashboard (tab pertama, gaya Looker Studio)

`MODIS_Dashboard.gs` membuat tab **Dashboard** sebagai tab pertama: 8 kartu KPI (total conversion vs target kumulatif, conversion hari ini, reach, contacts, PaHe New, PaHe Churned, GB Hemat ride, kartu stamp lengkap) dan 5 grafik (conversion per hari vs target 600, komposisi tipe, per unit, top 10 venue, sebaran status Cek Boros) plus ringkasan Cek Boros. Data lengkap tetap di tab lain (Laporan Harian, Conversion, Stok, Issue, Data Cek Boros) dan ada tautan ke tiap tab di bagian bawah.

- Terisi otomatis tiap sync. Tab bantu `_Dash` (tersembunyi) jangan dihapus.
- Menu **MODIS Dashboard**: Perbarui sekarang, Mode uji (hitung sejak data pertama, untuk melihat tampilan dengan data uji), Mode resmi (mulai 26 Okt), Bangun ulang tampilan.
- Tab "Daily Report" milik klien di [EXT] tidak ditimpa: data harian otomatis ditulis ke tab **Data Harian**. Hasil Cek Boros ditulis ke **Data Cek Boros**.
- Pemasangan: untuk spreadsheet baru cukup tempel `MODIS_Laporan_SatuFile.gs`. Untuk [EXT] yang sudah punya FieldSync: tempel `MODIS_FieldSync.gs` baru dan tambahkan file `MODIS_Dashboard.gs` (file baru di Apps Script).

### Dashboard v2 & aturan tab (20 Okt)
- Tab otomatis dari app bernama **Data Harian** (bukan "Daily Report"). Tab **Daily Report** milik klien (matriks dengan baris `Date`) tidak pernah ditimpa script; kalau terlanjur tertimpa, pulihkan lewat File > Version history.
- Dashboard v2: 16 kartu dengan keterangan bahasa Indonesia, 6 grafik sejajar, kartu stok/reward/konsumsi. Angka memakai format eksplisit (tidak lagi tampil -6.627.311).
- Mode uji menggeser tanggal data dummy ke 26 Okt dst di Dashboard, Laporan Harian dan matriks [EXT].
- Istilah "CHURN" diganti **PaHe Churned** di app dan sheet.
- "Sheet uji" hanya untuk SALINAN [EXT] (File > Make a copy). Menulis langsung ke [EXT] asli: menu "Buka kunci [EXT] asli".
