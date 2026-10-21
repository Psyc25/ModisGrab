import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { VisitorRecord, MerchInventoryItem, AgeGroup } from '../types';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  VISITORS_TABLE,
  MERCH_TABLE,
  DASHBOARD_EMAIL,
} from '../config/supabase';
import schemaSql from '../../supabase/schema.sql?raw';

export const SUPABASE_SQL_SCHEMA: string = schemaSql;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'modis_admin_auth' },
    });
  }
  return client;
}

// ---------------------------------------------------------------------
// Mapping baris <-> record
// ---------------------------------------------------------------------
export function recordToSupabaseRow(record: VisitorRecord) {
  const minor = record.isMinor;
  return {
    id: record.id,
    created_at: record.created_at,
    age_group: record.ageGroup || null,
    is_minor: minor,
    full_name: minor ? null : record.fullName || null,
    email: minor ? null : record.email || null,
    phone_number: minor ? null : record.phoneNumber || null,
    privacy_agreed: minor ? false : record.privacyAgreed,
    consent_version: record.consentVersion,
    daily_bike_trips: record.dailyBikeTrips,
    avg_trip_cost: record.avgTripCost,
    monthly_trips: Math.round(record.monthlyTrips),
    monthly_cost_normal: Math.round(record.monthlyCostNormal),
    cost_per_trip_pahe: Math.round(record.costPerTripPahe),
    monthly_savings: Math.round(record.monthlySavings),
    boros_status: record.borosStatus,
    stamps_count: record.stampsCount,
    reward_claimed: record.rewardClaimed || null,
    poi_location: record.poiLocation,
    poi_category: record.poiCategory || null,
    unit_type: record.unitType,
    spg_name: record.spgName,
    duty_hours: record.dutyHours || null,
    device_id: record.deviceId || null,
  };
}

export function supabaseRowToRecord(row: any): VisitorRecord {
  return {
    id: row.id,
    created_at: row.created_at,
    ageGroup: (row.age_group || null) as AgeGroup | null,
    isMinor: Boolean(row.is_minor),
    fullName: row.full_name || '',
    email: row.email || '',
    phoneNumber: row.phone_number || '',
    privacyAgreed: Boolean(row.privacy_agreed),
    consentVersion: row.consent_version || '',
    dailyBikeTrips: row.daily_bike_trips || '',
    avgTripCost: row.avg_trip_cost || '',
    monthlyTrips: Number(row.monthly_trips) || 0,
    monthlyCostNormal: Number(row.monthly_cost_normal) || 0,
    costPerTripPahe: Number(row.cost_per_trip_pahe) || 0,
    monthlySavings: Number(row.monthly_savings) || 0,
    borosStatus: row.boros_status || '',
    stampsCount: Number(row.stamps_count) || 0,
    rewardClaimed: row.reward_claimed || undefined,
    poiLocation: row.poi_location || '',
    poiCategory: row.poi_category || undefined,
    unitType: row.unit_type || '',
    spgName: row.spg_name || '',
    dutyHours: row.duty_hours || undefined,
    deviceId: row.device_id || undefined,
    syncedToSupabase: true,
  };
}

// ---------------------------------------------------------------------
// Visitor (publik: hanya insert)
// ---------------------------------------------------------------------
export async function sendVisitorToSupabase(
  record: VisitorRecord
): Promise<{ success: boolean; error?: string; permanent?: boolean }> {
  const sb = getSupabaseClient();
  if (!sb) return { success: false, error: 'Supabase belum dikonfigurasi' };

  try {
    const { error } = await sb.from(VISITORS_TABLE).insert([recordToSupabaseRow(record)]);
    if (!error) return { success: true };
    // Sudah pernah terkirim (mis. kirim ulang dari antrean offline): anggap berhasil.
    if (error.code === '23505') return { success: true };
    // Data melanggar aturan database: tidak akan berhasil walau dicoba ulang.
    const permanent = error.code === '23514' || error.code === '22P02' || error.code === '23502';
    return { success: false, error: error.message, permanent };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/** Cek visitor ulang lintas lokasi. Hanya mengembalikan angka, tanpa data pribadi. */
export async function lookupVisitorRemote(phoneE164: string): Promise<{
  ok: boolean;
  found: boolean;
  previousStamps: number;
  totalVisits: number;
  claimedToday: boolean;
}> {
  const empty = { ok: false, found: false, previousStamps: 0, totalVisits: 0, claimedToday: false };
  const sb = getSupabaseClient();
  if (!sb) return empty;
  try {
    const { data, error } = await sb.rpc('modis_lookup_visitor', { p_phone: phoneE164 });
    if (error || !data) return empty;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      ok: true,
      found: Boolean(row?.found),
      previousStamps: Number(row?.previous_stamps) || 0,
      totalVisits: Number(row?.total_visits) || 0,
      claimedToday: Boolean(row?.claimed_today),
    };
  } catch {
    return empty;
  }
}

/** Cek apakah tabel & fungsi dari schema.sql sudah terpasang. */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  const sb = getSupabaseClient();
  if (!sb) {
    return { success: false, message: 'VITE_SUPABASE_ANON_KEY belum diisi di environment aplikasi.' };
  }
  try {
    const { error } = await sb.rpc('modis_lookup_visitor', { p_phone: '+6280000000000' });
    if (error) {
      return {
        success: false,
        message: `Terhubung, tetapi skema belum terpasang: ${error.message}. Jalankan supabase/schema.sql.`,
      };
    }
    return { success: true, message: 'Koneksi Supabase & skema database siap.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Gagal menghubungi Supabase' };
  }
}

