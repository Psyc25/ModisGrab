/**
 * Status Cek Boros baku. Data lama / build lama kadang menyimpan "hemat" atau huruf kecil;
 * semua layar (crew, dashboard, laporan klien) memakai label baku ini supaya angkanya sama.
 */
export const BOROS_STATUSES = ['Sangat Boros', 'Boros', 'Lumayan Boros', 'Cukup Hemat'] as const;

export function normBorosStatus(s: string | null | undefined): string {
  const k = String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!k || k === '-') return '-';
  if (k === 'sangat boros') return 'Sangat Boros';
  if (k === 'boros') return 'Boros';
  if (k === 'lumayan boros') return 'Lumayan Boros';
  if (k === 'cukup hemat' || k === 'hemat') return 'Cukup Hemat';
  return String(s).trim();
}
