import { ConvType, CrewMember, FieldSession, PoiItem, Reward, StockKind, SubmitPayload, fieldApi, isNetworkError, saveJadwalCache } from './api';

/**
 * Penyimpanan di tablet:
 * - sesi shift (localStorage)
 * - antrean conversion + foto (IndexedDB) → dikirim otomatis saat ada sinyal
 * - cache hash nomor yang sudah klaim (cek double claim saat offline)
 * - riwayat ringkas shift ini (tanpa nomor HP lengkap) untuk progres di layar
 */

const SESSION_KEY = 'modis_f1_session';
const CLAIMS_KEY = 'modis_f1_claims';
const LOG_KEY = 'modis_f1_log';
const CONTACTS_KEY = 'modis_f1_contacts';

export const todayWIB = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
export const nowHHMM = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });

const readJson = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const writeJson = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* penuh */
  }
};

// ---------------------------------------------------------------------
// Sesi
// ---------------------------------------------------------------------
export const getSession = (): FieldSession | null => readJson<FieldSession | null>(SESSION_KEY, null);
export const saveSession = (s: FieldSession | null) => (s ? writeJson(SESSION_KEY, s) : localStorage.removeItem(SESSION_KEY));
/** Token habis setelah 12 jam, tapi input offline tetap boleh selama belum logout (spec 6). */
export const sessionExpired = (s: FieldSession) => new Date(s.expires_at).getTime() < Date.now();

// ---------------------------------------------------------------------
// Nomor & hash
// ---------------------------------------------------------------------
/** 08xx / 8xx / 628xx / +628xx → 628xxxxxxxx (10–13 digit lokal). '' bila tidak valid. */
export function normalizePhone62(raw: string): string {
  let d = (raw || '').replace(/[^0-9]/g, '');
  if (d.startsWith('62')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^8[0-9]{8,11}$/.test(d)) return '';
  return `62${d}`;
}