// ---------------------------------------------------------------------
// Merchandise & gacha
// ---------------------------------------------------------------------
function rowToMerch(row: any): MerchInventoryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    stock: Number(row.stock) || 0,
    initialStock: Number(row.initial_stock) || 0,
    probabilityWeight: Number(row.probability_weight) || 10,
  };
}

export async function fetchMerchRemote(): Promise<MerchInventoryItem[] | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from(MERCH_TABLE)
      .select('*')
      .order('sort_order', { ascending: true });
    if (error || !data) return null;
    return data.map(rowToMerch);
  } catch {
    return null;
  }
}

/** Undian di server; stok berkurang atomik. null = gagal/offline, item null = stok habis. */
export async function spinGachaRemote(): Promise<
  { ok: true; item: { id: string; name: string; remaining: number } | null } | { ok: false; error: string }
> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase belum dikonfigurasi' };
  try {
    const { data, error } = await sb.rpc('modis_spin_gacha');
    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: true, item: null };
    return {
      ok: true,
      item: { id: row.item_id, name: row.item_name, remaining: Number(row.remaining) || 0 },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error' };
  }
}

/** Khusus admin (RLS menolak selain admin). */
export async function updateMerchStockRemote(id: string, stock: number): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb) return false;
  const { error } = await sb
    .from(MERCH_TABLE)
    .update({ stock: Math.max(0, Math.round(stock)), updated_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function resetMerchRemote(): Promise<boolean> {
  const items = await fetchMerchRemote();
  if (!items) return false;
  const results = await Promise.all(items.map((i) => updateMerchStockRemote(i.id, i.initialStock)));
  return results.every(Boolean);
}

// ---------------------------------------------------------------------
// Admin: login & akses data lengkap
// ---------------------------------------------------------------------
export async function getAdminSession(): Promise<Session | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function checkIsAdmin(): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb) return false;
  const { data, error } = await sb.rpc('modis_is_admin');
  return !error && data === true;
}

export async function signInAdmin(
  email: string,
  password: string
): Promise<{ success: boolean; message?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { success: false, message: 'Supabase belum dikonfigurasi.' };
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { success: false, message: 'Email atau password salah.' };
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    await sb.auth.signOut();
    return { success: false, message: 'Akun ini tidak punya akses. Hanya owner/klien MODIS yang bisa masuk.' };
  }
  return { success: true };
}

/** Login dashboard dengan kata sandi saja (akun bersama DASHBOARD_EMAIL). */
export async function signInWithPasswordOnly(password: string): Promise<{ success: boolean; message?: string }> {
  if (!password) return { success: false, message: 'Masukkan kata sandi.' };
  const res = await signInAdmin(DASHBOARD_EMAIL, password);
  if (!res.success && res.message === 'Email atau password salah.') return { success: false, message: 'Kata sandi salah.' };
  return res;
}

export async function signOutAdmin(): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) await sb.auth.signOut();
}

export type AdminRole = 'owner' | 'client';

/** Peran akun yang sedang login: owner (kelola penuh) atau client (lihat & unduh). */
export async function getAdminRole(): Promise<AdminRole | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb.rpc('modis_admin_role');
  if (error || !data) return null;
  return data === 'owner' ? 'owner' : 'client';
}

/** Data visitor dalam rentang waktu [fromIso, toIso), khusus owner/klien. Dibaca per 1000 baris. */
export async function fetchVisitorsRange(
  fromIso: string,
  toIso: string
): Promise<{ success: boolean; data?: VisitorRecord[]; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { success: false, error: 'Supabase belum dikonfigurasi' };
  try {
    const pageSize = 1000;
    const all: VisitorRecord[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await sb
        .from(VISITORS_TABLE)
        .select('*')
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) return { success: false, error: error.message };
      all.push(...(data || []).map(supabaseRowToRecord));
      if (!data || data.length < pageSize) break;
    }
    return { success: true, data: all };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal memuat data dari Supabase' };
  }
}

