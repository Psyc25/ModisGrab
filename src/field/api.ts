import { getSupabaseClient } from '../services/supabase';

/**
 * Field App (spec v1): semua panggilan ke server lewat fungsi Supabase bertoken sesi shift.
 * Tablet tidak pernah membaca tabel langsung.
 */

export type Role = 'spg' | 'tl';
export type Shift = 'AM' | 'MID' | 'PM';
/** 3 shift mobil sesuai Master Timeline: Pagi, Siang, Sore/Malam. Kode AM/PM dipertahankan agar data lama tetap terbaca. */
export const SHIFTS: { id: Shift; name: string; jam: string; start: number; end: number }[] = [
  { id: 'AM', name: 'Pagi', jam: '05.00–14.00', start: 5, end: 14 },
  { id: 'MID', name: 'Tengah (lama)', jam: '08.30–17.30', start: 8.5, end: 17.5 },
  { id: 'PM', name: 'Siang–Malam', jam: '12.00–21.00', start: 12, end: 21 },
];

/**
 * Jadwal kerja crew yang diatur office. Shift berbasis TIM: tiap tim mendapat shift (atau libur) untuk satu minggu kampanye,
 * lalu bergantian (rotasi). Satu shift = 9 jam. Nama & jam shift bisa diubah. Dibaca tablet sebelum login dan disimpan untuk offline.
 */
export interface Team {
  tl: string[];
  spg: string[];
}
export interface Jadwal {
  shifts?: Partial<Record<Shift, { name?: string; jam?: string }>>;
  /** Tim (A, B, C ...) dan anggotanya menurut nama */
  teams?: Record<string, Team>;
  /** Rotasi per minggu kampanye (berulang): tim -> shift, '' = libur */
  rotation?: Record<string, Shift | ''>[];
  /** Cadangan: pola mingguan / pengecualian per tanggal untuk semua crew */
  weekdays?: Record<string, Shift | ''>;
  days?: Record<string, Shift | ''>;
}
const JADWAL_KEY = 'modis_f1_jadwal';
const hhmm = (s: string) => {
  const m = /^(\d{1,2})[.:](\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) + Number(m[2]) / 60 : NaN;
};
export function applyJadwal(j?: Jadwal | null) {
  for (const sh of SHIFTS) {
    const c = j?.shifts?.[sh.id];
    if (!c) continue;
    if (c.name && c.name.trim()) sh.name = c.name.trim().slice(0, 20);
    const p = (c.jam || '').split(/[–-]/);
    if (p.length === 2 && !isNaN(hhmm(p[0])) && !isNaN(hhmm(p[1]))) {
      sh.jam = `${p[0].trim().replace(':', '.')}–${p[1].trim().replace(':', '.')}`;
      sh.start = hhmm(p[0]);
      sh.end = hhmm(p[1]);
    }
  }
}
const isShift = (x: unknown): x is Shift => x === 'AM' || x === 'MID' || x === 'PM';
const norm = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
export function teamOf(j: Jadwal | null | undefined, name?: string): string | null {
  if (!j?.teams || !name || !name.trim()) return null;
  const n = norm(name);
  for (const [t, m] of Object.entries(j.teams)) if ([...(m.tl || []), ...(m.spg || [])].some((x) => norm(x) === n)) return t;
  return null;
}
export function rotationFor(j: Jadwal | null | undefined, team: string, date: string): Shift | null {
  const r = j?.rotation;
  if (!r || !r.length) return null;
  const v = r[(campaignWeek(date) - 1) % r.length]?.[team];
  return isShift(v) ? v : null;
}
/** Shift yang berlaku untuk nama itu pada tanggal tsb. null = belum ada jadwal atau libur. */
export function shiftFor(j: Jadwal | null | undefined, date: string, name?: string): Shift | null {
  if (!j) return null;
  const d = j.days?.[date];
  if (isShift(d)) return d;
  const team = teamOf(j, name);
  if (team) return rotationFor(j, team, date);
  const w = j.weekdays?.[String(new Date(`${date}T00:00:00Z`).getUTCDay())];
  return isShift(w) ? w : null;
}
export function getJadwalCache(): Jadwal | null {
  try {
    return JSON.parse(localStorage.getItem(JADWAL_KEY) || 'null');
  } catch {
    return null;
  }
}
export function saveJadwalCache(j: Jadwal | null) {
  try {
    if (j) localStorage.setItem(JADWAL_KEY, JSON.stringify(j));
  } catch {
    /* ignore */
  }
  applyJadwal(j);
}
applyJadwal(getJadwalCache());
/** Shift yang dipakai sekarang (dua jam kerja). Kode MID dipertahankan hanya agar data lama tetap terbaca. */
export const ACTIVE_SHIFTS = SHIFTS.filter((s) => s.id !== 'MID');
export const shiftInfo = (s?: string | null) => SHIFTS.find((x) => x.id === s) || SHIFTS[0];
export const shiftText = (s?: string | null) => (s ? `${shiftInfo(s).name} ${shiftInfo(s).jam.replace('–', '-')}` : '');
export type ConvType = 'pahe_new' | 'pahe_lapsed' | 'gb_hemat';
export type Reward = 'snack' | 'drink' | 'candy' | 'tier_c' | 'tier_b' | 'tier_a' | 'golden' | 'none';