export async function phoneHash16(phone62: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`modis|${phone62}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

interface ClaimCache {
  day: string;
  pahe: string[];
  gb: string[];
  at: string;
}
export const getClaimCache = (): ClaimCache => {
  const c = readJson<ClaimCache>(CLAIMS_KEY, { day: todayWIB(), pahe: [], gb: [], at: '' });
  // GB Hemat berlaku per hari
  return c.day === todayWIB() ? c : { ...c, day: todayWIB(), gb: [] };
};
export const saveClaimCache = (c: ClaimCache) => writeJson(CLAIMS_KEY, c);

export async function refreshClaimCache(token: string) {
  const r = await fieldApi.claimCache(token);
  const local = getClaimCache();
  saveClaimCache({
    day: r.day,
    pahe: Array.from(new Set([...r.pahe, ...local.pahe])),
    gb: r.day === local.day ? Array.from(new Set([...r.gb, ...local.gb])) : r.gb,
    at: new Date().toISOString(),
  });
}

export async function rememberClaim(phone62: string, type: ConvType) {
  const h = await phoneHash16(phone62);
  const c = getClaimCache();
  if (type === 'gb_hemat') c.gb = Array.from(new Set([...c.gb, h]));
  else c.pahe = Array.from(new Set([...c.pahe, h]));
  saveClaimCache(c);
}

export async function localClaimStatus(phone62: string): Promise<{ pahe: boolean; gb: boolean }> {
  const h = await phoneHash16(phone62);
  const c = getClaimCache();
  return { pahe: c.pahe.includes(h), gb: c.gb.includes(h) };
}

// ---------------------------------------------------------------------
// Riwayat ringkas (tanpa nomor lengkap) untuk progres shift & close day
// ---------------------------------------------------------------------
export interface LogEntry {
  id: string;
  at: string;
  day: string;
  unit_id: string;
  shift: string;
  spg: string;
  name: string;
  last4: string;
  type: ConvType;
  reward: Reward;
  reward2?: Reward;
  merch?: string;
  merch2?: string;
  prize?: string;
  photobooth: boolean;
  extra_draw: boolean;
  status: 'queued' | 'ok' | 'conflict';
  note?: string;
  poi?: string;
}
export const getLog = (): LogEntry[] => readJson<LogEntry[]>(LOG_KEY, []).filter((e) => e.day >= addDaysKey(todayWIB(), -2));
const saveLog = (l: LogEntry[]) => writeJson(LOG_KEY, l.slice(-1500));
export const updateLog = (id: string, patch: Partial<LogEntry>) => saveLog(getLog().map((e) => (e.id === id ? { ...e, ...patch } : e)));

// Satu orang = satu data: submission dengan nama + 4 digit nomor yang sama digabung (mis. PaHe New + GB Hemat).
// Dipakai untuk daftar "Input terakhir" dan hitungan orang; stok/reward tetap dihitung per submission.
export interface PersonGroup {
  key: string;
  name: string;
  last4: string;
  at: string;
  type: ConvType; // tipe utama: PaHe New > PaHe Churned > GB Hemat
  entries: LogEntry[];
  status: LogEntry['status'];
}
const TYPE_PRIORITY: ConvType[] = ['pahe_new', 'pahe_lapsed', 'gb_hemat'];
export function groupPeople(log: LogEntry[]): PersonGroup[] {
  const m = new Map<string, PersonGroup>();
  for (const e of [...log].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = `${e.name.trim().toLowerCase().replace(/\s+/g, ' ')}|${e.last4}`;
    const g = m.get(key);
    if (!g) m.set(key, { key, name: e.name, last4: e.last4, at: e.at, type: e.type, entries: [e], status: e.status });
    else {
      g.entries.push(e);
      g.at = e.at;
      if (TYPE_PRIORITY.indexOf(e.type) < TYPE_PRIORITY.indexOf(g.type)) g.type = e.type;
      g.status = g.entries.some((x) => x.status === 'conflict') ? 'conflict' : g.entries.some((x) => x.status === 'queued') ? 'queued' : 'ok';
    }
  }
  return [...m.values()];
}

export function addDaysKey(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Contact = setiap Cek Boros yang dijalankan SPG Host (dihitung otomatis per unit per hari)
export const getContacts = (unit: string, day = todayWIB()): number => readJson<Record<string, number>>(CONTACTS_KEY, {})[`${unit}|${day}`] || 0;
export const addContact = (unit: string) => {
  const all = readJson<Record<string, number>>(CONTACTS_KEY, {});
  const k = `${unit}|${todayWIB()}`;
  all[k] = (all[k] || 0) + 1;
  writeJson(CONTACTS_KEY, all);
};

// ---------------------------------------------------------------------
// Antrean IndexedDB
// ---------------------------------------------------------------------
interface QueueItem {
  id: string;
  token: string;
  payload: SubmitPayload | null; // dikosongkan (nomor HP dihapus) setelah terkirim
  photo: Blob | null;
  photoPath: string;
  recordDone: boolean;
  photoDone: boolean;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

const DB = 'modis_field_v1';
const STORE = 'queue';
let dbp: Promise<IDBDatabase> | null = null;
const db = () =>
  (dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const allItems = () => tx<QueueItem[]>('readonly', (s) => s.getAll() as IDBRequest<QueueItem[]>);
const putItem = (it: QueueItem) => tx('readwrite', (s) => s.put(it));
const delItem = (id: string) => tx('readwrite', (s) => s.delete(id));

export const newId = () => `c_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;

/** Simpan satu conversion: langsung masuk antrean (aman offline), lalu coba kirim. */
export async function enqueueConversion(session: FieldSession, p: SubmitPayload, photo: Blob | null) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(p.created_at));
  const item: QueueItem = {
    id: p.id,
    token: session.token,
    payload: p,
    photo,
    photoPath: photo ? `proof/${day}/${p.id}.jpg` : '',
    recordDone: false,
    photoDone: !photo, // input susulan boleh tanpa foto (foto ada di Google Form)
    attempts: 0,
    createdAt: p.created_at,
  };
  await putItem(item);
  const log = getLog();
  log.push({
    id: p.id,
    at: p.created_at,
    day,
    unit_id: session.unit_id,
    shift: p.shift || session.shift,
    spg: p.spg_name || session.spg_name,
    name: p.name,
    last4: p.phone.slice(-4),
    type: p.type,
    reward: p.reward,
    reward2: p.reward2,
    merch: p.merch,
    merch2: p.merch2,
    prize: p.prize,
    photobooth: p.photobooth,
    extra_draw: p.extra_draw,
    status: 'queued',
    poi: p.poi_location,
  });
  saveLog(log);
  await rememberClaim(p.phone, p.type);
  notify();
}

