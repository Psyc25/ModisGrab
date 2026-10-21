/**
 * Aplikasi Cek Boros dipegang SPG di tablet booth, jadi alat petugas selalu aktif.
 * Akses tetap dijaga: Panel SPG butuh PIN SPG, dashboard internal butuh PIN admin,
 * dan data peserta dilindungi login Supabase + Row Level Security.
 */
export const IS_STAFF_MODE = true;