export interface FieldSession {
  token: string;
  role: Role;
  unit_id: string;
  unit_name: string;
  spg_name: string;
  shift: Shift;
  expires_at: string;
  poi_location?: string;
  poi_category?: string;
  started_at: string;
}

export interface UnitInfo {
  id: string;
  name: string;
  ready: boolean;
}

export interface LookupResult {
  pahe: ConvType | null;
  pahe_day: string | null;
  gb_today: boolean;
  name: string | null;
}

export interface SubmitPayload {
  id: string;
  created_at: string;
  phone: string; // 628xxxxxxxx
  name: string;
  type: ConvType;
  reward: Reward;
  extra_draw: boolean;
  photobooth: boolean;
  consent: boolean;
  consent_ver: string;
  poi_location?: string;
  poi_category?: string;
  /** Input susulan oleh TL (dari Google Form / kertas) */
  backfill?: boolean;
  spg_name?: string;
  shift?: Shift;
  /** Item merch yang diberikan (tier C/B/A) */
  merch?: string;
  /** Hasil draw kedua Ride & Share */
  reward2?: Reward;
  merch2?: string;
  /** Label hadiah utama lama (data historis) */
  prize?: string;
}

export class FieldError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** true bila error karena jaringan (boleh dicoba lagi nanti), bukan ditolak server */
export const isNetworkError = (e: unknown) => {
  const m = String((e as any)?.message || e || '');
  return /Failed to fetch|NetworkError|Load failed|network|timeout|fetch/i.test(m) && !(e as any)?.code;
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = getSupabaseClient();
  if (!sb) throw new FieldError('Server belum dikonfigurasi');
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new FieldError(error.message, error.code || undefined);
  return data as T;
}

