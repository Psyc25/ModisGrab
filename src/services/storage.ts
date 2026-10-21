import { SPGConfig, VisitorRecord, MerchInventoryItem } from '../types';
import {
  sendVisitorToSupabase,
  lookupVisitorRemote,
  fetchMerchRemote,
} from './supabase';
import { enqueueVisitorForSync, removeQueuedVisitor } from './indexedDb';
import { isNetworkOnline } from './queuedSync';
import { MAX_STAMPS } from '../config/campaign';

const SPG_CONFIG_KEY = 'modis_spg_config';
const VISITORS_KEY = 'modis_visitors_records';
const MERCH_CACHE_KEY = 'modis_merch_cache';
const SPG_PIN_HASH_KEY = 'modis_spg_pin_hash';
const DEVICE_ID_KEY = 'modis_device_id';

// ---------------------------------------------------------------------
// Utilitas
// ---------------------------------------------------------------------
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Normalisasi nomor ke format +628xxxxxxxxx. Mengembalikan '' bila tidak valid. */
export function normalizePhone(raw: string): string {
  let digits = (raw || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('62')) digits = digits.substring(2);
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!/^8[0-9]{7,11}$/.test(digits)) return '';
  return `+62${digits}`;
}

export function maskPhone(phone: string): string {
  if (!phone) return '-';
  const d = phone.replace(/[^0-9+]/g, '');
  if (d.length < 8) return '••••';
  return `${d.slice(0, 6)}••••${d.slice(-3)}`;
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev_unknown';
  }
}

// ---------------------------------------------------------------------
// PIN SPG (untuk memberi stamp di layar visitor)
// ---------------------------------------------------------------------
export function hasSpgPin(): boolean {
  try {
    return Boolean(localStorage.getItem(SPG_PIN_HASH_KEY));
  } catch {
    return false;
  }
}

export async function setSpgPin(newPin: string): Promise<boolean> {
  if (!/^[0-9]{4,8}$/.test(newPin.trim())) return false;
  try {
    localStorage.setItem(SPG_PIN_HASH_KEY, await sha256(`modis-spg:${newPin.trim()}`));
    return true;
  } catch {
    return false;
  }
}

export async function verifySpgPin(pin: string): Promise<boolean> {
  try {
    const stored = localStorage.getItem(SPG_PIN_HASH_KEY);
    if (!stored) return false;
    return stored === (await sha256(`modis-spg:${pin.trim()}`));
  } catch {
    return false;
  }
}

export function clearSpgPin(): void {
  try {
    localStorage.removeItem(SPG_PIN_HASH_KEY);
  } catch {
    /* abaikan */
  }
}

// ---------------------------------------------------------------------
// Merchandise (stok bersama di Supabase, cache lokal untuk tampilan offline)
// ---------------------------------------------------------------------
export const DEFAULT_MERCH_INVENTORY: MerchInventoryItem[] = [
  { id: 'sarapan_kopi', name: 'Sarapan Gratis (Kopi / Pisang)', category: 'Sarapan', stock: 50, initialStock: 50, probabilityWeight: 40 },
  { id: 'voucher_saldo', name: 'Voucher Saldo Grab Rp15rb', category: 'Merchandise', stock: 30, initialStock: 30, probabilityWeight: 25 },
  { id: 'tote_bag', name: 'Tote Bag Canvas MODIS', category: 'Merchandise', stock: 25, initialStock: 25, probabilityWeight: 18 },
  { id: 'mini_fan', name: 'Portable Mini Fan Grab', category: 'Merchandise', stock: 15, initialStock: 15, probabilityWeight: 12 },
  { id: 'tumbler_grab', name: 'Tumbler Stainless Eksklusif Grab', category: 'Grand Prize', stock: 10, initialStock: 10, probabilityWeight: 5 },
];

