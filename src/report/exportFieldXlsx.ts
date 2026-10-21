/**
 * Export XLSX untuk rekap lapangan Grab MODIS.
 * Library `xlsx` dimuat dinamis (hanya saat tombol ditekan) agar bundel awal tidak membengkak.
 */
export type DailyRow = {
  date: string; // YYYY-MM-DD
  unit: string; // label unit
  paheNew: number;
  paheChurn: number;
  gbHemat: number;
  stamps: number;
  boros: number;
  savings: number;
  reach: number;
  contacts: number;
};

export const DAILY_TARGET_XLSX = 600;

type Cell = string | number;

function sheetOf(XLSX: any, rows: Cell[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

export async function downloadFieldXlsx(rows: DailyRow[], opts: { from: string; to: string; dummy?: boolean }) {
  const XLSX: any = await import('xlsx');
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.unit.localeCompare(b.unit));
  const conv = (r: DailyRow) => r.paheNew + r.paheChurn + r.gbHemat;
  const sum = (f: (r: DailyRow) => number) => sorted.reduce((s, r) => s + f(r), 0);
  const days = new Set(sorted.map((r) => r.date)).size;
  const totalConv = sum(conv);
  const target = DAILY_TARGET_XLSX * days;

  // 1. Ringkasan
  const summary: Cell[][] = [
    ['Grab MODIS · Rekap Lapangan'],
    [opts.dummy ? 'DATA CONTOH (dummy) — hanya untuk showing' : 'Data terverifikasi SPG'],
    ['Periode', `${opts.from} s/d ${opts.to}`],
    [],
    ['Indikator', 'Nilai'],
    ['Total conversion', totalConv],
    ['  PaHe New', sum((r) => r.paheNew)],
    ['  PaHe Churned', sum((r) => r.paheChurn)],
    ['  GB Hemat ride', sum((r) => r.gbHemat)],
    ['Kartu stamp lengkap', sum((r) => r.stamps)],
    ['Cek Boros dilakukan', sum((r) => r.boros)],
    ['Potensi hemat (Rp)', sum((r) => r.savings)],
    ['Reach', sum((r) => r.reach)],
    ['Contacts', sum((r) => r.contacts)],
    [],
    ['Hari aktif', days],
    ['Target (600/hari)', target],
    ['Pencapaian', target ? `${Math.round((totalConv / target) * 100)}%` : '-'],
  ];

  // 2. Rekap harian
  const head = ['Tanggal', 'Unit', 'PaHe New', 'PaHe Churned', 'GB Hemat', 'Total conversion', 'Kartu stamp lengkap', 'Cek Boros', 'Potensi hemat (Rp)', 'Reach', 'Contacts'];
  const daily: Cell[][] = [head, ...sorted.map((r) => [r.date, r.unit, r.paheNew, r.paheChurn, r.gbHemat, conv(r), r.stamps, r.boros, r.savings, r.reach, r.contacts])];
  daily.push(['TOTAL', '', sum((r) => r.paheNew), sum((r) => r.paheChurn), sum((r) => r.gbHemat), totalConv, sum((r) => r.stamps), sum((r) => r.boros), sum((r) => r.savings), sum((r) => r.reach), sum((r) => r.contacts)]);

  // 3. Per unit
  const units = Array.from(new Set(sorted.map((r) => r.unit)));
  const perUnit: Cell[][] = [['Unit', 'PaHe New', 'PaHe Churned', 'GB Hemat', 'Total conversion', 'Kartu stamp lengkap', 'Cek Boros']];
  units.forEach((u) => {
    const rs = sorted.filter((r) => r.unit === u);
    const s = (f: (r: DailyRow) => number) => rs.reduce((a, r) => a + f(r), 0);
    perUnit.push([u, s((r) => r.paheNew), s((r) => r.paheChurn), s((r) => r.gbHemat), s(conv), s((r) => r.stamps), s((r) => r.boros)]);
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetOf(XLSX, summary, [26, 24]), 'Ringkasan');
  XLSX.utils.book_append_sheet(wb, sheetOf(XLSX, daily, [12, 18, 11, 12, 11, 16, 20, 11, 18, 9, 10]), 'Rekap Harian');
  XLSX.utils.book_append_sheet(wb, sheetOf(XLSX, perUnit, [18, 11, 12, 11, 16, 20, 11]), 'Per Unit');
  XLSX.writeFile(wb, `grab-modis_rekap${opts.dummy ? '_CONTOH' : ''}_${opts.from}_${opts.to}.xlsx`);
}

/** Data contoh 14 hari × 3 unit untuk demo (angka deterministik, bukan acak). */
export function dummyDailyRows(startDay = '2026-10-26', n = 14): DailyRow[] {
  const units = ['Mobil Diskon', 'Kiosk Diskon 1', 'Kiosk Diskon 2'];
  const out: DailyRow[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.parse(`${startDay}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    units.forEach((unit, u) => {
      const base = 120 + ((i * 37 + u * 53) % 90); // 120–209 per unit
      const paheNew = Math.round(base * 0.45);
      const paheChurn = Math.round(base * 0.2);
      const gbHemat = base - paheNew - paheChurn;
      out.push({
        date: d,
        unit,
        paheNew,
        paheChurn,
        gbHemat,
        stamps: Math.round(base * 0.3),
        boros: Math.round(base * 0.6),
        savings: Math.round(base * 0.6) * 95000,
        reach: base * 6,
        contacts: base * 2,
      });
    });
  }
  return out;
}
