import { CountUp } from '../components/CountUp';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, Eye, KeyRound, RefreshCw, Sparkles, TriangleAlert, X } from 'lucide-react';
import { getSupabaseClient } from '../services/supabase';
import { CAMPAIGN_START, REWARD_LABEL, STOCK_ITEMS, TYPE_LABEL, fieldApi, merchLabel, shiftInfo, usageFromRewards, ConvType, Reward } from '../field/api';
import { fetchSettingsRemote } from '../services/supabase';
import { mergeSettings } from '../report/engine';
import { BarChart, DashboardSkeleton, HBarList } from '../components/Charts';
import { StampCardImage, downloadStampCard } from '../field/StampCard';
import { GbLeaderboard, lbToCsv } from '../components/GbLeaderboard';
import { useRealtime } from '../hooks/useRealtime';
import { normBorosStatus } from '../utils/borosStatus';
import { AnomalyPanel, FieldAdmin, IssuesPanel, SummaryPanel, WarehousePanel, useIssues } from './FieldOps';

/**
 * Dashboard office untuk Field App (fase 1): semua unit real time, kumulatif vs target,
 * per unit / POI / SPG, double claim, stok & variance, close day, export, PIN unit, Peringkat GrabBike Hemat.
 */

interface Conv {
  id: string;
  created_at: string;
  synced_at: string;
  claim_day: string;
  unit_id: string;
  shift: string;
  spg_name: string;
  poi_location: string | null;
  poi_category: string | null;
  phone_last4: string | null;
  name: string;
  type: ConvType;
  reward: Reward;
  extra_draw: boolean;
  photobooth: boolean;
  photo_path: string | null;
  photo_archive_file?: string | null;
  status: 'ok' | 'conflict';
  conflict_note: string | null;
  backfill?: boolean;
  entered_by?: string | null;
  merch?: string | null;
  reward2?: Reward | null;
  merch2?: string | null;
  prize?: string | null;
}

const UNITS: Record<string, string> = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk Diskon 1', kiosk2: 'Kiosk Diskon 2' };
const DAILY_TARGET = 600;
const card = 'bg-white rounded-2xl';
const th = 'px-3 py-2.5 text-[11px] font-semibold text-ink-2 uppercase tracking-wide whitespace-nowrap text-left';
const td = 'px-3 py-2.5 text-[13px] tabular-nums whitespace-nowrap';
const nf = (n: number) => n.toLocaleString('id-ID');
const timeWIB = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