export async function pendingCounts(): Promise<{ records: number; photos: number }> {
  const ops = getOps().filter((o) => !o.sent).length;
  try {
    const items = await allItems();
    return { records: items.filter((i) => !i.recordDone).length + ops, photos: items.filter((i) => !i.photoDone).length };
  } catch {
    return { records: ops, photos: 0 };
  }
}

// ---------------------------------------------------------------------
// Operasi TL (stok, close day): antre di tablet, dikirim saat ada sinyal
// ---------------------------------------------------------------------
const OPS_KEY = 'modis_f1_ops';
export interface TlOp {
  op: string;
  token: string;
  unit_id: string;
  day: string;
  shift: string;
  by: string;
  at: string;
  kind: StockKind | 'close' | 'issue' | 'boros' | 'gb30';
  items?: Record<string, number>;
  boros?: Record<string, unknown>;
  gb30?: Record<string, unknown>;
  close?: Record<string, unknown>;
  issue?: { category: string; note: string; poi_location?: string };
  sent: boolean;
  error?: string;
}
export const getOps = (): TlOp[] => readJson<TlOp[]>(OPS_KEY, []).filter((o) => o.day >= addDaysKey(todayWIB(), -3));
const saveOps = (o: TlOp[]) => writeJson(OPS_KEY, o.slice(-300));
export function enqueueOp(
  session: FieldSession,
  kind: TlOp['kind'],
  data: { items?: Record<string, number>; close?: Record<string, unknown>; issue?: TlOp['issue']; boros?: Record<string, unknown>; gb30?: Record<string, unknown> },
) {
  const op: TlOp = {
    op: newId().replace('c_', 'op_'),
    token: session.token,
    unit_id: session.unit_id,
    day: todayWIB(),
    shift: session.shift,
    by: session.spg_name,
    at: new Date().toISOString(),
    kind,
    ...data,
    sent: false,
  };
  saveOps([...getOps(), op]);
  notify();
  void syncQueue();
  return op;
}

