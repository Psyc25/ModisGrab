/**
 * Mesin laporan Cek Boros.
 * Dipakai bersama oleh dashboard internal (/dashboard) dan halaman report klien.
 * Semua hitungan memakai tanggal WIB (Asia/Jakarta).
 */

export interface VisitRow {
  ts: string;
  day: string; // YYYY-MM-DD (WIB)
  loc: string;
  cat: string;
  unit: string;
  hours: string;
  slot: string;
  status: string;
  savings: number;
  stamps: number;
  reward: string;
  uid: string;
  spg?: string;
}

export interface SlotRow {
  day: string;
  unit: string;
  hours: string;
  slot: string;
  loc: string;
  cat: string;
  reach: number;
  contact: number;
  conversion: number;
  a: number;
  b: number;
  c: number;
  drinks: number;
  spg?: string;
}

export interface ReportSettings {
  campaign: { start: string; days: number; name: string; client: string };
  targets: {
    reach: number;
    contact: number;
    conversion: number;
    reach_per_spg: number;
    contact_per_spg: number;
    conversion_per_spg: number;
    spg_per_unit: number;
    units: number;
  };
  merch_stock: { a: number; b: number; c: number; drinks: number };
  live_sheet_url: string;
}

export const DEFAULT_SETTINGS: ReportSettings = {
  campaign: { start: '2026-10-26', days: 98, name: 'Mobile Activation PAHE (Paket Hemat) – Jakarta & Bogor', client: 'Grab · Milli' },
  targets: {
    reach: 295000,
    contact: 146000,
    conversion: 58800,
    reach_per_spg: 500,
    contact_per_spg: 250,
    conversion_per_spg: 100,
    spg_per_unit: 2,
    units: 3,
  },
  merch_stock: { a: 1000, b: 5000, c: 10000, drinks: 0 },
  live_sheet_url: '',
};

export function mergeSettings(raw: any): ReportSettings {
  const s = raw || {};
  return {
    campaign: { ...DEFAULT_SETTINGS.campaign, ...(s.campaign || {}) },
    targets: { ...DEFAULT_SETTINGS.targets, ...(s.targets || {}) },
    merch_stock: { ...DEFAULT_SETTINGS.merch_stock, ...(s.merch_stock || {}) },
    live_sheet_url: typeof s.live_sheet_url === 'string' ? s.live_sheet_url : '',
  };
}

export interface Filters {
  loc: string;
  cat: string;
  unit: string;
  slot: string;
  status: string;
  spg: string;
}
export const ALL = 'all';
export const NO_FILTER: Filters = { loc: ALL, cat: ALL, unit: ALL, slot: ALL, status: ALL, spg: ALL };

// ---------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------
export const UNITS = ['Mobil Diskon', 'Kiosk 1', 'Kiosk 2'];
export const SLOT_ORDER = ['Pagi', 'Siang', 'Sore/Malam', 'Seharian'];
export const STATUSES = ['Sangat Boros', 'Boros', 'Lumayan Boros', 'Cukup Hemat'];
const SLOT_BY_START: Record<string, string> = { '06.30': 'Pagi', '11.00': 'Siang', '16.30': 'Sore/Malam', '10.00': 'Seharian', '05.00': 'Pagi', '08.30': 'Seharian', '12.00': 'Siang' };

export const CATEGORY_LABEL: Record<string, string> = {
  Station: 'Stasiun',
  Campus: 'Kampus',
  Office: 'Perkantoran',
  'HOP & Public Space': 'HOP & Area Publik',
};

export function slotOf(hours: string): string {
  const h = String(hours || '').replace(':', '.');
  return SLOT_BY_START[h.slice(0, 5)] || (h ? `Lainnya (${h})` : 'Jam tidak diisi');
}

export function catLabel(cat: string): string {
  return CATEGORY_LABEL[cat] || cat || 'Lainnya';
}

// ---------------------------------------------------------------------
// Tanggal (WIB)
// ---------------------------------------------------------------------
export const todayWIB = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const dayOfWIB = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function fmtDay(key: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('id-ID', { timeZone: 'UTC', ...opts });
}