async function selectAll<T>(table: string, cols: string, filter: (q: any) => any): Promise<T[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(sb.from(table).select(cols)).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export { dedupePeople } from '../utils/people';
import { dedupePeople } from '../utils/people';

export const FieldPanel: React.FC<{ from: string; to: string; isOwner: boolean }> = ({ from, to, isOwner }) => {
  const [rows, setRows] = useState<Conv[]>([]);
  const [closeDays, setCloseDays] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [cum, setCum] = useState<{ total: number; start: string; days: number; target: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [unit, setUnit] = useState('all');
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);
  const { issues, reload: reloadIssues } = useIssues(from, to);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cd, st, raw] = await Promise.all([
        selectAll<Conv>('modis_conversions', 'id,created_at,synced_at,claim_day,unit_id,shift,spg_name,poi_location,poi_category,phone_last4,name,type,reward,extra_draw,photobooth,photo_path,photo_archive_file,status,conflict_note,backfill,entered_by,merch,reward2,merch2,prize', (q) =>
          q.gte('claim_day', from).lte('claim_day', to).order('created_at', { ascending: false }),
        ),
        selectAll<any>('modis_close_days', '*', (q) => q.gte('day', from).lte('day', to).order('day', { ascending: false })),
        selectAll<any>('modis_stock_moves', 'unit_id,day,shift,kind,item,qty,by_name,created_at', (q) => q.gte('day', new Date(Date.parse(`${from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)).lte('day', to)),
        fetchSettingsRemote().catch(() => ({})),
      ]);
      setRows(c);
      setCloseDays(cd);
      setStock(st);
      const s = mergeSettings(raw);
      const sb = getSupabaseClient();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
      const cumRows = await selectAll<any>('modis_conversions', 'claim_day,name,phone_last4,type,created_at', (q) => q.eq('status', 'ok').gte('claim_day', s.campaign.start));
      setCum({ total: dedupePeople(cumRows).length, start: s.campaign.start, days: Math.max(0, Math.min(s.campaign.days, dayDiff(s.campaign.start, today))), target: s.targets.conversion });
      setError(null);
      setUpdated(new Date());
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat');
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [from, to]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 15_000);
    return () => window.clearInterval(t);
  }, [load]);
  useRealtime(['modis_conversions', 'modis_close_days', 'modis_stock_moves', 'modis_gb_history', 'modis_boros_checks'], load);

  const view = useMemo(() => rows.filter((r) => unit === 'all' || r.unit_id === unit), [rows, unit]);
  const ok = view.filter((r) => r.status === 'ok');
  const conflicts = view.filter((r) => r.status === 'conflict');
  const days = Math.max(1, dayDiff(from, to));
  // Hitungan conversion = per ORANG per hari (nama + 4 digit nomor sama digabung; tipe utama PaHe New > Right > GB Hemat).
  // Reward, stok, dan daftar tetap per submission.
  const people = useMemo(() => dedupePeople(ok), [ok]);
  const count = (t: ConvType) => people.filter((r) => r.type === t).length;
  const rewardCount = (k: Reward, list = ok) => list.filter((r) => r.reward === k).length;
  const reach = closeDays.filter((c) => unit === 'all' || c.unit_id === unit).reduce((a, c) => a + (c.reach || 0), 0);
  const contacts = closeDays.filter((c) => unit === 'all' || c.unit_id === unit).reduce((a, c) => a + (c.contacts || 0), 0);
  const target = DAILY_TARGET * days * (unit === 'all' ? 1 : 1 / 3);

  const group = (key: (r: Conv) => string) => {
    const m = new Map<string, { n: number; pn: number; pl: number; gb: number; pb: number; last: string; sub?: string }>();
    people.forEach((r) => {
      const k = key(r) || '—';
      const g = m.get(k) || { n: 0, pn: 0, pl: 0, gb: 0, pb: 0, last: r.created_at };
      g.n++;
      if (r.type === 'pahe_new') g.pn++;
      if (r.type === 'pahe_lapsed') g.pl++;
      if (r.type === 'gb_hemat') g.gb++;
      if (r.photobooth) g.pb++;
      if (r.created_at > g.last) g.last = r.created_at;
      m.set(k, g);
    });
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n);
  };

  // Variance stok per unit & hari
  const variance = useMemo(() => {
    const keys = Array.from(new Set(stock.filter((s) => s.day >= from).map((s) => `${s.day}|${s.unit_id}`))).sort().reverse();
    return keys.map((k) => {
      const [day, u] = k.split('|');
      const mv = stock.filter((s) => s.day === day && s.unit_id === u);
      const rw: Partial<Record<Reward, number>> = {};
      const mc: Record<string, number> = {};
      let pb = 0;
      rows
        .filter((r) => r.claim_day === day && r.unit_id === u && r.status === 'ok')
        .forEach((r) => {
          rw[r.reward] = (rw[r.reward] || 0) + 1;
          if (r.reward2) rw[r.reward2] = (rw[r.reward2] || 0) + 1;
          [r.merch, r.merch2].forEach((m) => m && (mc[m] = (mc[m] || 0) + 1));
          if (r.photobooth) pb++;
        });
      const used = usageFromRewards(rw, mc, pb);
      const items = STOCK_ITEMS.map((it) => {
        const sum = (kind: string) => mv.filter((m) => m.kind === kind && m.item === it.id).reduce((a, m) => a + m.qty, 0);
        const hasClosing = mv.some((m) => m.kind === 'closing' && m.item === it.id);
        const opening = sum('opening');
        const refill = sum('refill');
        const closing = sum('closing');
        const expected = opening + refill - used[it.id];
        const diff = closing - expected;
        const flag = hasClosing && opening + refill > 0 && Math.abs(diff) / (opening + refill) > 0.02;
        return { ...it, opening, refill, used: used[it.id], closing, hasClosing, diff, flag };
      });
      return { day, unit: u, items, flagged: items.filter((i) => i.flag).length };
    });
  }, [stock, rows]);

  const openPhoto = async (path: string | null) => {
    if (!path) return;
    const url = await fieldApi.signedPhoto(path);
    if (url) setPhoto(url);
  };

  const resolve = async (id: string, okv: boolean) => {
    try {
      await fieldApi.resolve(id, okv);
      load();
    } catch (e: any) {
      setError(e?.message);
    }
  };

  const exportXlsx = async () => {
    let data: any[];
    if (isOwner) data = await fieldApi.exportRange(from, to);
    else data = rows.map((r) => ({ ...r, phone: r.phone_last4 ? `••${r.phone_last4}` : '' }));
    const cols = ['created_at', 'claim_day', 'unit_id', 'shift', 'spg_name', 'poi_location', 'name', 'phone', 'type', 'reward', 'status'];
    const XLSX: any = await import('xlsx');
    const aoa = [cols, ...data.map((d) => cols.map((c) => (c === 'created_at' ? new Date(d[c]).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : d[c] ?? '')))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map((c) => ({ wch: c === 'created_at' ? 20 : c === 'name' || c === 'poi_location' ? 24 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conversion');
    XLSX.writeFile(wb, `MODIS_conversion_${from}${from !== to ? `_sd_${to}` : ''}.xlsx`);
  };

  const exportCsv = async () => {
    let data: any[];
    if (isOwner) data = await fieldApi.exportRange(from, to);
    else data = rows.map((r) => ({ ...r, phone: r.phone_last4 ? `••${r.phone_last4}` : '' }));
    const cols = ['created_at', 'claim_day', 'unit_id', 'shift', 'spg_name', 'poi_location', 'poi_category', 'name', 'phone', 'email', 'type', 'reward', 'extra_draw', 'photobooth', 'status', 'conflict_note', 'photo_path', 'backfill', 'entered_by', 'merch', 'reward2', 'merch2', 'prize'].filter((c) => isOwner || c !== 'email');
    const esc = (v: any) => {
      let s = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [cols.join(';'), ...data.map((d) => cols.map((c) => esc(c === 'created_at' ? new Date(d[c]).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : c === 'merch' || c === 'merch2' || c === 'prize' ? merchLabel(d[c]) : d[c])).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `MODIS_conversion_${from}${from !== to ? `_sd_${to}` : ''}.csv`;
    a.click();
  };

  const Kpi = ({ label, value, sub, tone = '' }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div className={`${card} kpi-card p-4 ${tone}`}>
      <p className="text-[12px] text-ink-2">{label}</p>
      <p className="font-display text-[26px] font-extrabold tabular-nums leading-tight"><CountUp text={value} /></p>
      {sub && <p className="text-[12px] text-ink-3">{sub}</p>}
    </div>
  );

  const total = people.length;
  const dayTarget = unit === 'all' ? DAILY_TARGET : DAILY_TARGET / 3;
  const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const trend = Array.from({ length: Math.min(days, 120) }, (_, i) => {
    const d = addDay(from, i);
    const n = people.filter((r) => r.claim_day === d).length;
    const dt = new Date(`${d}T00:00:00Z`);
    return { key: d, label: `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`, value: n, tip: dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) };
  });
  const hourOf = (iso: string) => Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }));
  const hours = Array.from({ length: 15 }, (_, i) => {
    const h = 7 + i;
    return { key: String(h), label: String(h).padStart(2, '0'), value: people.filter((r) => hourOf(r.created_at) === h).length, tip: `Jam ${String(h).padStart(2, '0')}.00–${String(h + 1).padStart(2, '0')}.00` };
  });
  const topVenue = (() => {
    const m = new Map<string, number>();
    people.forEach((r) => r.poi_location && m.set(r.poi_location, (m.get(r.poi_location) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  })();
  const peak = hours.reduce((a, h) => (h.value > a.value ? h : a), hours[0]);

  if (!loadedOnce && loading) return <DashboardSkeleton />;
  return (
    <div className="space-y-4 animate-fade-in">
      <section className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="font-display text-[18px] font-bold">Field App · conversion lapangan</h2>
          <p className="text-[13px] text-ink-2">
            Data dari tablet crew (/crew) · muat ulang tiap 30 detik{updated && ` · ${updated.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px]">
            <option value="all">Semua unit</option>
            {Object.entries(UNITS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button onClick={load} className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px] font-semibold flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
          <button onClick={exportXlsx} className="h-10 px-3 rounded-xl bg-grab-cta text-white text-[14px] font-semibold flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export XLSX
          </button>
          <button onClick={exportCsv} className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px] font-semibold flex items-center gap-1.5">
            <Download className="w-4 h-4" /> CSV {isOwner ? '(nomor lengkap)' : '(tersamar)'}
          </button>
        </div>
      </section>
      {error && <p className="text-[13px] text-modis-red bg-white rounded-xl p-3">{error}</p>}

      {cum && (
        <section className={`${card} p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-bold">Kumulatif campaign (semua unit, sejak {cum.start})</h3>
            <span className="text-[13px] text-ink-2">
              Hari ke-{cum.days} · target s/d hari ini {nf(cum.days * DAILY_TARGET)}
            </span>
          </div>
          <p className="mt-1 font-display text-[30px] font-extrabold tabular-nums">
            <span key={cum.total} className="num-flash">{nf(cum.total)}</span> <span className="text-[15px] font-semibold text-ink-2">/ {nf(cum.target)} conversion</span>
          </p>
          <div className="mt-2 h-3 rounded-full bg-canvas overflow-hidden relative">
            <div className="h-full bg-grab rounded-full" style={{ width: `${Math.min(100, (cum.total / cum.target) * 100)}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${Math.min(100, ((cum.days * DAILY_TARGET) / cum.target) * 100)}%` }} title="Target s/d hari ini" />
          </div>
        </section>
      )}

      <PhotoBacklog />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Conversion (periode)" value={nf(total)} sub={`Target ${nf(Math.round(target))} · ${Math.round((total / Math.max(1, target)) * 100)}%`} />
        <Kpi label="PaHe New" value={nf(count('pahe_new'))} />
        <Kpi label="PaHe Churned" value={nf(count('pahe_lapsed'))} />
        <Kpi label="GB Hemat ride" value={nf(count('gb_hemat'))} />
        <Kpi label="Reach (close day)" value={nf(reach)} />
        <Kpi label="Contacts (close day)" value={nf(contacts)} />
        <Kpi label="Photobooth" value={nf(people.filter((r) => r.photobooth).length)} />
        <Kpi label="Double claim ditandai" value={nf(conflicts.length)} tone={conflicts.length ? 'ring-2 ring-modis-red/40' : ''} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <section className={`${card} p-4 lg:col-span-3`}>
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="text-[15px] font-bold">{days > 1 ? 'Tren harian' : 'Hari ini'}</h3>
            <span className="text-[12px] text-ink-3">garis = target {nf(Math.round(dayTarget))}/hari</span>
          </div>
          {days > 1 ? (
            <BarChart data={trend} target={Math.round(dayTarget)} targetLabel="target" empty="Belum ada conversion di periode ini." />
          ) : (
            <BarChart data={hours} empty="Belum ada conversion hari ini." />
          )}
        </section>
        <section className={`${card} p-4 lg:col-span-2`}>
          <h3 className="text-[15px] font-bold mb-3">Venue terbanyak</h3>
          <HBarList items={topVenue} empty="Belum ada conversion di periode ini." />
        </section>
      </div>
      {days > 1 && (
        <section className={`${card} p-4`}>
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="text-[15px] font-bold">Jam ramai</h3>
            {peak.value > 0 && <span className="text-[12px] text-ink-3">paling ramai {peak.label}.00 ({nf(peak.value)} conversion)</span>}
          </div>
          <BarChart data={hours} height={140} empty="Belum ada data jam." />
        </section>
      )}

      <StampPanel from={from} to={to} rows={rows} unit={unit} />
      <BorosPanel from={from} to={to} unit={unit} total={people.length} />
      <GbLeaderboard
        campaignStart={CAMPAIGN_START}
        load={(f, t) => fieldApi.leaderboard(f, t, false)}
        exportCsv={isOwner ? async (f, t) => lbToCsv(await fieldApi.leaderboard(f, t, true), f, t) : undefined}
      />

      <SummaryPanel rows={view} closeDays={closeDays.filter((c) => unit === 'all' || c.unit_id === unit)} issues={issues} from={from} to={to} />
      <IssuesPanel issues={issues.filter((i) => unit === 'all' || i.unit_id === unit)} reload={reloadIssues} isOwner={isOwner} />
      <AnomalyPanel rows={view} stock={stock.filter((s) => unit === 'all' || s.unit_id === unit)} />
      <ClientErrors isOwner={isOwner} />

      <section className={`${card} p-4`}>
        <h3 className="text-[15px] font-bold mb-2">Reward keluar</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {(['snack', 'drink', 'candy', 'tier_c', 'tier_b', 'tier_a'] as Reward[]).map((k) => (
            <div key={k} className="rounded-xl bg-canvas p-3">
              <p className="text-[11px] text-ink-2">{REWARD_LABEL[k]}</p>
              <p className="text-[20px] font-extrabold tabular-nums">{nf(rewardCount(k))}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {(
          [
            ['Per unit', (r: Conv) => UNITS[r.unit_id] || r.unit_id],
            ['Per POI', (r: Conv) => r.poi_location || '—'],
            ['Per SPG', (r: Conv) => `${r.spg_name} · ${UNITS[r.unit_id] || r.unit_id}`],
          ] as [string, (r: Conv) => string][]
        ).map(([title, fn]) => (
          <section key={title} className={`${card} overflow-hidden`}>
            <h3 className="px-4 pt-4 pb-2 text-[15px] font-bold">{title}</h3>
            <div className="overflow-x-auto max-h-[360px]">
              <table className="w-full">
                <thead className="bg-canvas sticky top-0">
                  <tr>
                    <th className={th}>Nama</th>
                    <th className={`${th} text-right`}>Total</th>
                    <th className={`${th} text-right`}>Baru</th>
                    <th className={`${th} text-right`}>Lapsed</th>
                    <th className={`${th} text-right`}>GB</th>
                    <th className={`${th} text-right`}>Terakhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {group(fn).map(([k, g]) => (
                    <tr key={k}>
                      <td className={`${td} font-semibold !whitespace-normal min-w-[140px]`}>{k}</td>
                      <td className={`${td} text-right font-bold`}>{g.n}</td>
                      <td className={`${td} text-right`}>{g.pn}</td>
                      <td className={`${td} text-right`}>{g.pl}</td>
                      <td className={`${td} text-right`}>{g.gb}</td>
                      <td className={`${td} text-right text-ink-3`}>{timeWIB(g.last)}</td>
                    </tr>
                  ))}
                  {people.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[13px] text-ink-3">
                        Belum ada data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {/* Data conversion */}
      <section className={`${card} overflow-hidden`}>
        <div className="px-4 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-bold">Data conversion ({view.length})</h3>
          <label className="text-[13px] flex items-center gap-2">
            <input type="checkbox" checked={showConflictsOnly} onChange={(e) => setShowConflictsOnly(e.target.checked)} className="accent-[#00B14F]" /> Hanya double claim
          </label>
        </div>
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full">
            <thead className="bg-canvas sticky top-0">
              <tr>
                <th className={th}>Waktu</th>
                <th className={th}>Unit · SPG</th>
                <th className={th}>Venue</th>
                <th className={th}>Customer</th>
                <th className={th}>Tipe</th>
                <th className={th}>Reward</th>
                <th className={th}>Bukti</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(showConflictsOnly ? conflicts : view).slice(0, 500).map((r) => (
                <tr key={r.id} className={r.status === 'conflict' ? 'bg-[#FDECEA]/60' : ''}>
                  <td className={td}>
                    {r.claim_day.slice(5)} {timeWIB(r.created_at)}
                  </td>
                  <td className={td}>
                    {UNITS[r.unit_id] || r.unit_id} · {r.spg_name} · {shiftInfo(r.shift).name}
                    {r.backfill && (
                      <span title={`Input susulan oleh ${r.entered_by || 'TL'}`} className="ml-1.5 px-1.5 py-0.5 rounded-md bg-[#FFF9DB] text-[#8A5300] text-[11px] font-bold">
                        susulan
                      </span>
                    )}
                  </td>
                  <td className={`${td} !whitespace-normal min-w-[140px]`}>{r.poi_location || '—'}</td>
                  <td className={td}>
                    {r.name} <span className="text-ink-3">••{r.phone_last4}</span>
                  </td>
                  <td className={td}>{TYPE_LABEL[r.type]}</td>
                  <td className={td}>
                    {REWARD_LABEL[r.reward]}
                    {r.merch || r.prize ? ` (${merchLabel(r.merch || r.prize)})` : ''}
                    {r.photobooth ? ' · photobooth' : ''}
                    {r.extra_draw ? ` · draw ke-2: ${r.reward2 ? REWARD_LABEL[r.reward2] : '-'}${r.merch2 ? ` (${merchLabel(r.merch2)})` : ''}` : ''}
                  </td>
                  <td className={td}>
                    {r.photo_archive_file ? (
                      <span title={r.photo_archive_file} className="text-grab-deep font-semibold">Tersimpan di PC kantor</span>
                    ) : r.photo_path ? (
                      <button onClick={() => openPhoto(r.photo_path)} className="text-grab-cta font-semibold flex items-center gap-1">
                        <Eye className="w-4 h-4" /> Lihat
                      </button>
                    ) : (
                      <span className="text-ink-3">{r.backfill ? 'di Google Form' : 'menunggu'}</span>
                    )}
                  </td>
                  <td className={`${td} !whitespace-normal min-w-[220px]`}>
                    {r.status === 'ok' ? (
                      <span className="text-grab-deep font-semibold">OK</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-modis-red font-semibold flex items-center gap-1">
                          <TriangleAlert className="w-4 h-4" /> {r.conflict_note || 'Double claim'}
                        </span>
                        {isOwner && (
                          <>
                            <button onClick={() => resolve(r.id, true)} title="Setujui" className="w-7 h-7 rounded-lg bg-grab-tint text-grab-deep flex items-center justify-center">
                              <Check className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {view.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-[13px] text-ink-3">
                    Belum ada conversion di periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stok & variance */}
      <section className={`${card} overflow-hidden`}>
        <h3 className="px-4 pt-4 pb-2 text-[15px] font-bold">Stok unit &amp; variance (selisih lebih dari 2% ditandai)</h3>
        {variance.length === 0 && <p className="px-4 pb-4 text-[13px] text-ink-3">Belum ada input stok dari TL.</p>}
        {variance
          .filter((v) => unit === 'all' || v.unit === unit)
          .map((v) => (
            <details key={`${v.day}${v.unit}`} className="border-t border-line">
              <summary className="px-4 py-3 cursor-pointer text-[14px] flex items-center gap-2">
                <span className="font-semibold">
                  {v.day} · {UNITS[v.unit] || v.unit}
                </span>
                {v.flagged ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#FDECEA] text-modis-red text-[12px] font-bold">{v.flagged} item selisih</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-grab-tint text-grab-deep text-[12px] font-bold">sesuai</span>
                )}
              </summary>
              <div className="overflow-x-auto px-2 pb-3">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Item</th>
                      <th className={`${th} text-right`}>Open</th>
                      <th className={`${th} text-right`}>Refill</th>
                      <th className={`${th} text-right`}>Pakai</th>
                      <th className={`${th} text-right`}>Closing</th>
                      <th className={`${th} text-right`}>Selisih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {v.items.map((i) => (
                      <tr key={i.id} className={i.flag ? 'bg-[#FDECEA]' : ''}>
                        <td className={td}>{i.label}</td>
                        <td className={`${td} text-right`}>{i.opening}</td>
                        <td className={`${td} text-right`}>{i.refill}</td>
                        <td className={`${td} text-right`}>{i.used}</td>
                        <td className={`${td} text-right`}>{i.hasClosing ? i.closing : '-'}</td>
                        <td className={`${td} text-right font-bold ${i.flag ? 'text-modis-red' : ''}`}>{i.hasClosing ? i.diff : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
      </section>

      <WarehousePanel from={from} to={to} isOwner={isOwner} stock={stock} />

      {/* Close day */}
      <section className={`${card} overflow-hidden`}>
        <h3 className="px-4 pt-4 pb-2 text-[15px] font-bold">Close day dari TL</h3>
        {closeDays.length === 0 && <p className="px-4 pb-4 text-[13px] text-ink-3">Belum ada close day.</p>}
        {closeDays
          .filter((c) => unit === 'all' || c.unit_id === unit)
          .map((c) => (
            <details key={`${c.unit_id}${c.day}`} className="border-t border-line">
              <summary className="px-4 py-3 cursor-pointer text-[14px]">
                <span className="font-semibold">
                  {c.day} · {UNITS[c.unit_id] || c.unit_id}
                </span>{' '}
                · TL {c.closed_by} · reach {nf(c.reach)} · contacts {nf(c.contacts)}
              </summary>
              <pre className="mx-4 mb-4 whitespace-pre-wrap text-[13px] bg-canvas rounded-xl p-3 font-sans">{c.summary?.text || JSON.stringify(c.summary, null, 2)}</pre>
            </details>
          ))}
      </section>

      {isOwner && <FieldSettings />}
      {isOwner && <FieldAdmin />}

      {photo && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4" onClick={() => setPhoto(null)}>
          <img src={photo} alt="Bukti" className="max-h-[90vh] max-w-full rounded-xl" />
          <button className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white flex items-center justify-center" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

/** Pengaturan office: PIN unit & TL. */
const FieldSettings: React.FC = () => {
  const [unit, setUnit] = useState('mobil');
  const [role, setRole] = useState<'spg' | 'tl'>('spg');
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const savePin = async () => {
    setMsg(null);
    try {
      await fieldApi.setPin(unit, role, pin);
      setMsg(`PIN ${role === 'tl' ? 'TL' : 'SPG'} ${UNITS[unit]} diganti. Beri tahu crew unit tersebut.`);
      setPin('');
    } catch (e: any) {
      setMsg(`Gagal: ${e?.message}`);
    }
  };
  const inp = 'h-11 px-3 rounded-xl border border-[#D5D8DC] bg-white text-[14px] outline-none focus:border-grab';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <section className={`${card} p-4 space-y-3`}>
        <h3 className="text-[15px] font-bold flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-grab" /> Ganti PIN unit / TL
        </h3>
        <div className="flex flex-wrap gap-2">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inp}>
            {Object.entries(UNITS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as any)} className={inp}>
            <option value="spg">PIN SPG</option>
            <option value="tl">PIN TL</option>
          </select>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" placeholder="PIN baru 4-8 angka" className={`${inp} w-44`} />
          <button onClick={savePin} disabled={pin.length < 4} className="h-11 px-4 rounded-xl bg-grab-cta text-white font-semibold text-[14px] disabled:opacity-40">
            Simpan
          </button>
        </div>
        {msg && <p className="text-[13px]">{msg}</p>}
        <p className="text-[12px] text-ink-3">Sesi yang sudah login tetap berlaku sampai logout atau 12 jam.</p>
      </section>
    </div>
  );
};


/** Kartu stamp lengkap (PaHe + GB Hemat di hari yang sama), tercatat otomatis oleh database. */
const StampPanel: React.FC<{ from: string; to: string; rows: Conv[]; unit: string }> = ({ from, to, rows, unit }) => {
  const [cards, setCards] = useState<{ id: number; day: string; unit_id: string; poi_location: string | null; pahe_id: string; gb_id: string; completed_at: string }[]>([]);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  useEffect(() => {
    getSupabaseClient()
      ?.from('modis_stamp_cards')
      .select('id,day,unit_id,poi_location,pahe_id,gb_id,completed_at')
      .gte('day', from)
      .lte('day', to)
      .order('completed_at', { ascending: false })
      .then(({ data }) => setCards((data as any[]) || []));
  }, [from, to, rows.length]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const list = cards
    .filter((c) => unit === 'all' || c.unit_id === unit)
    .map((c) => {
      const r = byId.get(c.gb_id) || byId.get(c.pahe_id);
      return { ...c, name: r?.name || '-', last4: r?.phone_last4 || null };
    })
    .filter((c) => !q.trim() || `${c.name} ${c.last4} ${c.poi_location}`.toLowerCase().includes(q.trim().toLowerCase()));
  const shown = all ? list : list.slice(0, 8);
  return (
    <section className={`${card} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-bold">Kartu stamp lengkap ({nf(list.length)})</h3>
          <p className="text-[12px] text-ink-3">Tercatat otomatis saat customer dapat stamp PaHe + GB Hemat di hari yang sama.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / 4 digit HP / venue" className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px] w-full sm:w-64" />
      </div>
      {list.length === 0 ? (
        <p className="text-[13px] text-ink-3 py-4 text-center">Belum ada kartu stamp lengkap di periode ini.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {shown.map((c) => {
            const data = { name: c.name, last4: c.last4, day: c.day, unit: UNITS[c.unit_id] || c.unit_id, venue: c.poi_location, s1: true, s2: true };
            return (
              <div key={c.id} className="space-y-1.5">
                <StampCardImage data={data} className="!shadow-sm" />
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate">
                    <b>{c.name}</b> ••{c.last4} · {timeWIB(c.completed_at)}
                  </span>
                  <button onClick={() => downloadStampCard(data)} className="shrink-0 text-grab-cta font-semibold flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> JPG
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {list.length > 8 && (
        <button onClick={() => setAll(!all)} className="text-[13px] font-semibold text-grab-cta">
          {all ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${nf(list.length)})`}
        </button>
      )}
    </section>
  );
};

const BOROS_ORDER = ['Sangat Boros', 'Boros', 'Lumayan Boros', 'Cukup Hemat'];
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

/** Hasil Cek Boros dari input customer (tanpa data pribadi), sama dengan yang dilihat klien. */
const BorosPanel: React.FC<{ from: string; to: string; unit: string; total: number }> = ({ from, to, unit, total }) => {
  const [list, setList] = useState<{ unit_id: string; status: string | null; savings: number | null; monthly_cost: number | null; poi_location: string | null }[]>([]);
  useEffect(() => {
    const go = () =>
      getSupabaseClient()
        ?.from('modis_boros_checks')
        .select('unit_id,status,savings,monthly_cost,poi_location')
        .gte('day', from)
        .lte('day', to)
        .limit(5000)
        .then(({ data }) => setList((data as any[]) || []));
    go();
    const t = window.setInterval(go, 15_000);
    return () => window.clearInterval(t);
  }, [from, to]);
  const v = list.filter((b) => unit === 'all' || b.unit_id === unit);
  const n = v.length;
  const byStatus: Record<string, number> = {};
  v.forEach((b) => {
    const st = normBorosStatus(b.status);
    byStatus[st] = (byStatus[st] || 0) + 1;
  });
  const avgSave = n ? v.reduce((a, b) => a + (b.savings || 0), 0) / n : 0;
  const avgCost = n ? v.reduce((a, b) => a + (b.monthly_cost || 0), 0) / n : 0;
  return (
    <section className={`${card} p-4 space-y-3`}>
      <div>
        <h3 className="text-[15px] font-bold">Hasil Cek Boros ({nf(n)})</h3>
        <p className="text-[12px] text-ink-3">Dari input customer di tablet · {total ? `${Math.round((n / total) * 100)}% dari conversion` : 'belum ada conversion'} · tanpa nama / nomor HP.</p>
      </div>
      {n === 0 ? (
        <p className="text-[13px] text-ink-3 py-4 text-center">Belum ada hasil Cek Boros di periode ini.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BOROS_ORDER.map((st) => (
              <div key={st} className="rounded-xl bg-canvas p-3">
                <p className="text-[11px] text-ink-2">{st}</p>
                <p className="text-[20px] font-extrabold tabular-nums">{nf(byStatus[st] || 0)}</p>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-ink-2">
            Rata-rata ongkos perjalanan <b>{rp(avgCost)}</b>/bulan · potensi hemat PAHE <b>{rp(avgSave)}</b>/bulan per customer.
          </p>
        </>
      )}
    </section>
  );
};


/** Status arsip foto di PC kantor. Merah bila PC lama tidak memberi kabar atau foto menumpuk. */
const PhotoBacklog: React.FC = () => {
  const [d, setD] = useState<{ pending: number; oldest: string | null; archived: number; pcSeen: string | null; pcInfo: any } | null>(null);
  const [, tick] = useState(0);
  const load = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data } = await sb.rpc('modis_f1_photo_backlog', {});
    const row = Array.isArray(data) ? data[0] : data;
    if (row) setD({ pending: Number(row.pending) || 0, oldest: row.oldest || null, archived: Number(row.archived) || 0, pcSeen: row.pc_seen || null, pcInfo: row.pc_info || null });
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      void load();
      tick((n) => n + 1);
    }, 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  useRealtime(['modis_conversations'], load);
  if (!d || (d.pending === 0 && d.archived === 0 && !d.pcSeen)) return null;
  const ageH = d.oldest ? (Date.now() - new Date(d.oldest).getTime()) / 3_600_000 : 0;
  const pcMin = d.pcSeen ? (Date.now() - new Date(d.pcSeen).getTime()) / 60_000 : null;
  const pcDown = pcMin === null ? d.pending > 0 : pcMin > 90;
  const pcSlow = pcMin !== null && pcMin > 45 && !pcDown;
  const warn = d.pending > 0 && ageH > 2;
  const danger = (d.pending > 0 && ageH > 48) || (pcDown && d.pending > 0);
  const tone = danger ? 'bg-[#FDECEA] text-modis-red' : warn || pcDown || pcSlow ? 'bg-[#FFF8E1] text-[#8A5300]' : 'bg-grab-tint text-grab-deep';
  const ago = (m: number) => (m < 60 ? `${Math.round(m)} menit` : m < 1440 ? `${Math.round(m / 60)} jam` : `${Math.round(m / 1440)} hari`);
  const free = d.pcInfo?.free_gb != null ? ` · sisa disk PC ${d.pcInfo.free_gb} GB` : '';
  return (
    <section className={`rounded-2xl px-4 py-3 text-[13px] font-semibold space-y-0.5 ${tone}`}>
      <p>
        Foto bukti: {d.pending} menunggu diunduh ke PC kantor · {d.archived} sudah tersimpan di PC
        {warn && d.oldest ? ` · tertua ${Math.round(ageH)} jam lalu` : ''}
      </p>
      <p className="font-medium">
        {pcMin === null
          ? 'PC kantor belum pernah memberi kabar. Pastikan skrip arsip sudah diisi config.json.'
          : pcDown
            ? `PC kantor terakhir memberi kabar ${ago(pcMin)} lalu. Cek apakah PC menyala, online, dan skrip arsip berjalan.`
            : `PC kantor aktif (kabar terakhir ${ago(pcMin)} lalu)${free}`}
      </p>
    </section>
  );
};

/** Galat yang terjadi di tablet crew (dicatat otomatis, tanpa data customer). */
const ClientErrors: React.FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data } = await sb.rpc('modis_f1_errors', { p_limit: 100 });
    setRows(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  const clear = async () => {
    const sb = getSupabaseClient();
    if (!sb || !window.confirm('Hapus semua catatan galat tablet?')) return;
    await sb.rpc('modis_f1_errors_clear', {});
    void load();
  };
  const day = rows ? rows.filter((r) => Date.now() - new Date(r.at).getTime() < 86_400_000) : [];
  const total24 = day.reduce((a, r) => a + (Number(r.hits) || 1), 0);
  return (
    <section className="rounded-2xl bg-white p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-display text-[17px] font-bold">Galat di tablet crew</h2>
          <p className="text-[13px] text-ink-2">
            {rows === null ? 'Memuat…' : rows.length === 0 ? 'Belum ada galat tercatat.' : `${day.length} jenis galat (${total24} kejadian) dalam 24 jam terakhir.`}
          </p>
        </div>
        <div className="flex gap-2">
          {rows && rows.length > 0 && (
            <button onClick={() => setOpen((v) => !v)} className="h-9 px-3 rounded-lg text-grab-cta font-semibold hover:bg-grab-tint-2">
              {open ? 'Tutup daftar' : 'Lihat daftar'}
            </button>
          )}
          {isOwner && rows && rows.length > 0 && (
            <button onClick={clear} className="h-9 px-3 rounded-lg text-modis-red font-semibold hover:bg-[#FDECEA]">
              Hapus catatan
            </button>
          )}
        </div>
      </div>
      {open && rows && (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[12px] min-w-[720px]">
            <thead className="text-ink-2 text-left font-semibold">
              <tr>
                <th className="py-2 pr-2">Terakhir</th>
                <th className="py-2 pr-2">Unit · SPG</th>
                <th className="py-2 pr-2">Versi</th>
                <th className="py-2 pr-2 text-right">Kali</th>
                <th className="py-2">Pesan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} title={r.stack || ''}>
                  <td className="py-2 pr-2 whitespace-nowrap">{new Date(r.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{[r.unit_id, r.spg].filter(Boolean).join(' · ') || '-'}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{r.app_ver || '-'}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.hits}</td>
                  <td className="py-2 break-words">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
