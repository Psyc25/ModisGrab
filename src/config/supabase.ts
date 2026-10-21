/**
 * Koneksi Supabase project MODIS Cek Boros.
 *
 * Nilai diambil dari environment (.env.local / Secrets AI Studio):
 *   VITE_SUPABASE_URL=https://lucjgeoaugcsxolgdsfe.supabase.co
 *   VITE_SUPABASE_ANON_KEY=sb_publishable_... (opsional, sudah ada nilai bawaan di bawah)
 *
 * Anon/publishable key memang dirancang untuk dipakai di aplikasi publik.
 * Keamanan data dijaga oleh Row Level Security di supabase/schema.sql.
 * JANGAN pernah memasukkan service_role key ke aplikasi ini.
 */
const env = (import.meta as any).env || {};

export const SUPABASE_URL: string =
  env.VITE_SUPABASE_URL || 'https://lucjgeoaugcsxolgdsfe.supabase.co';

/** Publishable key project modis-cek-boros (aman dipakai di browser karena RLS aktif). */
export const SUPABASE_ANON_KEY: string =
  env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_cDE6vKDTsVo7XCWRKU9_0g_y1vvCYcR';

/**
 * Akun dashboard bersama. Pengguna cukup mengetik kata sandi; email ini dipakai di balik layar
 * dan kata sandinya dicek oleh Supabase Auth di server (tidak pernah disimpan di kode aplikasi).
 * Akun ini dibuat di Supabase > Authentication > Users dan terdaftar di tabel modis_admins.
 */
export const DASHBOARD_EMAIL: string = env.VITE_DASHBOARD_EMAIL || 'dashboard@modis-cekboros.app';

export const VISITORS_TABLE = 'modis_visitors';
export const MERCH_TABLE = 'modis_merch';