export function getCachedMerchInventory(): MerchInventoryItem[] {
  try {
    const raw = localStorage.getItem(MERCH_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* abaikan */
  }
  return DEFAULT_MERCH_INVENTORY;
}

export function cacheMerchInventory(items: MerchInventoryItem[]): void {
  try {
    localStorage.setItem(MERCH_CACHE_KEY, JSON.stringify(items));
  } catch {
    /* abaikan */
  }
}

/** Ambil stok terbaru dari server; bila offline pakai cache terakhir. */
export async function loadMerchInventory(): Promise<{ items: MerchInventoryItem[]; live: boolean }> {
  const remote = isNetworkOnline() ? await fetchMerchRemote() : null;
  if (remote && remote.length > 0) {
    cacheMerchInventory(remote);
    return { items: remote, live: true };
  }
  return { items: getCachedMerchInventory(), live: false };
}

// ---------------------------------------------------------------------
// Cek visitor ulang
// ---------------------------------------------------------------------
export interface VisitorLookup {
  found: boolean;
  previousStamps: number;
  claimedToday: boolean;
  totalVisits: number;
  source: 'server' | 'perangkat' | 'none';
}

/** Gabungan: server (lintas lokasi) bila online, data perangkat ini bila offline. */
export async function lookupVisitorByPhone(rawPhone: string): Promise<VisitorLookup> {
  const phone = normalizePhone(rawPhone);
  const none: VisitorLookup = { found: false, previousStamps: 0, claimedToday: false, totalVisits: 0, source: 'none' };
  if (!phone) return none;

  // Data perangkat (termasuk yang belum terkirim)
  const hash = await sha256(phone);
  const todayStr = new Date().toDateString();
  const localMatches = getLocalVisitors().filter((r) => r.phoneHash === hash);
  const local = {
    found: localMatches.length > 0,
    previousStamps: localMatches.reduce((m, r) => Math.max(m, Number(r.stampsCount) || 0), 0),
    totalVisits: localMatches.length,
    // Stamp sudah diberikan hari ini (aturan 1 stamp per nomor per hari)
    claimedToday: localMatches.some((r) => new Date(r.created_at).toDateString() === todayStr && Boolean(r.rewardClaimed)),
  };

  if (isNetworkOnline()) {
    const remote = await lookupVisitorRemote(phone);
    if (remote.ok) {
      // Tambahkan kunjungan lokal yang belum tersinkron
      const unsynced = localMatches.filter((r) => !r.syncedToSupabase);
      const found = remote.found || unsynced.length > 0;
      return {
        found,
        previousStamps: Math.max(remote.previousStamps, ...unsynced.map((r) => Number(r.stampsCount) || 0), 0),
        totalVisits: remote.totalVisits + unsynced.length,
        claimedToday: remote.claimedToday || unsynced.some((r) => new Date(r.created_at).toDateString() === todayStr && Boolean(r.rewardClaimed)),
        source: found ? 'server' : 'none',
      };
    }
  }

  return local.found ? { ...local, source: 'perangkat' } : none;
}

// ---------------------------------------------------------------------
// Konfigurasi SPG
// ---------------------------------------------------------------------
export const DEFAULT_SPG_CONFIG: SPGConfig = {
  poiLocation: 'St. Sudirman',
  poiCategory: 'Station',
  unitType: 'Mobil Diskon',
  spgName: '',
  dutyStart: '06:30',
  dutyEnd: '09:30',
  dutyDate: '',
  targetLeadsPerShift: 75,
};

/** Tanggal hari ini (YYYY-MM-DD) menurut jam perangkat. */
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Isi cepat jam jaga, mengikuti slot di Running Schedule (Mobil 3 slot, Kiosk seharian). */
export const DUTY_PRESETS: { label: string; start: string; end: string }[] = [
  { label: 'Pagi', start: '06:30', end: '09:30' },
  { label: 'Siang', start: '11:00', end: '14:00' },
  { label: 'Sore/Malam', start: '16:30', end: '20:00' },
  { label: 'Seharian', start: '10:00', end: '20:00' },
];

export function dutyHoursLabel(cfg: Pick<SPGConfig, 'dutyStart' | 'dutyEnd'>): string {
  return cfg.dutyStart && cfg.dutyEnd ? `${cfg.dutyStart.replace(':', '.')}–${cfg.dutyEnd.replace(':', '.')}` : '';
}

/** Tugas jaga dianggap aktif bila nama SPG terisi dan tugas dimulai hari ini. */
export function isDutyActive(cfg: SPGConfig): boolean {
  return Boolean(cfg.spgName.trim()) && cfg.dutyDate === todayKey();
}

export function getSPGConfig(): SPGConfig {
  try {
    const raw = localStorage.getItem(SPG_CONFIG_KEY);
    if (raw) {
      const cfg = { ...DEFAULT_SPG_CONFIG, ...JSON.parse(raw) } as SPGConfig;
      // Unit lama (sebelum mengikuti Running Schedule) dipaksa pilih ulang lewat layar mulai tugas.
      if (!['Mobil Diskon', 'Kiosk 1', 'Kiosk 2'].includes(cfg.unitType)) return { ...cfg, unitType: 'Mobil Diskon', dutyDate: '' };
      return cfg;
    }
  } catch {
    /* abaikan */
  }
  return DEFAULT_SPG_CONFIG;
}

export function saveSPGConfig(config: SPGConfig): void {
  try {
    localStorage.setItem(SPG_CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* abaikan */
  }
}

// ---------------------------------------------------------------------
// Data visitor di perangkat
// ---------------------------------------------------------------------
type LocalVisitor = VisitorRecord & { phoneHash?: string };

export function getLocalVisitors(): LocalVisitor[] {
  try {
    const raw = localStorage.getItem(VISITORS_KEY);
    if (raw) {
      const records: LocalVisitor[] = JSON.parse(raw);
      return records.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  } catch {
    /* abaikan */
  }
  return [];
}

function writeLocalVisitors(records: LocalVisitor[]): void {
  localStorage.setItem(VISITORS_KEY, JSON.stringify(records));
}

/**
 * Setelah tersimpan di server, hapus nama/email/WA dari perangkat.
 * Tablet di lapangan bisa hilang; data pribadi cukup ada di Supabase.
 */
export function markRecordSynced(id: string): void {
  try {
    const all = getLocalVisitors();
    const target = all.find((r) => r.id === id);
    if (!target) return;
    target.syncedToSupabase = true;
    target.phoneMasked = target.phoneMasked || (target.phoneNumber ? maskPhone(target.phoneNumber) : '');
    target.fullName = target.fullName ? target.fullName.split(' ')[0] : '';
    target.email = '';
    target.phoneNumber = '';
    target.piiPurged = true;
    writeLocalVisitors(all);
  } catch {
    /* abaikan */
  }
}

export async function saveVisitorRecord(
  record: VisitorRecord
): Promise<{ savedLocally: boolean; syncedToSupabase: boolean; error?: string }> {
  let synced = false;
  let syncError = '';
  let permanent = false;

  if (isNetworkOnline()) {
    const res = await sendVisitorToSupabase(record);
    synced = res.success;
    permanent = Boolean(res.permanent);
    if (!res.success) syncError = res.error || 'Gagal sinkron ke Supabase';
  } else {
    syncError = 'Offline • disimpan di antrean perangkat';
  }

  const phoneHash = record.phoneNumber ? await sha256(record.phoneNumber) : undefined;
  const local: LocalVisitor = {
    ...record,
    phoneHash,
    phoneMasked: record.phoneNumber ? maskPhone(record.phoneNumber) : '',
    syncedToSupabase: false,
  };

  try {
    const current = getLocalVisitors().filter((r) => r.id !== record.id);
    writeLocalVisitors([local, ...current]);

    if (synced) {
      markRecordSynced(record.id);
      await removeQueuedVisitor(record.id);
    } else if (!permanent) {
      await enqueueVisitorForSync(local, syncError);
    }

    window.dispatchEvent(new CustomEvent('modis_visitor_saved', { detail: { id: record.id } }));
  } catch (e) {
    console.error('Error saving record locally', e);
    return { savedLocally: false, syncedToSupabase: synced, error: syncError };
  }

  return { savedLocally: true, syncedToSupabase: synced, error: synced ? undefined : syncError };
}

export function deleteLocalVisitorRecord(id: string): void {
  writeLocalVisitors(getLocalVisitors().filter((r) => r.id !== id));
}

/** Hapus data perangkat yang sudah tersimpan di server (mis. akhir shift). */
export function clearSyncedLocalVisitors(): number {
  const all = getLocalVisitors();
  const keep = all.filter((r) => !r.syncedToSupabase);
  writeLocalVisitors(keep);
  return all.length - keep.length;
}

// ---------------------------------------------------------------------
// WhatsApp & format
// ---------------------------------------------------------------------
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('IDR', 'Rp')
    .trim();
}

// ---------------------------------------------------------------------
// Ekspor (admin)
// ---------------------------------------------------------------------
const EXPORT_HEADERS = [
  'No',
  'Tanggal',
  'Jam (WIB)',
  'Nama Lengkap',
  'Nomor WhatsApp',
  'Email',
  'Persetujuan Data',
  'GrabBike / Hari',
  'Ongkos / Trip',
  'Trip / Bulan',
  'Ongkos Normal / Bulan (Rp)',
  'Tarif PAHE / Trip (Rp)',
  'Potensi Hemat / Bulan (Rp)',
  'Status Boros',
  'Stamp',
  'Stamp',
  'Lokasi',
  'Kategori POI',
  'Unit',
  'SPG',
  'Jam Jaga',
];

const CATEGORY_ID: Record<string, string> = {
  Station: 'Stasiun',
  Campus: 'Kampus',
  Office: 'Perkantoran',
  'HOP & Public Space': 'HOP & Area Publik',
};

/** Tanggal & jam selalu dalam WIB, apa pun zona waktu perangkat. */
function wibParts(iso: string): [string, string] {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return [String(iso || ''), ''];
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return [`${get('day')}/${get('month')}/${get('year')}`, `${get('hour')}:${get('minute')}`];
}

/** +6281234567890 -> "+62 812 3456 7890" supaya Excel tidak mengubahnya jadi angka 6,28E+12. */
function phoneText(phone: string): string {
  const m = (phone || '').match(/^\+62(\d{3})(\d{3,4})(\d{3,5})$/);
  return m ? `+62 ${m[1]} ${m[2]} ${m[3]}` : phone || '';
}

function sortedForExport(records: VisitorRecord[]): VisitorRecord[] {
  return [...records].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function exportRow(r: VisitorRecord, idx: number): (string | number)[] {
  const [tgl, jam] = wibParts(r.created_at);
  return [
    idx + 1,
    tgl,
    jam,
    r.fullName || '',
    phoneText(r.phoneNumber),
    r.email || '',
    r.privacyAgreed ? 'Ya' : 'Tidak',
    r.dailyBikeTrips || '',
    r.avgTripCost || '',
    r.monthlyTrips ?? 0,
    r.monthlyCostNormal ?? 0,
    r.costPerTripPahe ?? 0,
    r.monthlySavings ?? 0,
    r.borosStatus || '',
    r.stampsCount ?? 0,
    r.rewardClaimed || '',
    r.poiLocation || '',
    CATEGORY_ID[r.poiCategory || ''] || r.poiCategory || '',
    r.unitType || '',
    r.spgName || '',
    r.dutyHours || '',
  ];
}

const cleanText = (val: unknown) =>
  String(val ?? '')
    .replace(/–/g, '-')
    .replace(/•|·/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** Cegah formula injection saat file dibuka di Excel/Sheets. */
const safeCell = (val: unknown) => {
  const s = cleanText(val);
  return /^[=+\-@]/.test(s) && !/^\+62[0-9 ]+$/.test(s) && !/^-?[0-9.]+$/.test(s) ? `'${s}` : s;
};

export function exportToExcel(records: VisitorRecord[], dateRangeSuffix?: string): boolean {
  if (records.length === 0) return false;
  import('xlsx').then((XLSX) => {
    const rows = sortedForExport(records).map((r, i) => {
      const values = exportRow(r, i);
      const obj: Record<string, string | number> = {};
      EXPORT_HEADERS.forEach((h, c) => {
        const v = values[c];
        obj[h] = typeof v === 'number' ? v : safeCell(v);
      });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = EXPORT_HEADERS.map((h, c) => {
      const longest = Math.max(h.length, ...rows.map((row) => String(row[h] ?? '').length));
      return { wch: Math.max(c === 0 ? 5 : 8, Math.min(40, longest + 2)) };
    });
    ws['!autofilter'] = { ref: ws['!ref'] as string };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Leads MODIS');
    const suffix = dateRangeSuffix || new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `MODIS_Data_Leads_GrabPAHE_${suffix}.xlsx`);
  });
  return true;
}

export function exportToCSV(records: VisitorRecord[], dateRangeSuffix?: string): boolean {
  if (records.length === 0) return false;
  // Pemisah titik koma: standar Excel berbahasa Indonesia, jadi kolom langsung terpisah saat dibuka.
  // Google Sheets (File > Impor) juga mendeteksinya otomatis.
  const q = (val: unknown) => {
    if (typeof val === 'number') return String(val);
    const s = safeCell(val);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    EXPORT_HEADERS.map(q).join(';'),
    ...sortedForExport(records).map((r, i) => exportRow(r, i).map(q).join(';')),
  ];
  const blob = new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `MODIS_Data_Leads_GrabPAHE_${dateRangeSuffix || new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

export async function copyForGoogleSheets(records: VisitorRecord[]): Promise<boolean> {
  if (records.length === 0) return false;
  const tsv = [
    EXPORT_HEADERS.join('\t'),
    ...sortedForExport(records).map((r, i) => exportRow(r, i).map((v) => safeCell(v).replace(/\t/g, ' ')).join('\t')),
  ].join('\n');
  try {
    await navigator.clipboard.writeText(tsv);
    return true;
  } catch {
    return false;
  }
}
