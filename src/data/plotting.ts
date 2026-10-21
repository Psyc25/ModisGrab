/**
 * Plotting harian dari tab "Plotting" di [INT] Internal Tracker (sumber utama venue).
 * Snapshot ini dipakai bila tablet belum pernah menerima versi terbaru dari server
 * (office kirim ulang lewat menu Google Sheet "MODIS Field > Kirim Plotting ke aplikasi").
 * Format per tanggal: [shift Mobil, Mobil venue 1, Mobil venue 2, shift Kiosk 1, venue Kiosk 1, shift Kiosk 2, venue Kiosk 2]
 */
import { isSchoolVenue } from './schedule';

export type PlottingRaw = Record<string, string[]>;

export const PLOTTING_SNAPSHOT: PlottingRaw = {
"2026-10-26": [
"AM 07.00-16.00",
"Terminal Muara Angke, 07.00-10.30",
"Perkantoran Pluit Raya, 11.30-15.30",
"PM 12.00-21.00",
"Taman Waduk Pluit, day 1/2",
"AM 07.00-16.00",
"Univ. Bunda Mulia Ancol, day 1/2"
],
"2026-10-27": [
"AM 07.00-16.00",
"St. Ancol, 07.00-10.30 | via Grab",
"Kawasan kuliner Muara Karang, 11.30-15.30",
"PM 12.00-21.00",
"Taman Waduk Pluit, day 2/2",
"AM 07.00-16.00",
"Univ. Bunda Mulia Ancol, day 2/2"
],
"2026-10-28": [
"AM 07.00-16.00",
"Terminal Bus Tanjung Priok, 07.00-10.30",
"Perkantoran Sunter (Astra / Toyota), 11.30-15.30",
"AM 07.00-16.00",
"UNTAG Jakarta Sunter, day 1/2",
"AM 07.00-16.00",
"Kwik Kian Gie Sunter, day 1/2"
],
"2026-10-29": [
"PM 12.00-21.00",
"Perkantoran Jl. Yos Sudarso Sunter, 12.00-15.30",
"LRT Pegangsaan Dua, 16.30-20.30 | via Grab",
"AM 07.00-16.00",
"UNTAG Jakarta Sunter, day 2/2",
"AM 07.00-16.00",
"Kwik Kian Gie Sunter, day 2/2"
],
"2026-10-30": [
"AM 07.00-16.00",
"LRT Boulevard Selatan Kelapa Gading, 07.00-10.30 | via Grab",
"Sunter Mall, 12.00-16.00",
"PM 12.00-21.00",
"Ancol, day 1/2 | Partner Grab",
"PM 12.00-21.00",
"MOI outdoor area, day 1/2"
],
"2026-10-31": [
"PM 12.00-21.00",
"Kawasan kuliner Boulevard Kelapa Gading, 17.00-20.30",
"LRT Jabodebek Taman Mini, 12.30-16.00 | via Grab | DRAFT",
"PM 12.00-21.00",
"Ancol, day 2/2 | Partner Grab",
"PM 12.00-21.00",
"MOI outdoor area, day 2/2"
],
"2026-11-01": [
"PM 12.00-21.00",
"Kawasan Kuliner Kalimalang, 17.00-20.30 | DRAFT",
"St. Jatinegara, 07.00-10.30 | via Grab | DRAFT",
"PM 12.00-21.00",
"TMII, day 1/2 | Partner Grab | DRAFT",
"PM 12.00-21.00",
"AEON Mall JGC outdoor, day 1/2 | DRAFT"
],
"2026-11-02": [
"AM 07.00-16.00",
"Perkantoran MT Haryono Cawang, 11.30-15.30 | DRAFT",
"LRT Jabodebek Cawang, 07.00-10.30 | via Grab | DRAFT",
"PM 12.00-21.00",
"TMII, day 2/2 | Partner Grab | DRAFT",
"AM 07.00-16.00",
"UNJ Rawamangun, day 1/2 | DRAFT"
],
"2026-11-03": [
"AM 07.00-16.00",
"Perkantoran Jl. Pemuda Rawamangun, 11.30-15.30 | DRAFT",
"Terminal Pulogadung, 07.00-10.30 | DRAFT",
"AM 07.00-16.00",
"UKI Cawang, day 1/2 | DRAFT",
"AM 07.00-16.00",
"UNJ Rawamangun, day 2/2 | DRAFT"
],
"2026-11-04": [
"AM 07.00-16.00",
"St. Klender, 07.00-10.30 | via Grab | DRAFT",
"Kuliner Rawamangun Balai Pustaka, 11.30-15.30 | DRAFT",
"AM 07.00-16.00",
"UKI Cawang, day 2/2 | DRAFT",
"AM 07.00-16.00",
"Kalbis Institute Pulomas, day 1/2 | DRAFT"
],
"2026-11-05": [
"AM 07.00-16.00",
"St. Buaran, 07.00-10.30 | via Grab | DRAFT",
"Kawasan Industri Pulogadung JIEP, 11.30-15.30 | DRAFT",
"AM 07.00-16.00",
"Univ. Borobudur Kalimalang, day 1/2 | DRAFT",
"AM 07.00-16.00",
"Kalbis Institute Pulomas, day 2/2 | DRAFT"
],
"2026-11-06": [
"AM 07.00-16.00",
"Kuliner Jl. Sabang, 12.30-16.00 | DRAFT",
"Kuliner Pecenongan, 17.00-20.30 | DRAFT",
"AM 07.00-16.00",
"Univ. Borobudur Kalimalang, day 2/2 | DRAFT",
"AM 07.00-16.00",
"Univ. Darma Persada, 1 day | DRAFT"
],
"2026-11-07": [
"PM 12.00-21.00",
"Bundaran HI Car Free Day, 06.00-10.00 (shift 06.00-15.00) | DRAFT",
"Area Monas, 11.00-14.30 | DRAFT",
"PM 12.00-21.00",
"Sarinah Thamrin, day 1/2 | Partner Grab | DRAFT",
"PM 12.00-21.00",
"Kawasan Pasar Baru, day 1/2 | DRAFT"
],
"2026-11-08": [
"AM 07.00-16.00",
"St. Sudirman, 07.00-10.30 | via Grab | DRAFT",
"Perkantoran MH Thamrin, 11.30-15.30 | DRAFT",
"PM 12.00-21.00",
"Sarinah Thamrin, day 2/2 | Partner Grab | DRAFT",
"PM 12.00-21.00",
"Kawasan Pasar Baru, day 2/2 | DRAFT"
],
"2026-11-09": [
"AM 07.00-16.00",
"St. Tanah Abang, 07.00-10.30 | via Grab | DRAFT",
"Perkantoran Sudirman Karet Benhil, 11.30-15.30 | DRAFT",
"AM 07.00-16.00",
"UI Salemba, day 1/2 | DRAFT",
"AM 07.00-16.00",
"Univ. YARSI, day 1/2 | DRAFT"
],
"2026-11-10": [
"AM 07.00-16.00",
"Perkantoran Kebon Sirih, 12.00-15.30 | DRAFT",
"Kuliner Jl. Kendal Dukuh Atas, 17.00-20.30 | DRAFT",
"AM 07.00-16.00",
"UI Salemba, day 2/2 | DRAFT",
"AM 07.00-16.00",
"Univ. YARSI, day 2/2 | DRAFT"
],
"2026-11-11": [
"PM 12.00-21.00",
"St. Gondangdia, 07.00-10.30 | via Grab | DRAFT",
"St. Juanda, 07.00-10.30 | via Grab | DRAFT",
"AM 07.00-16.00",
"UMJ Cempaka Putih, day 1/2 | DRAFT",
"AM 07.00-16.00",
"Kantor Walikota Jakpus, day 1/2 | DRAFT"
],
"2026-11-12": [
"AM 07.00-16.00",
"Perkantoran Kramat Raya Salemba, 11.30-15.30 | DRAFT",
"Kuliner Tanjung Duren, 12.30-16.00 | DRAFT",
"AM 07.00-16.00",
"UMJ Cempaka Putih, day 2/2 | DRAFT",
"AM 07.00-16.00",
"Kantor Walikota Jakpus, day 2/2 | DRAFT"
],
"2026-11-13": [
"AM 07.00-16.00",
"Pancoran Glodok Petak Enam, 17.00-20.30 | DRAFT",
"Pasar Pagi Asemka, 06.00-09.30 (shift 06.00-15.00) | DRAFT",
"AM 07.00-16.00",
"Univ. BSI Kramat, 1 day | DRAFT",
"AM 07.00-16.00",
"IKJ TIM Cikini, 1 day | DRAFT"
],
"2026-11-14": [
"PM 12.00-21.00",
"Taman Cattleya, 11.00-14.30 | DRAFT",
"St. Grogol, 07.00-10.30 | via Grab | DRAFT",
"PM 12.00-21.00",
"Kota Tua, day 1/2 | DRAFT",
"PM 12.00-21.00",
"Central Park outdoor, day 1/2 | DRAFT"
],
"2026-11-15": [
"AM 07.00-16.00",
"Perkantoran Tomang S. Parman, 11.30-15.30 | DRAFT",
"St. Duri, 07.00-10.30 | via Grab | DRAFT",
"PM 12.00-21.00",
"Kota Tua, day 2/2 | DRAFT",
"PM 12.00-21.00",
"Central Park outdoor, day 2/2 | DRAFT"
],
"2026-11-16": [
"AM 07.00-16.00",
"Kawasan Slipi Wisma 77, 11.30-15.30 | DRAFT",
"Halte TJ Grogol Reformasi, 07.00-10.30 | via Grab | DRAFT",
"AM 07.00-16.00",
"Univ. Trisakti Grogol, day 1/2 | DRAFT",
"AM 07.00-16.00",
"UNTAR Kampus I, day 1/2 | DRAFT"
],
"2026-11-17": [
"AM 07.00-16.00",
"Perkantoran Kebon Jeruk Jl. Panjang, 12.00-15.30 | DRAFT",
"Kuliner Green Ville, 17.00-20.30 | DRAFT",
"AM 07.00-16.00",
"Univ. Trisakti Grogol, day 2/2 | DRAFT",
"AM 07.00-16.00",
"UNTAR Kampus I, day 2/2 | DRAFT"
],
"2026-11-18": [
"AM 07.00-16.00",
"St. Jakarta Kota, 07.00-10.30 | via Grab | DRAFT",
"Perkantoran Kota Gajah Mada, 11.30-15.30 | DRAFT",
"AM 07.00-16.00",
"BINUS Syahdan, day 1/2 | DRAFT",
"AM 07.00-16.00",
"BINUS Anggrek, day 1/2 | DRAFT"
],
"2026-11-19": [
"PM 12.00-21.00",
"Senopati Gunawarman, 12.30-16.00 | DRAFT",
"Kuliner Radio Dalam, 17.00-20.30 | DRAFT",
"AM 07.00-16.00",
"BINUS Syahdan, day 2/2 | DRAFT",
"AM 07.00-16.00",
"BINUS Anggrek, day 2/2 | DRAFT"
],
"2026-11-20": [
"AM 07.00-16.00",
"Pasar Mayestik, 06.00-09.30 (shift 06.00-15.00) | DRAFT",
"Taman Langsat, 11.00-14.30 | DRAFT",
"AM 07.00-16.00",
"Univ. Mercu Buana Meruya, 1 day | DRAFT",
"AM 07.00-16.00",
"Univ. Esa Unggul Kebon Jeruk, 1 day | DRAFT"
],
"2026-11-21": [
"PM 12.00-21.00",
"",
"",
"PM 12.00-21.00",
"Taman Ayodya, day 1/2 | DRAFT",
"PM 12.00-21.00",
"Pasar Santa, day 1/2 | DRAFT"
],
"2026-11-22": [
"AM 07.00-16.00",
"",
"",
"PM 12.00-21.00",
"Taman Ayodya, day 2/2 | DRAFT",
"PM 12.00-21.00",
"Pasar Santa, day 2/2 | DRAFT"
]
};