export const fieldApi = {
  units: () => rpc<UnitInfo[]>('modis_f1_units', {}),
  login: (unit: string, pin: string, spg: string, shift: Shift, device: string) =>
    rpc<Omit<FieldSession, 'started_at'>>('modis_f1_login', { p_unit: unit, p_pin: pin, p_spg: spg, p_shift: shift, p_device: device }),
  logout: (token: string) => rpc<void>('modis_f1_logout', { p_token: token }),
  lookup: (token: string, phone: string) => rpc<LookupResult>('modis_f1_lookup', { p_token: token, p_phone: phone }),
  claimCache: (token: string) => rpc<{ day: string; pahe: string[]; gb: string[] }>('modis_f1_claim_cache', { p_token: token }),
  submit: (token: string, p: SubmitPayload) => rpc<{ id: string; status: 'ok' | 'conflict' | 'duplicate'; note?: string }>('modis_f1_submit', { p_token: token, p }),
  attachPhoto: (token: string, id: string, path: string) => rpc<void>('modis_f1_attach_photo', { p_token: token, p_id: id, p_path: path }),
  unitToday: (token: string) => rpc<UnitToday>('modis_f1_unit_today', { p_token: token }),
  stock: (token: string, kind: StockKind, items: Record<string, number>, op: string) =>
    rpc<void>('modis_f1_stock', { p_token: token, p_kind: kind, p_items: items, p_op: op }),
  closeDay: (token: string, p: Record<string, unknown>) => rpc<void>('modis_f1_close_day', { p_token: token, p }),
  boros: (token: string, p: Record<string, unknown>) => rpc<void>('modis_f1_boros', { p_token: token, p }),
  gb30: (token: string, p: Record<string, unknown>) => rpc<void>('modis_f1_gb30', { p_token: token, p }),
  leaderboard: (from: string, to: string, full = false) => rpc<LbRow[]>('modis_f1_leaderboard', { p_from: from, p_to: to, p_full: full }),
  // Office (akun owner di dashboard)
  setPin: (unit: string, role: 'spg' | 'tl', pin: string) => rpc<void>('modis_f1_set_pin', { p_unit: unit, p_role: role, p_pin: pin }),
  exportRange: (from: string, to: string) => rpc<any[]>('modis_f1_export', { p_from: from, p_to: to }),
  resolve: (id: string, ok: boolean, note?: string) => rpc<void>('modis_f1_resolve', { p_id: id, p_ok: ok, p_note: note || null }),
  // Fase 2
  issue: (token: string, p: { id: string; at: string; category: string; note: string; poi_location?: string }) =>
    rpc<void>('modis_f1_issue', { p_token: token, p }),
  issueResolve: (id: string, note: string) => rpc<void>('modis_f1_issue_resolve', { p_id: id, p_note: note || null }),
  crew: () => rpc<CrewMember[]>('modis_f1_crew', {}),
  crewSave: (items: CrewMember[]) => rpc<void>('modis_f1_crew_save', { p_items: items }),
  pois: () => rpc<PoiItem[]>('modis_f1_pois', {}),
  jadwal: () => rpc<Jadwal | null>('modis_f1_jadwal', {}),
  plotting: () => rpc<{ days: Record<string, string[]>; updated_at?: string } | null>('modis_f1_plotting', {}),
  poisSave: (items: (PoiItem & { active?: boolean })[]) => rpc<void>('modis_f1_pois_save', { p_items: items }),
  warehouse: (day: string, unit: string, kind: 'in' | 'out' | 'return', items: Record<string, number>, note: string) =>
    rpc<void>('modis_f1_warehouse', { p_day: day, p_unit: unit, p_kind: kind, p_items: items, p_note: note || null }),
  warehouseDelete: (id: number) => rpc<void>('modis_f1_warehouse_delete', { p_id: id }),
  setSetting: (key: 'pool_mix' | 'program' | 'welcome' | 'plotting' | 'jadwal', value: unknown) => rpc<void>('modis_f1_set_setting', { p_key: key, p_value: value }),
  admins: () => rpc<{ user_id: string; email: string; role: 'owner' | 'client'; is_me: boolean }[]>('modis_f1_admins', {}),
  adminAdd: (email: string, role: 'owner' | 'client') => rpc<void>('modis_f1_admin_add', { p_email: email, p_role: role }),
  adminRemove: (userId: string) => rpc<void>('modis_f1_admin_remove', { p_user: userId }),
  purgePersonal: (before: string) => rpc<{ rows: number; photos: string[] }>('modis_f1_purge_personal', { p_before: before }),
  clearPhotoPaths: (paths: string[]) => rpc<void>('modis_f1_clear_photo_paths', { p_paths: paths }),
  async deletePhotos(paths: string[]) {
    const sb = getSupabaseClient();
    if (!sb || !paths.length) return;
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await sb.storage.from('modis-proof').remove(chunk);
      if (error) throw new FieldError(error.message, 'storage');
      await rpc<void>('modis_f1_clear_photo_paths', { p_paths: chunk });
    }
  },
  async signedPhoto(path: string) {
    const sb = getSupabaseClient();
    if (!sb) return null;
    const { data } = await sb.storage.from('modis-proof').createSignedUrl(path, 600);
    return data?.signedUrl || null;
  },
  async uploadPhoto(path: string, blob: Blob) {
    const sb = getSupabaseClient();
    if (!sb) throw new FieldError('Server belum dikonfigurasi');
    const { error } = await sb.storage.from('modis-proof').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error && !/exists|Duplicate/i.test(error.message)) throw new FieldError(error.message, 'storage');
  },
};

