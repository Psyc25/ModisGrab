import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadFieldXlsx, dummyDailyRows, type DailyRow } from './exportFieldXlsx';
import { BarChart, DashboardSkeleton, HBarList } from '../components/Charts';
import { Download, RefreshCw } from 'lucide-react';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/supabase';
import { ReportSettings, addDays, fmtDay, todayWIB } from './engine';
import { normBorosStatus } from '../utils/borosStatus';

/**
 * Laporan Grab (fase 3 spec): dari data Field App, hanya angka agregat.
 * Harian, mingguan, per unit, per venue, reward; tanpa nama/nomor customer.
 */

type Row = [string, string, string, string, 'pahe_new' | 'pahe_lapsed' | 'gb_hemat', number, number];
interface FieldData {
  rows: Row[];
  rewards: Record<string, number>;
  reach: [string, string, number, number][];
  /** Tambahan fase 2k (kosong bila SQL belum dijalankan) */
  merch?: Record<string, number>;
  stamps?: [string, string, number][];
  boros?: [string, string, string, number, number, string?, number?][];
}

/** Nama barang untuk laporan (sama dengan aplikasi crew). */
const ITEM_LABEL: Record<string, string> = {
  w_roti: 'Roti', w_pisang: 'Pisang', w_telur: 'Telur', w_caffino: 'Caffino', w_isoplus: 'Isoplus', w_nobo: 'Nobo Milk',
  c_keychain: 'Acrylic keychain', c_sticker: 'Sticker pack', c_pen: 'Pen branding',
  b_tote: 'Tote bag', b_pouch: 'Travel pouch', b_lanyard: 'Lanyard',
  a_umbrella: 'Payung lipat', a_tumbler: 'Egg tumbler', a_fan: 'Mini fan USB',
  h_phone: 'Smartphone Samsung', h_gold: 'Emas Antam 0,5 g', h_tws: 'TWS', h_powerbank: 'Powerbank 10.000 mAh', h_watch: 'Smartwatch',
};
const ITEM_GROUP = (id: string) =>
  id.startsWith('w_') ? 'Welcome' : id.startsWith('c_') ? 'Tier C' : id.startsWith('b_') ? 'Tier B' : id.startsWith('a_') ? 'Tier A' : id.startsWith('h_') ? 'Grand prize' : 'Lainnya';
const BOROS_ORDER = ['Sangat Boros', 'Boros', 'Lumayan Boros', 'Cukup Hemat'];
/** Warna status sama dengan laporan Cek Boros yang sudah disetujui. */
const BOROS_COLOR: Record<string, string> = { 'Sangat Boros': '#DB3735', Boros: '#F79705', 'Lumayan Boros': '#FFD902', 'Cukup Hemat': '#00B14F' };
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

type Tot = { conv: number; pn: number; pl: number; gb: number; stamps: number; boros: number; borosSum: number; reach: number; contacts: number };
/** Ringkasan angka kunci satu periode (untuk perbandingan). */
function summarize(d: FieldData | null): Tot {
  const t: Tot = { conv: 0, pn: 0, pl: 0, gb: 0, stamps: 0, boros: 0, borosSum: 0, reach: 0, contacts: 0 };
  (d?.rows || []).forEach((r) => {
    t.conv += r[5];
    if (r[4] === 'pahe_new') t.pn += r[5];
    else if (r[4] === 'pahe_lapsed') t.pl += r[5];
    else t.gb += r[5];
  });
  (d?.stamps || []).forEach((r) => (t.stamps += r[2]));
  (d?.boros || []).forEach((r) => {
    t.boros += r[3];
    t.borosSum += r[4];
  });
  (d?.reach || []).forEach((r) => {
    t.reach += r[2] || 0;
    t.contacts += r[3] || 0;
  });
  return t;
}
const weekStart = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

const UNITS: Record<string, string> = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk Diskon 1', kiosk2: 'Kiosk Diskon 2' };
const TYPES = { pahe_new: 'PaHe New', pahe_lapsed: 'PaHe Churned', gb_hemat: 'GB Hemat' } as const;
const REWARDS: Record<string, string> = { snack: 'Welcome snack', drink: 'Welcome drink', candy: 'Kupon Candy', tier_c: 'Tier C', tier_b: 'Tier B', tier_a: 'Tier A', golden: 'Golden' };
const DAILY_TARGET = 600;
const nf = (n: number) => n.toLocaleString('id-ID');
const card = 'bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]';

