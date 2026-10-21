/**
 * Pengaturan kampanye MODIS Cek Boros.
 * Semua angka bisnis ada di sini supaya mudah diganti
 * ketika angka resmi dari Grab sudah dikonfirmasi.
 */

/**
 * PAHE (Paket Hemat) Jabodetabek, sesuai S&K di aplikasi Grab (dicek 14 Okt 2026):
 * - Voucher "Rp1.500 off" untuk perjalanan GrabBike Hemat seharga <= Rp9.000, maks. 99x
 * - Voucher "Rp1.000 off" untuk perjalanan GrabBike Hemat seharga > Rp9.000, maks. 99x
 * - Paket berlaku 1 bulan, sisa voucher hangus (tidak terbawa ke bulan berikutnya)
 * - Biaya langganan Rp7.000/bulan, bulan pertama gratis (sekali per member baru), perpanjang otomatis
 */
export const PAHE_PRICE_THRESHOLD = 9000;
export const PAHE_DISCOUNT_LOW = 1500; // ongkos <= Rp9.000
export const PAHE_DISCOUNT_HIGH = 1000; // ongkos > Rp9.000
export const PAHE_MAX_TRIPS = 99;
export const PAHE_SUBSCRIPTION_FEE = 7000;
export const paheDiscountFor = (fare: number) => (fare <= 0 ? 0 : fare <= PAHE_PRICE_THRESHOLD ? PAHE_DISCOUNT_LOW : PAHE_DISCOUNT_HIGH);

/** Jumlah hari perjalanan rutin dalam sebulan (hari kerja). */
export const COMMUTE_DAYS_PER_MONTH = 22;

/** Ambang status boros, berdasarkan perkiraan ongkos GrabBike per bulan tanpa PAHE (Rp). */
export const BOROS_THRESHOLDS = {
  sangatBoros: 1500000,
  boros: 750000,
  lumayanBoros: 300000,
};

/** Versi teks persetujuan yang disimpan bersama data peserta. */
export const CONSENT_VERSION = 'modis-2026-10-v1';

/** Jumlah stamp penuh di Kartu Sobat Hemat. */
export const MAX_STAMPS = 6;

/** Detik tanpa sentuhan sebelum layar kiosk kembali ke awal. */
export const KIOSK_IDLE_SECONDS = 90;

/** Label teks yang tampil ke visitor (hindari klaim "resmi" sebelum dikonfirmasi Grab). */
export const ESTIMATE_DISCLAIMER =
  'Estimasi berdasarkan jawabanmu. PAHE Jabodetabek: potongan Rp1.500 (ongkos s.d. Rp9.000) atau Rp1.000 (di atas Rp9.000) per perjalanan GrabBike Hemat, maks. 99x per bulan. Langganan Rp7.000/bulan, bulan pertama gratis. S&K mengikuti aplikasi Grab.';