export interface UnitToday {
  day: string;
  by_type: Partial<Record<ConvType, number>>;
  by_reward: Partial<Record<Reward, number>>;
  photobooth: number;
  conflicts: number;
  stock: Record<string, number>;
  by_hour?: Record<string, number>;
  by_merch?: Record<string, number>;
  pool_mix?: Record<string, number> | null;
  prev_closing?: Record<string, number> | null;
  wh_today?: Record<string, number> | null;
  welcome?: WelcomeCfg | null;
  open_issues?: number;
}

export interface CrewMember {
  unit_id: string;
  name: string;
  role: Role;
}
export interface PoiItem {
  name: string;
  category: 'Station' | 'Campus' | 'Office' | 'HOP & Public Space';
}

export const ISSUE_CATEGORIES = [
  'Stok habis / kurang',
  'Tablet / aplikasi',
  'Sinyal / internet',
  'Venue / izin lokasi',
  'Customer komplain',
  'Gacha / mesin',
  'Crew / jadwal',
  'Lainnya',
] as const;

/** Rencana kapsul per hari per unit (pool mix). Bisa diubah office. */
export const POOL_ITEMS = ['kapsul_candy', 'kapsul_c', 'kapsul_b', 'kapsul_a'] as const;

// ---------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------
export const TYPE_LABEL: Record<ConvType, string> = {
  pahe_new: 'PaHe New',
  pahe_lapsed: 'PaHe Churned',
  gb_hemat: 'GB Hemat ride',
};

export const REWARD_LABEL: Record<Reward, string> = {
  snack: 'Welcome snack',
  drink: 'Welcome drink',
  candy: 'Kupon candy',
  tier_c: 'Kupon Tier C',
  tier_b: 'Kupon Tier B',
  tier_a: 'Kupon Tier A',
  golden: 'Golden coupon',
  none: 'Tanpa reward',
};

export const CONSENT_VER = 'f1-2026-10d';
export const CONSENT_TEXT =
  'Customer setuju nama, nomor HP, dan jumlah order GrabBike Hemat 30 hari terakhir dicatat dan dibagikan kepada Grab untuk program Grab MODIS (cek klaim reward, informasi promo, peringkat hadiah utama, dan laporan program). Data dihapus 90 hari setelah program selesai. Sesuai UU PDP.';

/** Target harian per unit: 600 per hari (58.800 / 98 hari, [EXT] Daily Report) dibagi 3 unit */
export const DAILY_TARGET_PER_UNIT = 200;
export const DAILY_TARGET = 600;

// ---------------------------------------------------------------------
// Stok unit (SOP 6)
// ---------------------------------------------------------------------
export type StockKind = 'opening' | 'refill' | 'closing';

/** Item merch per tier ([EXT] Merch & Reward, menunggu konfirmasi Grab). */
export const MERCH: Record<'tier_c' | 'tier_b' | 'tier_a', { id: string; label: string }[]> = {
  tier_c: [
    { id: 'c_keychain', label: 'Acrylic keychain' },
    { id: 'c_sticker', label: 'Sticker pack (3 desain)' },
    { id: 'c_pen', label: 'Pen branding' },
  ],
  tier_b: [
    { id: 'b_tote', label: 'Tote bag' },
    { id: 'b_pouch', label: 'Travel pouch' },
    { id: 'b_lanyard', label: 'Lanyard' },
  ],
  tier_a: [
    { id: 'a_umbrella', label: 'Payung lipat' },
    { id: 'a_tumbler', label: 'Egg tumbler' },
    { id: 'a_fan', label: 'Mini fan USB' },
  ],
};
/** Label hadiah utama lama (hanya untuk data historis); pemenang kini ditentukan Grab lewat Peringkat GrabBike Hemat. */
export const HEADLINE_PRIZES = [
  { id: 'h_phone', label: 'Smartphone Samsung', group: 'main' as const },
  { id: 'h_gold', label: 'Emas Antam 0,5 g', group: 'main' as const },
  { id: 'h_tws', label: 'TWS', group: 'support' as const },
  { id: 'h_powerbank', label: 'Powerbank 10.000 mAh', group: 'support' as const },
  { id: 'h_watch', label: 'Smartwatch', group: 'support' as const },
];