let syncing = false;
/** Kirim antrean: record dulu, foto belakangan (spec 6). */
export async function syncQueue(): Promise<{ sent: number; failed: number }> {
  if (syncing || !navigator.onLine) return { sent: 0, failed: 0 };
  syncing = true;
  let sent = 0;
  let failed = 0;
  try {
    const items = (await allItems()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const it of items.filter((i) => !i.recordDone && i.payload)) {
      try {
        const r = await fieldApi.submit(it.token, it.payload!);
        it.recordDone = true;
        it.payload = null; // nomor HP tidak disimpan lagi di tablet
        it.lastError = undefined;
        updateLog(it.id, { status: r.status === 'conflict' ? 'conflict' : 'ok', note: r.note });
        sent++;
        if (it.photoDone) {
          await delItem(it.id);
          continue;
        }
      } catch (e: any) {
        it.attempts++;
        it.lastError = String(e?.message || e);
        failed++;
        if (isNetworkError(e)) {
          await putItem(it);
          break; // sinyal putus, coba lagi nanti
        }
      }
      await putItem(it);
    }
    // Operasi TL
    for (const o of getOps().filter((x) => !x.sent)) {
      try {
        if (o.kind === 'close') await fieldApi.closeDay(o.token, o.close || {});
        else if (o.kind === 'boros') await fieldApi.boros(o.token, { ...(o.boros || {}), op: o.op });
        else if (o.kind === 'gb30') await fieldApi.gb30(o.token, { ...(o.gb30 || {}), op: o.op });
        else if (o.kind === 'issue') await fieldApi.issue(o.token, { id: o.op, at: o.at, category: o.issue?.category || 'Lainnya', note: o.issue?.note || '', poi_location: o.issue?.poi_location });
        else await fieldApi.stock(o.token, o.kind, o.items || {}, o.op);
        saveOps(getOps().map((x) => (x.op === o.op ? { ...x, sent: true, error: undefined } : x)));
      } catch (e: any) {
        // Cek Boros bukan data wajib: bila ditolak server (bukan masalah sinyal), jangan menumpuk di antrean
        const drop = o.kind === 'boros' && !isNetworkError(e);
        saveOps(getOps().map((x) => (x.op === o.op ? { ...x, sent: drop ? true : x.sent, error: String(e?.message || e) } : x)));
        if (isNetworkError(e)) break;
      }
    }
    for (const it of (await allItems()).filter((i) => i.recordDone && !i.photoDone)) {
      try {
        if (it.photo) await fieldApi.uploadPhoto(it.photoPath, it.photo);
        await fieldApi.attachPhoto(it.token, it.id, it.photoPath);
        await delItem(it.id); // selesai: record + foto terkirim
      } catch (e: any) {
        it.attempts++;
        it.lastError = String(e?.message || e);
        await putItem(it);
        if (isNetworkError(e)) break;
      }
    }
  } finally {
    syncing = false;
    notify();
  }
  return { sent, failed };
}

// Pemberitahuan perubahan antrean ke layar
const listeners = new Set<() => void>();
export const onQueueChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function notify() {
  listeners.forEach((f) => f());
}

/** Sync otomatis: saat online kembali, saat tab aktif, dan tiap 30 detik. */
export function startAutoSync() {
  const run = () => void syncQueue();
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run());
  const t = window.setInterval(run, 30_000);
  run();
  return () => {
    window.removeEventListener('online', run);
    window.clearInterval(t);
  };
}

// ---------------------------------------------------------------------
// Data master dari office (nama crew & venue), disimpan di tablet untuk offline
// ---------------------------------------------------------------------
const CREW_KEY = 'modis_f1_crew';
const POI_KEY = 'modis_f1_pois';
export const getCrewCache = (): CrewMember[] => readJson<CrewMember[]>(CREW_KEY, []);
export const getPoiCache = (): PoiItem[] => readJson<PoiItem[]>(POI_KEY, []);
export async function refreshMasters(): Promise<void> {
  if (!navigator.onLine) return;
  const [crew, pois, plot, jad] = await Promise.allSettled([fieldApi.crew(), fieldApi.pois(), fieldApi.plotting(), fieldApi.jadwal()]);
  if (jad.status === 'fulfilled' && jad.value && typeof jad.value === 'object') saveJadwalCache(jad.value);
  if (crew.status === 'fulfilled' && Array.isArray(crew.value)) writeJson(CREW_KEY, crew.value);
  if (pois.status === 'fulfilled' && Array.isArray(pois.value)) writeJson(POI_KEY, pois.value);
  if (plot.status === 'fulfilled' && plot.value && typeof plot.value === 'object' && plot.value.days) writeJson(PLOT_KEY, plot.value.days);
}

const PLOT_KEY = 'modis_f1_plotting';
/** Plotting terbaru dari office (tab Plotting), atau null (pakai snapshot bawaan). */
export function getPlottingCache(): Record<string, string[]> | null {
  try {
    return JSON.parse(localStorage.getItem(PLOT_KEY) || 'null');
  } catch {
    return null;
  }
}