async function loadField(key: string, from: string, to: string): Promise<FieldData> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/modis_f1_public_field`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key, p_from: from, p_to: to }),
  });
  if (!resp.ok) throw new Error(`Gagal memuat (${resp.status})`);
  return resp.json();
}

export const FieldClientReport: React.FC<{ reportKey: string; settings: ReportSettings | null }> = ({ reportKey, settings }) => {
  const today = todayWIB();
  const start = settings?.campaign.start || today;
  const [range, setRange] = useState<'today' | 'week' | 'all'>('all');
  const from = range === 'today' ? today : range === 'week' ? addDays(today, -6) : start < today ? start : addDays(today, -30); // sebelum kampanye mulai: tampilkan 30 hari terakhir (data uji)
  const to = today;
  const [data, setData] = useState<FieldData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);
  const [dataB, setDataB] = useState<FieldData | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await loadField(reportKey, from, to));
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || 'Gagal memuat');
    } finally {
      setBusy(false);
    }
  }, [reportKey, from, to]);
  // Periode pembanding = periode sama panjang tepat sebelumnya (hanya untuk Hari ini / 7 hari)
  const spanDays = range === 'today' ? 1 : 7;
  const toB = addDays(from, -1);
  const fromB = addDays(toB, -(spanDays - 1));
  const canCompare = range !== 'all';
  useEffect(() => {
    if (!compare || !canCompare) {
      setDataB(null);
      return;
    }
    let alive = true;
    loadField(reportKey, fromB, toB)
      .then((d) => alive && setDataB(d))
      .catch(() => alive && setDataB(null));
    return () => {
      alive = false;
    };
  }, [compare, canCompare, reportKey, fromB, toB, data]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const agg = useMemo(() => {
    const rows = data?.rows || [];
    const total = rows.reduce((a, r) => a + r[5], 0);
    const byType = { pahe_new: 0, pahe_lapsed: 0, gb_hemat: 0 };
    const byUnit: Record<string, number> = {};
    const byDay = new Map<string, number>();
    const byPoi = new Map<string, { cat: string; n: number; pahe: number; gb: number }>();
    let photobooth = 0;
    const byCat = new Map<string, { n: number; pahe: number; gb: number; venues: Set<string> }>();
    rows.forEach(([d, u, poi, cat, t, n, pb]) => {
      byType[t] += n;
      byUnit[u] = (byUnit[u] || 0) + n;
      byDay.set(d, (byDay.get(d) || 0) + n);
      const p = byPoi.get(poi) || { cat, n: 0, pahe: 0, gb: 0 };
      p.n += n;
      if (t === 'gb_hemat') p.gb += n;
      else p.pahe += n;
      byPoi.set(poi, p);
      photobooth += pb;
      const c = byCat.get(cat || '-') || { n: 0, pahe: 0, gb: 0, venues: new Set<string>() };
      c.n += n;
      if (t === 'gb_hemat') c.gb += n;
      else c.pahe += n;
      c.venues.add(poi);
      byCat.set(cat || '-', c);
    });
    const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
    const dayList = Array.from({ length: Math.min(days, 120) }, (_, i) => addDays(from, i));
    const reach = (data?.reach || []).reduce((a, r) => a + (r[2] || 0), 0);
    const contacts = (data?.reach || []).reduce((a, r) => a + (r[3] || 0), 0);
    // Rekap harian per tanggal × unit
    type D = { pahe_new: number; pahe_lapsed: number; gb_hemat: number; stamps: number; boros: number; savings: number; reach: number; contacts: number };
    const blank = (): D => ({ pahe_new: 0, pahe_lapsed: 0, gb_hemat: 0, stamps: 0, boros: 0, savings: 0, reach: 0, contacts: 0 });
    const daily = new Map<string, D>();
    const cell = (d: string, u: string) => {
      const k = `${d}|${u}`;
      if (!daily.has(k)) daily.set(k, blank());
      return daily.get(k)!;
    };
    rows.forEach(([d, u, , , t, n]) => (cell(d, u)[t] += n));
    (data?.reach || []).forEach(([d, u, r, c]) => {
      cell(d, u).reach += r || 0;
      cell(d, u).contacts += c || 0;
    });
    let stamps = 0;
    (data?.stamps || []).forEach(([d, u, n]) => {
      cell(d, u).stamps += n;
      stamps += n;
    });
    let borosN = 0;
    let borosSum = 0;
    const borosStatus: Record<string, number> = {};
    const borosSumBy: Record<string, number> = {};
    const borosUnit: Record<string, { n: number; s: number; hot: number }> = {};
    const borosPoi = new Map<string, { n: number; s: number; hot: number; c: number }>();
    let borosCost = 0;
    (data?.boros || []).forEach(([d, u, st0, n, sum, poi, cost]) => {
      const st = normBorosStatus(st0);
      const hot = st === 'Sangat Boros' || st === 'Boros' ? n : 0;
      borosSumBy[st] = (borosSumBy[st] || 0) + sum;
      const bu = borosUnit[u] || { n: 0, s: 0, hot: 0 };
      bu.n += n; bu.s += sum; bu.hot += hot;
      borosUnit[u] = bu;
      if (poi) {
        const bp = borosPoi.get(poi) || { n: 0, s: 0, hot: 0, c: 0 };
        bp.n += n; bp.s += sum; bp.hot += hot; bp.c += cost || 0;
        borosPoi.set(poi, bp);
      }
      borosCost += cost || 0;
      cell(d, u).boros += n;
      cell(d, u).savings += sum;
      borosN += n;
      borosSum += sum;
      borosStatus[st] = (borosStatus[st] || 0) + n;
    });
    const byDate = new Map<string, D>();
    daily.forEach((v, k) => {
      const d = k.split('|')[0];
      const t = byDate.get(d) || blank();
      (Object.keys(v) as (keyof D)[]).forEach((f) => (t[f] += v[f]));
      byDate.set(d, t);
    });
    const merch = Object.entries(data?.merch || {}).sort((a, b) => b[1] - a[1]);
    return {
      total, byType, byUnit, byDay, byPoi: Array.from(byPoi.entries()).sort((a, b) => b[1].n - a[1].n), photobooth, days, dayList, reach, contacts,
      byCat: Array.from(byCat.entries()).sort((a, b) => b[1].n - a[1].n), daily, byDate, stamps, borosN, borosSum, borosStatus, borosSumBy, borosUnit, borosCost, borosPoi: Array.from(borosPoi.entries()).sort((a, b) => b[1].n - a[1].n), merch,
      hasExtra: Boolean(data && ('stamps' in data || 'boros' in data || 'merch' in data)),
    };
  }, [data, from, to]);

  const target = DAILY_TARGET * agg.days;

  const recap = useMemo(() => {
    type R = { label: string; conv: number; pn: number; pl: number; gb: number; stamps: number; boros: number; reach: number };
    const mk = (keyOf: (d: string) => string, labelOf: (k: string) => string) => {
      const m = new Map<string, R>();
      agg.byDate.forEach((v, d) => {
        const k = keyOf(d);
        const r = m.get(k) || { label: labelOf(k), conv: 0, pn: 0, pl: 0, gb: 0, stamps: 0, boros: 0, reach: 0 };
        r.conv += v.pahe_new + v.pahe_lapsed + v.gb_hemat;
        r.pn += v.pahe_new; r.pl += v.pahe_lapsed; r.gb += v.gb_hemat;
        r.stamps += v.stamps; r.boros += v.boros; r.reach += v.reach;
        m.set(k, r);
      });
      return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, r]) => r);
    };
    return {
      weeks: mk(weekStart, (k) => `${fmtDay(k, { day: 'numeric', month: 'short' })} – ${fmtDay(addDays(k, 6), { day: 'numeric', month: 'short' })}`),
      months: mk((d) => d.slice(0, 7), (k) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })),
    };
  }, [agg.byDate]);
  const totA = useMemo(() => summarize(data), [data]);
  const totB = useMemo(() => summarize(dataB), [dataB]);

  const dailyRows = (): DailyRow[] =>
    Array.from(agg.daily.entries()).map(([k, v]) => {
      const [d, u] = k.split('|');
      return { date: d, unit: UNITS[u] || u, paheNew: v.pahe_new, paheChurn: v.pahe_lapsed, gbHemat: v.gb_hemat, stamps: v.stamps, boros: v.boros, savings: v.savings, reach: v.reach, contacts: v.contacts };
    });
  const downloadXlsx = () => void downloadFieldXlsx(dailyRows(), { from, to });
  const downloadDummyXlsx = () => {
    const rows = dummyDailyRows();
    void downloadFieldXlsx(rows, { from: rows[0].date, to: rows[rows.length - 1].date, dummy: true });
  };

  const downloadCsv = () => {
    const head = ['Tanggal', 'Unit', 'PaHe New', 'PaHe Churned', 'GB Hemat', 'Total conversion', 'Kartu stamp lengkap', 'Cek Boros', 'Potensi hemat (Rp)', 'Reach', 'Contacts'];
    const lines = Array.from(agg.daily.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => {
        const [d, u] = k.split('|');
        return [d, UNITS[u] || u, v.pahe_new, v.pahe_lapsed, v.gb_hemat, v.pahe_new + v.pahe_lapsed + v.gb_hemat, v.stamps, v.boros, v.savings, v.reach, v.contacts];
      });
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `grab-modis_rekap-harian_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <section className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="font-display text-[18px] font-bold">Conversion terverifikasi SPG</h2>
          <p className="text-[13px] text-ink-2">
            {fmtDay(from, { day: 'numeric', month: 'short' })} – {fmtDay(to, { day: 'numeric', month: 'short', year: 'numeric' })} · data dari aplikasi crew, diperbarui tiap menit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-canvas rounded-xl p-1">
            {(['today', 'week', 'all'] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`h-9 px-3 rounded-lg text-[13px] font-semibold ${range === r ? 'bg-white shadow-sm' : 'text-ink-2'}`}>
                {r === 'today' ? 'Hari ini' : r === 'week' ? '7 hari' : 'Sejak mulai'}
              </button>
            ))}
          </div>
          {canCompare && (
            <button onClick={() => setCompare(!compare)} aria-pressed={compare} className={`h-9 px-3 rounded-lg text-[13px] font-semibold ${compare ? 'bg-grab-cta text-white' : 'bg-canvas text-ink-2'}`}>
              Bandingkan
            </button>
          )}
          <button onClick={load} aria-label="Muat ulang" className="w-9 h-9 rounded-lg bg-canvas flex items-center justify-center">
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </section>
      {err && <p className="text-[13px] text-modis-red">{err}</p>}
      {!data && !err && <DashboardSkeleton />}

      {data && (<>
      <section className="grid grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-2xl p-4 col-span-3 lg:col-span-1 bg-grab-deep text-white">
          <p className="text-[12px] text-white/80">Total conversion</p>
          <p className="font-display text-[32px] font-extrabold tabular-nums leading-tight">{nf(agg.total)}</p>
          <p className="text-[12px] text-white/80">
            target {nf(target)} · {Math.round((agg.total / Math.max(1, target)) * 100)}%
          </p>
          <div className="mt-2 h-2 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-modis-yellow rounded-full" style={{ width: `${Math.min(100, (agg.total / Math.max(1, target)) * 100)}%` }} />
          </div>
        </div>
        {(Object.keys(TYPES) as (keyof typeof TYPES)[]).map((t) => (
          <div key={t} className={`${card} p-3 sm:p-4 min-w-0`}>
            <p className="text-[12px] text-ink-2">{TYPES[t]}</p>
            <p className="font-display text-[clamp(20px,5vw,26px)] font-extrabold tabular-nums">{nf(agg.byType[t])}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Kartu stamp lengkap', value: nf(agg.stamps), sub: 'PaHe + GB Hemat di hari yang sama' },
          { label: 'Cek Boros', value: nf(agg.borosN), sub: 'customer dihitung hematnya' },
          { label: 'Rata-rata potensi hemat', value: agg.borosN ? rp(agg.borosSum / agg.borosN) : '-', sub: 'per customer per bulan dengan PAHE' },
          { label: 'Reach / contacts', value: `${nf(agg.reach)} / ${nf(agg.contacts || agg.borosN)}`, sub: 'tutup hari TL (contacts min. = Cek Boros)' },
        ].map((k) => (
          <div key={k.label} className={`${card} p-3 sm:p-4 min-w-0`}>
            <p className="text-[12px] text-ink-2">{k.label}</p>
            <p className="font-display text-[clamp(18px,4.5vw,24px)] font-extrabold tabular-nums truncate">{k.value}</p>
            <p className="text-[11px] text-ink-3 leading-snug">{k.sub}</p>
          </div>
        ))}
      </section>

      {compare && canCompare && (
        <section className={`${card} overflow-hidden`}>
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-[15px] font-bold">Perbandingan dengan periode sebelumnya</h3>
            <p className="text-[12px] text-ink-3">
              Periode A: {fmtDay(from, { day: 'numeric', month: 'short' })}{from !== to ? ` – ${fmtDay(to, { day: 'numeric', month: 'short' })}` : ''} · Periode B: {fmtDay(fromB, { day: 'numeric', month: 'short' })}{fromB !== toB ? ` – ${fmtDay(toB, { day: 'numeric', month: 'short' })}` : ''}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-ink-2">
                <tr>
                  <th className="px-3 py-2 text-left">Metrik</th>
                  <th className="px-3 py-2 text-right">A</th>
                  <th className="px-3 py-2 text-right">B</th>
                  <th className="px-3 py-2 text-right">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {([
                  ['Total conversion', totA.conv, totB.conv, nf],
                  ['PaHe New', totA.pn, totB.pn, nf],
                  ['PaHe Churned', totA.pl, totB.pl, nf],
                  ['GB Hemat', totA.gb, totB.gb, nf],
                  ['Kartu stamp lengkap', totA.stamps, totB.stamps, nf],
                  ['Cek Boros', totA.boros, totB.boros, nf],
                  ['Rata-rata potensi hemat', totA.boros ? totA.borosSum / totA.boros : 0, totB.boros ? totB.borosSum / totB.boros : 0, rp],
                  ['Reach (tutup hari)', totA.reach, totB.reach, nf],
                  ['Contacts (tutup hari)', totA.contacts, totB.contacts, nf],
                ] as [string, number, number, (n: number) => string][]).map(([label, a, b, f]) => {
                  const d = b ? ((a - b) / b) * 100 : a ? 100 : 0;
                  return (
                    <tr key={label}>
                      <td className="px-3 py-2 font-semibold">{label}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{f(a)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-2">{dataB ? f(b) : '…'}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${d > 0 ? 'text-grab' : d < 0 ? 'text-modis-red' : 'text-ink-3'}`}>
                        {dataB ? `${d > 0 ? '+' : ''}${Math.round(d)}%` : '…'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <section className={`${card} p-4 lg:col-span-3`}>
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="text-[15px] font-bold">Conversion harian</h3>
            <span className="text-[12px] text-ink-3">garis = target {nf(DAILY_TARGET)}/hari</span>
          </div>
          <BarChart
            data={agg.dayList.map((d) => {
              const dt = new Date(`${d}T00:00:00Z`);
              return { key: d, label: `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`, value: agg.byDay.get(d) || 0, tip: dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) };
            })}
            target={DAILY_TARGET}
            empty="Belum ada conversion di rentang ini."
          />
        </section>
        <section className={`${card} p-4 lg:col-span-2`}>
          <h3 className="text-[15px] font-bold mb-3">Venue terbanyak</h3>
          <HBarList items={agg.byPoi.map(([poi, p]) => ({ label: poi, value: p.n }))} empty="Belum ada conversion di rentang ini." />
        </section>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <section className={`${card} p-4`}>
          <h3 className="text-[15px] font-bold mb-2">Per unit</h3>
          {Object.entries(UNITS).map(([u, label]) => (
            <div key={u} className="py-2 border-b border-line last:border-0">
              <div className="flex justify-between text-[14px]">
                <span>{label}</span>
                <span className="font-bold tabular-nums">{nf(agg.byUnit[u] || 0)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-canvas overflow-hidden">
                <div className="h-full bg-grab rounded-full" style={{ width: `${Math.min(100, ((agg.byUnit[u] || 0) / Math.max(1, target / 3)) * 100)}%` }} />
              </div>
            </div>
          ))}
          <p className="mt-3 text-[12px] text-ink-3">
            Reach {nf(agg.reach)} · contacts {nf(agg.contacts)} · photobooth {nf(agg.photobooth)}
          </p>
        </section>
        <section className={`${card} p-4 lg:col-span-2`}>
          <h3 className="text-[15px] font-bold mb-2">Reward keluar</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {Object.entries(REWARDS).map(([k, label]) => (
              <div key={k} className="rounded-xl bg-canvas p-3">
                <p className="text-[11px] text-ink-2">{label}</p>
                <p className="text-[20px] font-extrabold tabular-nums">{nf(data?.rewards?.[k] || 0)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-3">
        <section className={`${card} p-4`}>
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="text-[15px] font-bold">Hadiah & item per barang</h3>
            <span className="text-[12px] text-ink-3">welcome dan merchandise</span>
          </div>
          <HBarList
            limit={20}
            items={agg.merch.map(([id, n]) => ({ label: ITEM_LABEL[id] || id, sub: ITEM_GROUP(id), value: n }))}
            empty={agg.hasExtra ? 'Belum ada hadiah keluar di rentang ini.' : 'Rincian per barang segera tersedia.'}
          />
        </section>
      </div>

      {/* ===== Cek Boros (model laporan Cek Boros yang disetujui) ===== */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-[18px] font-bold">Cek Boros visitor</h2>
          <p className="text-[12px] text-ink-3">Hasil hitung hemat PAHE yang ditunjukkan crew ke customer. Tanpa nama / nomor HP.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'Visitor Cek Boros', value: nf(agg.borosN), sub: agg.total ? `${Math.round((agg.borosN / agg.total) * 100)}% dari conversion` : 'kunjungan' },
            { label: 'Rata-rata potensi hemat', value: agg.borosN ? rp(agg.borosSum / agg.borosN) : '-', sub: 'per visitor / bulan' },
            { label: 'Rata-rata ongkos bulanan', value: agg.borosN && agg.borosCost ? rp(agg.borosCost / agg.borosN) : '-', sub: 'sebelum PAHE' },
            { label: 'Boros & sangat boros', value: agg.borosN ? `${Math.round((((agg.borosStatus['Sangat Boros'] || 0) + (agg.borosStatus['Boros'] || 0)) / agg.borosN) * 100)}%` : '-', sub: 'target paling cocok untuk PAHE' },
          ].map((k) => (
            <div key={k.label} className={`${card} p-3 sm:p-4 min-w-0`}>
              <p className="text-[12px] text-ink-2">{k.label}</p>
              <p className="font-display text-[clamp(18px,4.5vw,24px)] font-extrabold tabular-nums truncate">{k.value}</p>
              <p className="text-[11px] text-ink-3 leading-snug">{k.sub}</p>
            </div>
          ))}
        </div>
        {agg.borosN === 0 ? (
          <div className={`${card} p-6 text-center text-[13px] text-ink-3`}>{agg.hasExtra ? 'Belum ada Cek Boros di rentang ini.' : 'Hasil Cek Boros segera tersedia.'}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <section className={`${card} p-4`}>
                <h3 className="font-display text-[16px] font-bold mb-3">Status boros visitor</h3>
                <div className="flex h-3 rounded-full overflow-hidden bg-canvas mb-3">
                  {BOROS_ORDER.map((st) => (agg.borosStatus[st] ? <div key={st} style={{ width: `${(agg.borosStatus[st] / agg.borosN) * 100}%`, background: BOROS_COLOR[st] }} title={st} /> : null))}
                </div>
                <ul className="space-y-2">
                  {BOROS_ORDER.map((st) => {
                    const n = agg.borosStatus[st] || 0;
                    return (
                      <li key={st} className="flex items-center justify-between text-[13px]">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: BOROS_COLOR[st] }} /> {st}
                        </span>
                        <span className="tabular-nums text-ink-2">
                          <strong className="text-ink">{nf(n)}</strong> · {Math.round((n / agg.borosN) * 100)}% · rata² {n ? rp((agg.borosSumBy[st] || 0) / n) : '-'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[11px] text-ink-3 leading-snug">
                  Potensi hemat = potongan PAHE (Rp1.500 untuk ongkos s.d. Rp9.000, Rp1.000 di atasnya) × perjalanan, maks. 99x per bulan, sebelum biaya langganan Rp7.000/bulan (bulan pertama gratis).
                </p>
              </section>
              <section className={`${card} p-4`}>
                <h3 className="font-display text-[16px] font-bold mb-3">Tren harian Cek Boros</h3>
                <BarChart
                  data={agg.dayList.map((d) => {
                    const dt = new Date(`${d}T00:00:00Z`);
                    return { key: d, label: `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`, value: agg.byDate.get(d)?.boros || 0, tip: dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) };
                  })}
                  empty="Belum ada Cek Boros di rentang ini."
                />
              </section>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {([
                ['Cek Boros per unit', Object.entries(UNITS).map(([u, label]) => [label, agg.borosUnit[u] || { n: 0, s: 0, hot: 0 }] as [string, { n: number; s: number; hot: number }])],
                ['Cek Boros per venue', agg.borosPoi.map(([poi, v]) => [poi, v] as [string, { n: number; s: number; hot: number }])],
              ] as [string, [string, { n: number; s: number; hot: number }][]][]).map(([title, rows]) => (
                <section key={title} className={`${card} overflow-hidden`}>
                  <h3 className="px-4 pt-4 pb-2 font-display text-[16px] font-bold">{title}</h3>
                  <div className="overflow-x-auto max-h-[320px]">
                    <table className="w-full text-[13px]">
                      <thead className="bg-canvas sticky top-0 text-[11px] uppercase tracking-wide text-ink-2">
                        <tr>
                          <th className="px-3 py-2 text-left">Nama</th>
                          <th className="px-3 py-2 text-right">Visitor</th>
                          <th className="px-3 py-2 text-right">Rata² hemat</th>
                          <th className="px-3 py-2 text-right">Boros+</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {rows.map(([name, v]) => (
                          <tr key={name}>
                            <td className="px-3 py-2 font-semibold min-w-[120px]">{name}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-bold">{nf(v.n)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{v.n ? rp(v.s / v.n) : '-'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{v.n ? `${Math.round((v.hot / v.n) * 100)}%` : '-'}</td>
                          </tr>
                        ))}
                        {rows.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-3">Rincian venue tersedia setelah update data.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <section className={`${card} overflow-hidden`}>
          <h3 className="px-4 pt-4 pb-2 text-[15px] font-bold">Per kategori POI</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-ink-2">
                <tr>
                  <th className="px-3 py-2 text-left">Kategori</th>
                  <th className="px-3 py-2 text-right">Venue</th>
                  <th className="px-3 py-2 text-right">PaHe</th>
                  <th className="px-3 py-2 text-right">GB</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {agg.byCat.map(([cat, c]) => (
                  <tr key={cat}>
                    <td className="px-3 py-2 font-semibold">{cat}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.venues.size}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(c.pahe)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(c.gb)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{nf(c.n)}</td>
                  </tr>
                ))}
                {agg.byCat.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-3">Belum ada data di rentang ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        {([
          ['Rekap mingguan', recap.weeks],
          ['Rekap bulanan', recap.months],
        ] as const).map(([title, list]) => (
          <section key={title} className={`${card} overflow-hidden`}>
            <h3 className="px-4 pt-4 pb-2 text-[15px] font-bold">{title}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-canvas text-[11px] uppercase tracking-wide text-ink-2">
                  <tr>
                    <th className="px-3 py-2 text-left">Periode</th>
                    <th className="px-3 py-2 text-right">Conversion</th>
                    <th className="px-3 py-2 text-right">PaHe</th>
                    <th className="px-3 py-2 text-right">GB</th>
                    <th className="px-3 py-2 text-right">Stamp</th>
                    <th className="px-3 py-2 text-right">Cek Boros</th>
                    <th className="px-3 py-2 text-right">Reach</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map((r) => (
                    <tr key={r.label}>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{r.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{nf(r.conv)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.pn + r.pl)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.gb)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.stamps)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.boros)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.reach)}</td>
                    </tr>
                  ))}
                  {list.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-3">Belum ada data di rentang ini.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-bold">Rekap harian</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadXlsx} className="h-9 px-3 rounded-lg bg-grab-tint text-grab-deep text-[13px] font-semibold flex items-center gap-1.5">
              <Download className="w-4 h-4" /> Unduh XLSX
            </button>
            <button onClick={downloadDummyXlsx} className="h-9 px-3 rounded-lg bg-canvas text-[13px] font-semibold flex items-center gap-1.5">
              <Download className="w-4 h-4" /> XLSX contoh (dummy)
            </button>
            <button onClick={downloadCsv} className="h-9 px-3 rounded-lg bg-canvas text-[13px] font-semibold flex items-center gap-1.5">
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>
        {agg.byDate.size === 0 ? (
          <p className="px-4 pb-4 text-[14px] text-ink-3">Belum ada data di rentang ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums whitespace-nowrap">
              <thead className="bg-canvas text-[11px] uppercase text-ink-2">
                <tr>
                  <th className="text-left px-4 py-2">Tanggal</th>
                  <th className="text-right px-3">PaHe</th>
                  <th className="text-right px-3">GB Hemat</th>
                  <th className="text-right px-3">Total</th>
                  <th className="text-right px-3">Target</th>
                  <th className="text-right px-3">Stamp</th>
                  <th className="text-right px-3">Cek Boros</th>
                  <th className="text-right px-3">Reach</th>
                  <th className="text-right px-4">Contacts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Array.from(agg.byDate.entries())
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([d, v]) => {
                    const tot = v.pahe_new + v.pahe_lapsed + v.gb_hemat;
                    const pct = Math.round((tot / DAILY_TARGET) * 100);
                    return (
                      <tr key={d}>
                        <td className="px-4 py-2">{fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                        <td className="text-right px-3">{nf(v.pahe_new + v.pahe_lapsed)}</td>
                        <td className="text-right px-3">{nf(v.gb_hemat)}</td>
                        <td className="text-right px-3 font-bold">{nf(tot)}</td>
                        <td className={`text-right px-3 font-semibold ${pct >= 100 ? 'text-grab-deep' : 'text-ink-2'}`}>{pct}%</td>
                        <td className="text-right px-3">{nf(v.stamps)}</td>
                        <td className="text-right px-3">{nf(v.boros)}</td>
                        <td className="text-right px-3">{nf(v.reach)}</td>
                        <td className="text-right px-4">{nf(v.contacts || v.boros)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 py-3 text-[11px] text-ink-3">File berisi rincian per tanggal dan per unit. Target {nf(DAILY_TARGET)} conversion/hari (3 unit).</p>
      </section>

      <section className={`${card} overflow-hidden`}>
        <h3 className="px-4 pt-4 pb-2 text-[15px] font-bold">Per venue</h3>
        {agg.byPoi.length === 0 ? (
          <p className="px-4 pb-4 text-[14px] text-ink-3">Belum ada conversion di rentang ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead className="bg-canvas text-[11px] uppercase text-ink-2">
                <tr>
                  <th className="text-left px-4 py-2">Venue</th>
                  <th className="text-right px-3">PaHe</th>
                  <th className="text-right px-3">GB Hemat</th>
                  <th className="text-right px-4">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {agg.byPoi.slice(0, 50).map(([poi, p]) => (
                  <tr key={poi}>
                    <td className="px-4 py-2">{poi}</td>
                    <td className="text-right px-3">{nf(p.pahe)}</td>
                    <td className="text-right px-3">{nf(p.gb)}</td>
                    <td className="text-right px-4 font-bold">{nf(p.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>)}
    </div>
  );
};