/** Welcome item PaHe. Satu snack per minggu kampanye, bergantian mengikuti rotasi (default Roti, Pisang, Telur). */
export const WELCOME_SNACKS = [
  { id: 'w_roti', label: 'Roti' },
  { id: 'w_pisang', label: 'Pisang' },
  { id: 'w_telur', label: 'Telur' },
];
export const WELCOME_DRINKS = [
  { id: 'w_caffino', label: 'Caffino' },
  { id: 'w_isoplus', label: 'Isoplus' },
  { id: 'w_nobo', label: 'Nobo Milk' },
];
/** Satu baris peringkat GrabBike Hemat (entri terakhir per nomor HP). */
export type LbRow = { rank: number; name: string; last4: string | null; gb30: number; day: string; unit: string; poi: string | null; spg: string | null; entries: number; phone?: string | null };
export const CAMPAIGN_START = '2026-10-26';
/**
 * Welcome snack: Roti selalu ada setiap hari. Seminggu sekali ada "hari menu lengkap" (Roti + Pisang + Telur)
 * yang ditentukan manual oleh office: every_dow = hari ke-n (1=Senin ... 7=Minggu) untuk semua minggu,
 * weeks = pengecualian per nomor minggu (0 = minggu itu tidak ada hari menu lengkap).
 */
