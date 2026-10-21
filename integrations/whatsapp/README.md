# Kirim hasil Cek Boros ke WhatsApp visitor (otomatis)

Alur:

1. SPG menekan **Selesai, visitor berikutnya** → data visitor masuk ke Supabase.
2. Database otomatis menyusun pesan dan memasukkannya ke antrean `modis_wa_outbox`
   (hanya visitor 18+ yang setuju dan mengisi nomor WhatsApp).
3. Workflow n8n `MODIS_WA_Sender.n8n.json` mengambil antrean tiap 1 menit dan mengirim
   lewat GOWA, satu per satu dengan jeda 4 detik. Status tercatat: `sent`, atau dicoba
   ulang sampai 5 kali lalu `failed`.

Karena n8n yang *mengambil* antrean (bukan Supabase yang memanggil n8n), n8n di jaringan
kantor (mis. 192.168.1.20) tetap bisa dipakai tanpa dibuka ke internet.

## Contoh pesan

```
Halo Rina,

Terima kasih sudah mampir ke Grab MODIS di Halte TransJakarta Pluit.

*Hasil Cek Boros kamu*
Status: Boros
Perkiraan ongkos GrabBike: Rp462.000 per bulan
Potensi hemat dengan PAHE: Rp208.000 per bulan
Kartu stamp: 2 dari 6

Aktifkan PAHE (Paket Hemat GrabBike) di aplikasi Grab, tarif tetap mulai Rp7 ribuan. Syarat dan ketentuan mengikuti aplikasi Grab.

Sampai jumpa lagi di Pit-Stop MODIS berikutnya untuk menambah stamp kamu.
```

Teks diatur di fungsi `public.modis_wa_message` (migrasi `20261009_wa_outbox_stamp.sql`).

## Pemasangan (dilakukan tim, sekali saja)

1. **Nomor pengirim**: sebaiknya nomor WhatsApp khusus MODIS (bukan nomor MagnaRent),
   login di GOWA lewat scan QR.
2. Di n8n: **Import from file** → `MODIS_WA_Sender.n8n.json`.
3. Buat credential **Supabase API**:
   - Host: `https://lucjgeoaugcsxolgdsfe.supabase.co`
   - Service Role Secret: ambil sendiri di Supabase → Project Settings → API Keys
     (kunci `service_role` / secret). **Jangan dibagikan atau ditaruh di aplikasi.**
   Pilih credential ini di node *Ambil antrean*, *Tandai terkirim*, *Tandai gagal*.
4. Node **Pengaturan**: isi `gowa_url` dengan alamat GOWA (mis. `http://192.168.1.20:3000`).
   Bila GOWA memakai basic auth, tambahkan di node *Kirim WhatsApp (GOWA)* → Authentication.
5. Aktifkan workflow.

## Cek status

Dashboard internal belum menampilkan antrean. Cek di Supabase SQL editor:

```sql
select status, count(*) from public.modis_wa_outbox group by 1;
select * from public.modis_wa_outbox where status <> 'sent' order by created_at desc limit 20;
```

Catatan: data uji yang dimasukkan setelah migrasi ini juga ikut masuk antrean. Pakai nomor
milik tim saat uji coba, atau hapus lewat **Bersihkan data uji** sebelum workflow diaktifkan.
