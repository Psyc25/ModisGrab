import { getSupabaseClient } from '../services/supabase';
import { dedupePeople } from '../utils/people';
import { SlotRow, VisitRow, dayOfWIB, slotOf } from '../report/engine';
import { normBorosStatus } from '../utils/borosStatus';

/**
 * Jembatan ke laporan "Cek Boros" lama: aplikasi crew baru menyimpan data di tabel lapangan
 * (modis_conversions, modis_close_days, modis_boros_checks), sedangkan laporan lama membaca
 * baris visitor + laporan slot. Di sini data lapangan diubah ke bentuk yang sama supaya laporan
 * lama, dashboard Field App, dan laporan klien menampilkan angka yang sama.
 * Conversion dihitung per ORANG per hari (aturan yang sama dengan laporan klien).
 */
const UNIT_LABEL: Record<string, string> = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk 1', kiosk2: 'Kiosk 2' };
/** Jam mulai shift → label slot laporan lama (Pagi / Siang / Sore-Malam). */
const SHIFT_HOURS: Record<string, string> = { AM: '05.00–14.00', MID: '08.30–17.30', PM: '12.00–21.00' };

async function pageAll<T>(table: string, cols: string, apply: (q: any) => any): Promise<T[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(sb.from(table).select(cols)).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function fieldAsLegacy(from: string, to: string): Promise<{ visits: VisitRow[]; slots: SlotRow[] }> {
  const [conv, closes, boros] = await Promise.all([
    pageAll<any>('modis_conversions', 'claim_day,unit_id,shift,spg_name,poi_location,poi_category,name,phone_last4,type,created_at,reward,reward2,merch,merch2,prize,photobooth', (q) =>
      q.eq('status', 'ok').gte('claim_day', from).lte('claim_day', to),
    ),
    pageAll<any>('modis_close_days', 'day,unit_id,reach,contacts', (q) => q.gte('day', from).lte('day', to)),
    pageAll<any>('modis_boros_checks', 'op_id,unit_id,day,shift,spg_name,poi_location,savings,status,created_at', (q) => q.gte('day', from).lte('day', to)),
  ]);

  const catOf = new Map<string, string>();
  conv.forEach((r) => r.poi_location && r.poi_category && catOf.set(r.poi_location, r.poi_category));

  const visits: VisitRow[] = boros.map((b) => {
    const hours = SHIFT_HOURS[b.shift] || '';
    return {
      ts: b.created_at,
      day: b.day || dayOfWIB(b.created_at),
      loc: b.poi_location || '',
      cat: catOf.get(b.poi_location || '') || '',
      unit: UNIT_LABEL[b.unit_id] || b.unit_id || '',
      hours,
      slot: slotOf(hours),
      status: normBorosStatus(b.status),
      savings: Number(b.savings) || 0,
      stamps: 0,
      reward: '',
      uid: `cb:${b.op_id}`,
      spg: b.spg_name || '',
    };
  });

  const key = (day: string, unit: string, shift: string, loc: string) => `${day}|${unit}|${shift}|${loc}`;
  const slots = new Map<string, SlotRow>();
  const cell = (day: string, unit_id: string, shift: string, loc: string, cat: string, spg: string) => {
    const k = key(day, unit_id, shift, loc);
    let s = slots.get(k);
    if (!s) {
      const hours = SHIFT_HOURS[shift] || '';
      s = { day, unit: UNIT_LABEL[unit_id] || unit_id, hours, slot: slotOf(hours), loc, cat, reach: 0, contact: 0, conversion: 0, a: 0, b: 0, c: 0, drinks: 0, spg };
      slots.set(k, s);
    }
    return s;
  };

  dedupePeople(conv).forEach((r) => {
    const s = cell(r.claim_day, r.unit_id, r.shift, r.poi_location || '', r.poi_category || '', r.spg_name || '');
    s.conversion += 1;
  });
  // Reward / merchandise per submission (stok terpakai), sama dengan laporan klien
  conv.forEach((r) => {
    const s = cell(r.claim_day, r.unit_id, r.shift, r.poi_location || '', r.poi_category || '', r.spg_name || '');
    [r.reward, r.reward2].forEach((w) => {
      if (w === 'tier_a') s.a += 1;
      else if (w === 'tier_b') s.b += 1;
      else if (w === 'tier_c') s.c += 1;
      else if (w === 'drink') s.drinks += 1;
    });
  });
  // Contact = setiap Cek Boros yang dijalankan; per hari/unit/shift/venue
  boros.forEach((b) => {
    cell(b.day, b.unit_id, b.shift, b.poi_location || '', catOf.get(b.poi_location || '') || '', b.spg_name || '').contact += 1;
  });
  // Reach dari close day (per hari per unit): ditaruh di satu baris agar tidak terhitung ganda
  const reachDone = new Set<string>();
  closes.forEach((c) => {
    const rows = [...slots.values()].filter((s) => s.day === c.day && s.unit === (UNIT_LABEL[c.unit_id] || c.unit_id));
    const target = rows.sort((x, y) => y.conversion - x.conversion)[0] || cell(c.day, c.unit_id, '', '', '', '');
    const rk = `${c.day}|${c.unit_id}`;
    if (reachDone.has(rk)) return;
    reachDone.add(rk);
    target.reach += Number(c.reach) || 0;
  });

  return { visits, slots: [...slots.values()] };
}