export type PlanVenue = { name: string; time: string | null; tags: string[]; category: string };
export type UnitPlan = { shift: 'AM' | 'MID' | 'PM' | null; shiftLabel: string; venues: PlanVenue[] };

/** "St. Ancol, 07.00-10.30 | via Grab" → nama, jam, tag. "Taman Waduk Pluit, day 1/2" → jam null. */
export function parseCell(cell: string): PlanVenue | null {
  const c = (cell || '').trim();
  if (!c) return null;
  const [head, ...tags] = c.split('|').map((s) => s.trim());
  const m = head.match(/^(.*?),\s*(.+)$/);
  let name = head;
  let time: string | null = null;
  if (m) {
    name = m[1].trim();
    const rest = m[2].trim();
    time = /^\d{2}\.\d{2}/.test(rest) ? rest : null;
    if (!time && /day\s*\d/i.test(rest)) tags.unshift(rest.replace(/^day/i, 'hari'));
    if (!time && /1 day/i.test(rest)) tags.unshift('1 hari');
  }
  return { name, time, tags: tags.filter(Boolean), category: guessCategory(name) };
}

export function guessCategory(name: string): string {
  const n = name.toLowerCase();
  if (/^(st\.|stasiun|lrt|mrt|halte|terminal)\b|^st\s/.test(n)) return 'Station';
  if (/univ|kampus|binus|\buki\b|\bunj\b|\bui\b|untag|untar|umj|ikj|institut|kalbis|kwik kian gie|politeknik|yarsi|trisakti|mercu buana|esa unggul|bunda mulia|darma persada|borobudur|\bbsi\b/.test(n)) return 'Campus';
  if (/perkantoran|kantor|kawasan industri|industri/.test(n)) return 'Office';
  return 'HOP & Public Space';
}

const UNIT_COLS: Record<string, [number, number[]]> = { mobil: [0, [1, 2]], kiosk1: [3, [4]], kiosk2: [5, [6]] };

export function planFor(plot: PlottingRaw | null | undefined, day: string, unitId: string): UnitPlan | null {
  const row = (plot && plot[day]) || PLOTTING_SNAPSHOT[day];
  const cols = UNIT_COLS[unitId];
  if (!row || !cols) return null;
  const shiftLabel = (row[cols[0]] || '').trim();
  const shift = /^(AM|Pagi)/i.test(shiftLabel) ? 'AM' : /^(MID|Siang)/i.test(shiftLabel) ? 'MID' : /^(PM|Sore|Malam)/i.test(shiftLabel) ? 'PM' : null;
  const venues = cols[1]
    .map((i) => parseCell(row[i] || ''))
    .filter((v): v is PlanVenue => Boolean(v) && !isSchoolVenue(v!.name))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  if (!shift && !venues.length) return null;
  return { shift, shiftLabel, venues };
}
