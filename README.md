# MODIS – Cek Boros (Grab PAHE)

Aplikasi aktivasi booth Grab Jabo MODIS: visitor mengecek ongkos harian, melihat estimasi hemat dengan PAHE,
lalu klaim stamp dan gacha hadiah di booth. Data peserta tersimpan di Supabase.

**Live:** https://modis-cek-boros.vercel.app (visitor) · https://modis-cek-boros.vercel.app/?staff=1 (tablet SPG) · https://modis-cek-boros.vercel.app/dashboard (owner & klien)

Deploy otomatis lewat Vercel setiap ada push ke branch `main`.

## 1. Siapkan database (sekali saja)

> Status 8 Okt 2026: skema sudah terpasang dan diuji di project `lucjgeoaugcsxolgdsfe`. Tinggal langkah 3–5.

1. Buka project Supabase `lucjgeoaugcsxolgdsfe` → **SQL Editor**.
2. Tempel seluruh isi `supabase/schema.sql`, lalu **Run**. Aman dijalankan ulang.
3. Buat akun admin: **Authentication → Users → Add user** (email + password).
4. Daftarkan akun itu sebagai admin MODIS (ganti emailnya):
   ```sql
   insert into public.modis_admins (user_id, label)
   select id, 'Owner' from auth.users where email = 'EMAIL_ADMIN@contoh.com'
   on conflict do nothing;
   ```
5. Disarankan: matikan pendaftaran pengguna baru di pengaturan **Authentication** (opsi "Allow new users to sign up"), supaya tidak ada yang bisa membuat akun sendiri.

## 2. Isi kunci aplikasi

Kunci publik project sudah terpasang sebagai nilai bawaan di `src/config/supabase.ts`,
jadi langkah ini opsional. Untuk mengganti project, salin `.env.example` menjadi `.env.local`, lalu isi:

```
VITE_SUPABASE_URL="https://lucjgeoaugcsxolgdsfe.supabase.co"
VITE_SUPABASE_ANON_KEY="sb_publishable_..."
```

Ambil key di **Project Settings → API**. Gunakan **anon/publishable** key, **jangan service_role**.
Di AI Studio, isi keduanya lewat panel Secrets.

## 3. Jalankan

```bash
npm install
npm run dev      # pengembangan, port 3000
npm run build    # hasil produksi di folder dist/
```

## 4. Pemakaian di lapangan

| Siapa | Alamat | Yang bisa dilakukan |
|---|---|---|
| Visitor | `/` | Alur Cek Boros: data diri, kebiasaan, hasil, klaim di booth |
| SPG (tablet booth) | `/?staff=1` (sekali per tablet, tersimpan) | Mulai tugas jaga, input visitor, beri stamp & gacha dengan PIN, lihat daftar visitor tablet itu |
| Owner / klien | `/dashboard` (login) | Rekap harian per SPG/lokasi/shift, daftar visitor lengkap, unduh Excel/CSV, grafik, stok hadiah |

**SPG:** setiap hari tablet meminta "Mulai tugas jaga" (nama SPG, shift, jam jaga, lokasi, unit). Data ini ikut
tercatat di setiap visitor. Panel SPG (tombol lokasi di pojok kanan atas) berisi daftar visitor, edit tugas jaga,
akhiri tugas / ganti SPG, dan PIN SPG. SPG tidak punya akun dashboard.

**Owner / klien:** buat akun di Supabase **Authentication → Users → Add user**, lalu daftarkan perannya:

```sql
-- owner: lihat, unduh, hapus data, kelola stok
insert into public.modis_admins (user_id, label, role)
select id, 'Owner Magna', 'owner' from auth.users where email = 'OWNER@contoh.com'
on conflict (user_id) do update set role = excluded.role, label = excluded.label;

-- client: lihat & unduh saja
insert into public.modis_admins (user_id, label, role)
select id, 'Klien Grab', 'client' from auth.users where email = 'KLIEN@contoh.com'
on conflict (user_id) do update set role = excluded.role, label = excluded.label;
```

## 5. Pengaturan kampanye

Semua angka bisnis ada di `src/config/campaign.ts`:
tarif PAHE, hari kerja per bulan, asumsi hemat GrabFood per pesanan, ambang status boros,
jumlah stamp, dan waktu reset layar. Ganti di sana saat angka resmi Grab sudah ada.

Teks kebijakan privasi ada di `src/components/PrivacyModal.tsx` (bagian dalam kurung siku wajib diisi).