export type WelcomeCfg = { every_dow?: number | null; weeks?: Record<string, number>; rotation?: string[] };
export const DOW_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
/** Minggu ke-n campaign (mulai Senin 26 Okt). Sebelum mulai dianggap minggu 1. */
export const campaignWeek = (day: string) => Math.max(1, Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${CAMPAIGN_START}T00:00:00Z`)) / (7 * 86400000)) + 1);
/** Hari ke-n dalam minggu (1=Senin ... 7=Minggu) untuk tanggal YYYY-MM-DD. */
export const isoDow = (day: string) => ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
/** Hari menu lengkap (Roti + Pisang + Telur) pada tanggal ini? */
export const isFullMenuDay = (day: string, cfg?: WelcomeCfg | null) => {
  const w = cfg?.weeks?.[String(campaignWeek(day))];
  const target = w !== undefined ? w : cfg?.every_dow ?? 0;
  return Boolean(target) && target === isoDow(day);
};
/** Snack yang tersedia pada tanggal ini. */
export const snacksFor = (day: string, cfg?: WelcomeCfg | null) => (isFullMenuDay(day, cfg) ? WELCOME_SNACKS.map((w) => w.id) : ['w_roti']);

export const merchLabel = (id?: string | null) =>
  !id ? '' : [...MERCH.tier_c, ...MERCH.tier_b, ...MERCH.tier_a, ...HEADLINE_PRIZES, ...WELCOME_SNACKS, ...WELCOME_DRINKS].find((m) => m.id === id)?.label || id;

/** Stok unit, mengikuti tab Stock & Gudang [INT]. perDay = rencana per unit per hari. */
export const STOCK_ITEMS: { id: string; label: string; group: string; perDay: number | null }[] = [
  ...WELCOME_SNACKS.map((w) => ({ id: w.id, label: `Snack ${w.label}`, group: 'Welcome', perDay: null })),
  ...WELCOME_DRINKS.map((w) => ({ id: w.id, label: `Minuman ${w.label}`, group: 'Welcome', perDay: null })),
  { id: 'kapsul_candy', label: 'Kupon kapsul Candy', group: 'Kupon di mesin', perDay: 34 },
  { id: 'kapsul_c', label: 'Kupon kapsul Tier C', group: 'Kupon di mesin', perDay: 34 },
  { id: 'kapsul_b', label: 'Kupon kapsul Tier B', group: 'Kupon di mesin', perDay: 17 },
  { id: 'kapsul_a', label: 'Kupon kapsul Tier A', group: 'Kupon di mesin', perDay: 3 },
  ...MERCH.tier_c.map((m) => ({ id: m.id, label: `Tier C ${m.label}`, group: 'Hadiah di meja', perDay: 12 })),
  ...MERCH.tier_b.map((m) => ({ id: m.id, label: `Tier B ${m.label}`, group: 'Hadiah di meja', perDay: 6 })),
  ...MERCH.tier_a.map((m) => ({ id: m.id, label: `Tier A ${m.label}`, group: 'Hadiah di meja', perDay: 1 })),
  { id: 'candy_pcs', label: 'Candy (pcs)', group: 'Lainnya', perDay: 170 },
  { id: 'kertas_foto', label: 'Kertas photobooth', group: 'Lainnya', perDay: null },
];

/** Sementara (sebelum angka stok final): opening diisi manual penuh oleh TL, tanpa isi otomatis & tanpa patokan SOP. Ubah ke false untuk mengaktifkan lagi. */
export const OPENING_MANUAL_ONLY = true;

/** Isi otomatis opening: closing terakhir + kiriman gudang hari ini; bila belum ada data, saran SOP (Pagi 100 snack + 35 minuman, Siang 70/70, Sore/Malam sebaliknya dari Pagi). */
export const openingDefault = (
  shift: Shift,
  mix?: Record<string, number> | null,
  opts?: { day?: string; welcome?: WelcomeCfg | null; prevClosing?: Record<string, number> | null; whToday?: Record<string, number> | null },
): Record<string, number> => {
  const m = (k: string, d: number) => (mix && Number.isFinite(mix[k]) ? Number(mix[k]) : d);
  const c = m('kapsul_c', 34);
  const b = m('kapsul_b', 17);
  const a = m('kapsul_a', 3);
  const split = (n: number, ids: { id: string }[]) => Object.fromEntries(ids.map((x, i) => [x.id, Math.floor(n / ids.length) + (i < n % ids.length ? 1 : 0)]));
  const snackTotal = shift === 'AM' ? 100 : shift === 'MID' ? 70 : 35;
  const drinkTotal = shift === 'AM' ? 35 : shift === 'MID' ? 70 : 100;
  const snacks = snacksFor(opts?.day || new Date().toISOString().slice(0, 10), opts?.welcome);
  const plan: Record<string, number> = {
    ...split(snackTotal, snacks.map((id) => ({ id }))),
    ...split(drinkTotal, WELCOME_DRINKS),
    kapsul_candy: m('kapsul_candy', 34),
    kapsul_c: c,
    kapsul_b: b,
    kapsul_a: a,
    ...split(c, MERCH.tier_c),
    ...split(b, MERCH.tier_b),
    ...split(a, MERCH.tier_a),
    candy_pcs: m('kapsul_candy', 34) * 5,
  };
  // Bila ada closing kemarin, opening = sisa kemarin (barang yang menginap di unit)
  // + kiriman gudang hari ini untuk unit ini (dicatat office di dashboard)
  const prev = opts?.prevClosing;
  const wh = opts?.whToday || {};
  const hasPrev = Boolean(prev && Object.keys(prev).length);
  const hasWh = Object.keys(wh).length > 0;
  if (!hasPrev && !hasWh) return plan;
  return Object.fromEntries(
    STOCK_ITEMS.map((it) => [it.id, Math.max(0, (hasPrev ? prev![it.id] ?? 0 : 0) + (wh[it.id] ?? 0))]).filter(([, v]) => (v as number) > 0),
  );
};

/** Pemakaian menurut app dari reward yang diinput dan item yang dipilih (welcome, merch). */
export function usageFromRewards(r: Partial<Record<Reward, number>>, merch: Record<string, number> = {}, photobooth = 0): Record<string, number> {
  const n = (k: Reward) => r[k] || 0;
  const out: Record<string, number> = {
    kapsul_candy: n('candy'),
    kapsul_c: n('tier_c'),
    kapsul_b: n('tier_b'),
    kapsul_a: n('tier_a'),
    candy_pcs: n('candy') * 5,
    kertas_foto: photobooth,
  };
  [...WELCOME_SNACKS, ...WELCOME_DRINKS, ...MERCH.tier_c, ...MERCH.tier_b, ...MERCH.tier_a].forEach((m) => (out[m.id] = merch[m.id] || 0));
  return out;
}
