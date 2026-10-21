import { SPGConfig } from '../types';
import { POI_INDEX, RUNNING_SCHEDULE, ScheduleDay } from './runningSchedule';

export type Unit = 'Mobil Diskon' | 'Kiosk 1' | 'Kiosk 2';
type Cat = SPGConfig['poiCategory'];

/** Slot jam jaga per unit, mengikuti Running Schedule (Mobil 3 slot, Kiosk seharian). */
export const UNIT_SLOTS: Record<Unit, { label: string; start: string; end: string; col: number }[]> = {
  'Mobil Diskon': [
    { label: 'Pagi', start: '06:30', end: '09:30', col: 2 },
    { label: 'Siang', start: '11:00', end: '14:00', col: 3 },
    { label: 'Sore/Malam', start: '16:30', end: '20:00', col: 4 },
  ],
  'Kiosk 1': [{ label: 'Seharian', start: '10:00', end: '20:00', col: 5 }],
  'Kiosk 2': [{ label: 'Seharian', start: '10:00', end: '20:00', col: 6 }],
};

/** Venue sekolah (SMA/SMK/SMP/SD) dibatalkan: tidak ditampilkan & slotnya kosong. Kampus tetap. */
export const isSchoolVenue = (name: string) => /^(SMAN?|SMKN?|SMPN?|SDN?|MAN?)\s|\bSMA Negeri\b|\bSMK Negeri\b/i.test(name.trim());

// Slot venue sekolah dikosongkan (venue dibatalkan)
const byDate = new Map<string, ScheduleDay>(
  RUNNING_SCHEDULE.map((d) => [d[0], d.map((v, i) => (i >= 2 && isSchoolVenue(v) ? '' : v)) as ScheduleDay]),
);

export function scheduleFor(date: string): ScheduleDay | undefined {
  return byDate.get(date);
}

export function catOf(location: string): Cat {
  return (POI_INDEX[location]?.cat as Cat) || 'HOP & Public Space';
}

/** Lokasi sesuai jadwal untuk unit & jam mulai tertentu. Kosong bila tanggal di luar jadwal. */
export function scheduledLocation(date: string, unit: string, dutyStart: string): { location: string; area: string; category: Cat; dayNo: number } | null {
  const day = scheduleFor(date);
  const slots = UNIT_SLOTS[unit as Unit];
  if (!day || !slots) return null;
  const slot = slots.find((s) => s.start === dutyStart) || (slots.length === 1 ? slots[0] : null);
  if (!slot) return null;
  const location = day[slot.col];
  if (!location || isSchoolVenue(location)) return null;
  return { location, area: day[1], category: catOf(location), dayNo: RUNNING_SCHEDULE.findIndex((d) => d[0] === day[0]) + 1 };
}

/** Semua POI di jadwal & List POI per kategori, untuk pilihan "lokasi berbeda". */
export const POI_BY_CATEGORY: Record<Cat, string[]> = (() => {
  const out: Record<Cat, string[]> = { Station: [], Campus: [], Office: [], 'HOP & Public Space': [] };
  for (const [name, v] of Object.entries(POI_INDEX)) if (!isSchoolVenue(name)) out[(v.cat as Cat) || 'HOP & Public Space'].push(name);
  for (const k of Object.keys(out) as Cat[]) out[k].sort((a, b) => a.localeCompare(b, 'id'));
  return out;
})();