export function fmtRange(from: string, to: string): string {
  if (from === to) return fmtDay(from, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmtDay(from)} – ${fmtDay(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// ---------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------
export function filterVisits(rows: VisitRow[], f: Filters): VisitRow[] {
  return rows.filter(
    (r) =>
      (f.loc === ALL || r.loc === f.loc) &&
      (f.cat === ALL || r.cat === f.cat) &&
      (f.unit === ALL || r.unit === f.unit) &&
      (f.slot === ALL || r.slot === f.slot) &&
      (f.status === ALL || r.status === f.status) &&
      (f.spg === ALL || (r.spg || '') === f.spg)
  );
}

/** Laporan slot tidak punya status boros, jadi filter status tidak berlaku. */
export function filterSlots(rows: SlotRow[], f: Filters): SlotRow[] {
  return rows.filter(
    (r) =>
      (f.loc === ALL || r.loc === f.loc) &&
      (f.cat === ALL || r.cat === f.cat) &&
      (f.unit === ALL || r.unit === f.unit) &&
      (f.slot === ALL || r.slot === f.slot) &&
      (f.spg === ALL || (r.spg || '') === f.spg)
  );
}

export function filterOptions(visits: VisitRow[], slots: SlotRow[]) {
  const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id'));
  const slotSet = uniq([...visits.map((v) => v.slot), ...slots.map((s) => s.slot)]);
  return {
    loc: uniq([...visits.map((v) => v.loc), ...slots.map((s) => s.loc)]),
    cat: uniq([...visits.map((v) => v.cat), ...slots.map((s) => s.cat)]),
    unit: uniq([...UNITS, ...visits.map((v) => v.unit), ...slots.map((s) => s.unit)]),
    slot: [...SLOT_ORDER.filter((s) => slotSet.includes(s)), ...slotSet.filter((s) => !SLOT_ORDER.includes(s))],
    status: STATUSES,
    spg: uniq([...visits.map((v) => v.spg || ''), ...slots.map((s) => s.spg || '')]),
  };
}

// ---------------------------------------------------------------------
// Ringkasan
// ---------------------------------------------------------------------
export interface Agg {
  visits: number;
  unique: number;
  rewards: number;
  stamps: number;
  savings: number;
  reach: number;
  contact: number;
  conversion: number;
  a: number;
  b: number;
  c: number;
  drinks: number;
  days: number;
}

interface AggBuilder {
  visits: number;
  uids: Set<string>;
  rewards: number;
  stamps: number;
  savings: number;
  reach: number;
  contact: number;
  conversion: number;
  a: number;
  b: number;
  c: number;
  drinks: number;
  days: Set<string>;
}

const newB = (): AggBuilder => ({
  visits: 0,
  uids: new Set(),
  rewards: 0,
  stamps: 0,
  savings: 0,
  reach: 0,
  contact: 0,
  conversion: 0,
  a: 0,
  b: 0,
  c: 0,
  drinks: 0,
  days: new Set(),
});

function addVisit(b: AggBuilder, v: VisitRow) {
  b.visits += 1;
  b.uids.add(v.uid);
  if (v.reward) b.rewards += 1;
  b.stamps += v.stamps || 0;
  b.savings += v.savings || 0;
  b.days.add(v.day);
}

function addSlot(b: AggBuilder, s: SlotRow) {
  b.reach += s.reach;
  b.contact += s.contact;
  b.conversion += s.conversion;
  b.a += s.a;
  b.b += s.b;
  b.c += s.c;
  b.drinks += s.drinks;
  b.days.add(s.day);
}

const done = (b: AggBuilder): Agg => ({
  visits: b.visits,
  unique: b.uids.size,
  rewards: b.rewards,
  stamps: b.stamps,
  savings: b.savings,
  reach: b.reach,
  contact: b.contact,
  conversion: b.conversion,
  a: b.a,
  b: b.b,
  c: b.c,
  drinks: b.drinks,
  days: b.days.size,
});

export const avgSavings = (a: Agg) => (a.visits ? Math.round(a.savings / a.visits) : 0);
export const rate = (num: number, den: number) => (den > 0 ? num / den : 0);

function groupBy(visits: VisitRow[], slots: SlotRow[], keyV: (v: VisitRow) => string, keyS: (s: SlotRow) => string) {
  const map = new Map<string, AggBuilder>();
  const get = (k: string) => {
    let b = map.get(k);
    if (!b) map.set(k, (b = newB()));
    return b;
  };
  visits.forEach((v) => addVisit(get(keyV(v)), v));
  slots.forEach((s) => addSlot(get(keyS(s)), s));
  return new Map(Array.from(map.entries()).map(([k, b]) => [k, done(b)]));
}

export interface DailyTarget {
  reach: number;
  contact: number;
  conversion: number;
}

export function dailyTarget(s: ReportSettings): DailyTarget {
  const per = s.targets.spg_per_unit * s.targets.units;
  return { reach: per * s.targets.reach_per_spg, contact: per * s.targets.contact_per_spg, conversion: per * s.targets.conversion_per_spg };
}

/** Jumlah hari campaign yang masuk ke rentang [from, to]. */
export function campaignDaysIn(s: ReportSettings, from: string, to: string): number {
  const start = s.campaign.start;
  const end = addDays(start, s.campaign.days - 1);
  const a = from > start ? from : start;
  const b = to < end ? to : end;
  return a > b ? 0 : diffDays(a, b) + 1;
}

export function campaignDayNo(s: ReportSettings, day: string): number {
  return diffDays(s.campaign.start, day) + 1;
}

export function weekLabel(s: ReportSettings, day: string): string {
  const n = campaignDayNo(s, day);
  if (n < 1) return 'Pra-campaign';
  if (n > s.campaign.days) return 'Pasca-campaign';
  return `Wk ${Math.floor((n - 1) / 7) + 1}`;
}

export interface Row {
  key: string;
  label: string;
  sub?: string;
  agg: Agg;
}

export interface Summary {
  from: string;
  to: string;
  total: Agg;
  target: DailyTarget; // target untuk rentang ini
  campaignDays: number;
  daily: { day: string; agg: Agg; target: DailyTarget }[];
  unitSlot: Row[];
  category: Row[];
  location: Row[];
  /** Rincian unit · slot per lokasi (untuk laci per lokasi). */
  locationUnits: Record<string, Row[]>;
  status: Row[];
  reward: Row[];
  spg: Row[];
  weeks: Row[];
  months: Row[];
}

export function summarize(visits: VisitRow[], slots: SlotRow[], s: ReportSettings, from: string, to: string): Summary {
  const v = visits.filter((r) => r.day >= from && r.day <= to);
  const sl = slots.filter((r) => r.day >= from && r.day <= to);

  const totalB = newB();
  v.forEach((r) => addVisit(totalB, r));
  sl.forEach((r) => addSlot(totalB, r));

  const dt = dailyTarget(s);
  const cDays = campaignDaysIn(s, from, to);
  const target = { reach: dt.reach * cDays, contact: dt.contact * cDays, conversion: dt.conversion * cDays };

  const byDay = groupBy(v, sl, (r) => r.day, (r) => r.day);
  const daily = daysBetween(from, to).map((day) => {
    const inCampaign = campaignDaysIn(s, day, day) > 0;
    return {
      day,
      agg: byDay.get(day) || done(newB()),
      target: inCampaign ? dt : { reach: 0, contact: 0, conversion: 0 },
    };
  });

  const toRows = (m: Map<string, Agg>, label: (k: string) => string, order?: (a: Row, b: Row) => number, sub?: (k: string) => string) => {
    const rows = Array.from(m.entries()).map(([k, agg]) => ({ key: k, label: label(k), sub: sub?.(k), agg }));
    return rows.sort(order || ((a, b) => b.agg.visits + b.agg.conversion - (a.agg.visits + a.agg.conversion)));
  };

  const unitSlotMap = groupBy(v, sl, (r) => `${r.unit}|${r.slot}`, (r) => `${r.unit}|${r.slot}`);
  const unitRank = (u: string) => {
    const i = UNITS.indexOf(u);
    return i < 0 ? 99 : i;
  };
  const slotRank = (x: string) => {
    const i = SLOT_ORDER.indexOf(x);
    return i < 0 ? 99 : i;
  };
  const unitSlot = toRows(
    unitSlotMap,
    (k) => {
      const [u, sl2] = k.split('|');
      return `${u || '—'} · ${sl2}`;
    },
    (a, b) => {
      const [ua, sa] = a.key.split('|');
      const [ub, sb] = b.key.split('|');
      return unitRank(ua) - unitRank(ub) || slotRank(sa) - slotRank(sb) || ua.localeCompare(ub);
    }
  );

  const weekMap = groupBy(v, sl, (r) => weekLabel(s, r.day), (r) => weekLabel(s, r.day));
  const weekNum = (k: string) => (k.startsWith('Wk ') ? Number(k.slice(3)) : k === 'Pra-campaign' ? 0 : 999);
  const weeks = toRows(
    weekMap,
    (k) => k,
    (a, b) => weekNum(a.key) - weekNum(b.key),
    (k) => (k.startsWith('Wk ') ? fmtDay(addDays(s.campaign.start, (Number(k.slice(3)) - 1) * 7)) : '')
  );

  const monthMap = groupBy(v, sl, (r) => r.day.slice(0, 7), (r) => r.day.slice(0, 7));
  const months = toRows(
    monthMap,
    (k) => fmtDay(`${k}-01`, { month: 'long', year: 'numeric' }),
    (a, b) => a.key.localeCompare(b.key)
  );

  const statusMap = groupBy(v, [], (r) => r.status || 'Lainnya', () => '');
  const status = STATUSES.map((st) => ({ key: st, label: st, agg: statusMap.get(st) || done(newB()) }));

  const rewardMap = groupBy(
    v.filter((r) => r.reward),
    [],
    (r) => r.reward,
    () => ''
  );

  return {
    from,
    to,
    total: done(totalB),
    target,
    campaignDays: cDays,
    daily,
    unitSlot,
    category: toRows(groupBy(v, sl, (r) => catLabel(r.cat), (r) => catLabel(r.cat)), (k) => k),
    location: toRows(groupBy(v, sl, (r) => r.loc || '—', (r) => r.loc || '—'), (k) => k),
    locationUnits: (() => {
      const m = groupBy(v, sl, (r) => `${r.loc || '—'}|${r.unit} · ${r.slot}`, (r) => `${r.loc || '—'}|${r.unit} · ${r.slot}`);
      const out: Record<string, Row[]> = {};
      m.forEach((agg, k) => {
        const [loc, us] = k.split('|');
        (out[loc] ||= []).push({ key: us, label: us, agg });
      });
      return out;
    })(),
    status,
    reward: toRows(rewardMap, (k) => k),
    spg: toRows(groupBy(v, sl, (r) => r.spg || '—', (r) => r.spg || '—'), (k) => k),
    weeks,
    months,
  };
}

/** Persentase perubahan B terhadap A. null bila A = 0. */
export function delta(a: number, b: number): number | null {
  if (!a) return b ? null : 0;
  return (b - a) / a;
}

// ---------------------------------------------------------------------
// Adaptor data
// ---------------------------------------------------------------------
export function visitFromDb(r: any): VisitRow {
  const ts = r.created_at;
  return {
    ts,
    day: dayOfWIB(ts),
    loc: r.poi_location || '',
    cat: r.poi_category || '',
    unit: r.unit_type || '',
    hours: r.duty_hours || '',
    slot: slotOf(r.duty_hours || ''),
    status: r.boros_status || '',
    savings: Number(r.monthly_savings) || 0,
    stamps: Number(r.stamps_count) || 0,
    reward: r.reward_claimed || '',
    uid: r.phone_number || r.id,
    spg: r.spg_name || '',
  };
}

export function slotFromDb(r: any): SlotRow {
  return {
    day: String(r.report_date),
    unit: r.unit_type || '',
    hours: r.duty_hours || '',
    slot: slotOf(r.duty_hours || ''),
    loc: r.poi_location || '',
    cat: r.poi_category || '',
    reach: Number(r.reach) || 0,
    contact: Number(r.contact) || 0,
    conversion: Number(r.conversion) || 0,
    a: Number(r.merch_a) || 0,
    b: Number(r.merch_b) || 0,
    c: Number(r.merch_c) || 0,
    drinks: Number(r.drinks) || 0,
    spg: r.spg_name || '',
  };
}

/** Baris ringkas dari modis_public_report (halaman klien). */
export function visitFromPublic(a: any[]): VisitRow {
  const [ts, loc, cat, unit, hours, status, savings, stamps, reward, uid] = a;
  return {
    ts,
    day: dayOfWIB(ts),
    loc: loc || '',
    cat: cat || '',
    unit: unit || '',
    hours: hours || '',
    slot: slotOf(hours || ''),
    status: status || '',
    savings: Number(savings) || 0,
    stamps: Number(stamps) || 0,
    reward: reward || '',
    uid: uid || ts,
  };
}

export function slotFromPublic(a: any[]): SlotRow {
  const [day, unit, hours, loc, cat, reach, contact, conversion, ma, mb, mc, drinks] = a;
  return {
    day: String(day),
    unit: unit || '',
    hours: hours || '',
    slot: slotOf(hours || ''),
    loc: loc || '',
    cat: cat || '',
    reach: Number(reach) || 0,
    contact: Number(contact) || 0,
    conversion: Number(conversion) || 0,
    a: Number(ma) || 0,
    b: Number(mb) || 0,
    c: Number(mc) || 0,
    drinks: Number(drinks) || 0,
  };
}

export interface RecentVisitor {
  ts: string;
  name: string;
  phone: string;
  loc: string;
  unit: string;
  hours: string;
  status: string;
  savings: number;
  reward: string;
  cat: string;
}

export function recentFromPublic(a: any[]): RecentVisitor {
  const [ts, name, phone, loc, unit, hours, status, savings, reward, cat] = a;
  return { ts, name: name || 'Visitor', phone: phone || '', loc: loc || '', unit: unit || '', hours: hours || '', status: status || '', savings: Number(savings) || 0, reward: reward || '', cat: cat || '' };
}