/** Ambil seluruh data visitor (admin). Dibaca per halaman 1000 baris. */
export async function fetchVisitorsFromSupabase(): Promise<{
  success: boolean;
  data?: VisitorRecord[];
  error?: string;
}> {
  const sb = getSupabaseClient();
  if (!sb) return { success: false, error: 'Supabase belum dikonfigurasi' };
  try {
    const pageSize = 1000;
    const all: VisitorRecord[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await sb
        .from(VISITORS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) return { success: false, error: error.message };
      all.push(...(data || []).map(supabaseRowToRecord));
      if (!data || data.length < pageSize) break;
    }
    return { success: true, data: all };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal memuat data dari Supabase' };
  }
}

export async function deleteVisitorRemote(id: string): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb) return false;
  const { error } = await sb.from(VISITORS_TABLE).delete().eq('id', id);
  return !error;
}

// ---------------------------------------------------------------------
// Laporan akhir slot (dikirim tablet SPG, tanpa akun)
// ---------------------------------------------------------------------
export interface SlotReportPayload {
  report_date: string;
  unit_type: string;
  duty_hours: string;
  poi_location: string;
  poi_category?: string;
  spg_name?: string;
  reach: number;
  contact: number;
  conversion: number;
  merch_a: number;
  merch_b: number;
  merch_c: number;
  drinks: number;
  notes?: string;
  device_id: string;
}

export async function submitSlotReportRemote(p: SlotReportPayload): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase belum dikonfigurasi' };
  try {
    const { error } = await sb.rpc('modis_submit_slot_report', { p });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

/** Laporan slot untuk dashboard internal (owner/klien). */
export async function fetchSlotReportsRange(fromDay: string, toDay: string): Promise<any[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from('modis_slot_reports').select('*').gte('report_date', fromDay).lte('report_date', toDay).order('report_date');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchSettingsRemote(): Promise<Record<string, any>> {
  const sb = getSupabaseClient();
  if (!sb) return {};
  const { data, error } = await sb.from('modis_settings').select('key,value');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
}

export async function saveSettingRemote(key: string, value: unknown): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb) return false;
  const { error } = await sb.from('modis_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  return !error;
}

/** Koreksi laporan slot oleh owner (tercatat siapa & kapan). */
export async function updateSlotReportRemote(id: string, patch: Record<string, unknown>, editedBy: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase belum dikonfigurasi' };
  const { error } = await sb
    .from('modis_slot_reports')
    .update({ ...patch, edited_by: editedBy.slice(0, 80), edited_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteSlotReportRemote(id: string): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb) return false;
  const { error } = await sb.from('modis_slot_reports').delete().eq('id', id);
  return !error;
}

/** Hapus data uji ([QC]) dan/atau data sebelum tanggal tertentu. Khusus owner. */
export async function purgeTestDataRemote(qc: boolean, before: string | null): Promise<{ ok: boolean; result?: { visitors: number; slot_reports: number; positions: number }; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase belum dikonfigurasi' };
  const { data, error } = await sb.rpc('modis_purge_test_data', { p_qc: qc, p_before: before });
  return error ? { ok: false, error: error.message } : { ok: true, result: data as any };
}

// ---------------------------------------------------------------------
// Pelacakan lokasi tablet (selama jam jaga)
// ---------------------------------------------------------------------
export interface PositionPayload {
  device_id: string;
  spg_name: string;
  unit_type: string;
  poi_location: string;
  duty_hours: string;
  lat: number;
  lng: number;
  accuracy: number;
}

export async function reportPositionRemote(p: PositionPayload): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb) return false;
  try {
    const { error } = await sb.rpc('modis_report_position', { p });
    return !error;
  } catch {
    return false;
  }
}

export interface DevicePosition extends PositionPayload {
  updated_at: string;
}

export async function fetchDevicePositions(): Promise<DevicePosition[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from('modis_device_positions').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as DevicePosition[];
}

export interface PositionLogRow {
  device_id: string;
  lat: number;
  lng: number;
  created_at: string;
}

/** Jejak posisi satu hari (WIB). */
export async function fetchPositionLog(day: string): Promise<PositionLogRow[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from('modis_position_log')
    .select('device_id,lat,lng,created_at')
    .gte('created_at', `${day}T00:00:00+07:00`)
    .lt('created_at', `${next}T00:00:00+07:00`)
    .order('created_at')
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data || []) as PositionLogRow[];
}
