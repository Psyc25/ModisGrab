import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtime } from '../hooks/useRealtime';
import { Bike, ChevronDown, Download, Loader2, Trophy } from 'lucide-react';
import type { LbRow } from '../field/api';
import { addDays, fmtDay, todayWIB } from '../report/engine';

/**
 * Peringkat GrabBike Hemat (menggantikan grand prize Golden).
 * SPG mencatat jumlah order GrabBike Hemat (PaHe, bike only) customer 30 hari terakhir; di sini diurutkan dari terbanyak.
 * Pemenang ditetapkan oleh pihak Grab (Mas Ale), bukan oleh aplikasi. Dipakai di dashboard office dan laporan klien.
 */
const UNITS: Record<string, string> = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk Diskon 1', kiosk2: 'Kiosk Diskon 2' };
const nf = (n: number) => n.toLocaleString('id-ID');
const RANK_BG = ['bg-modis-yellow text-ink', 'bg-[#D9DEE3] text-ink', 'bg-[#E8B98A] text-ink'];

type PeriodKey = 'all' | 'm1' | 'm2' | 'm3' | 'custom';

const periodRange = (key: PeriodKey, start: string, customFrom: string, customTo: string) => {
  if (key === 'custom') return { from: customFrom, to: customTo };
  if (key === 'all') return { from: start, to: addDays(start, 97) };
  const i = Number(key.slice(1)) - 1;
  return { from: addDays(start, i * 30), to: addDays(start, i * 30 + 29) };
};

export const GbLeaderboard: React.FC<{
  campaignStart: string;
  load: (from: string, to: string) => Promise<LbRow[]>;
  /** Hanya office (owner): unduh CSV dengan nomor HP lengkap */
  exportCsv?: (from: string, to: string) => Promise<void>;
}> = ({ campaignStart, load, exportCsv }) => {
  const today = todayWIB();
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [cFrom, setCFrom] = useState(addDays(today, -29));
  const [cTo, setCTo] = useState(today);
  const [rows, setRows] = useState<LbRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { from, to } = periodRange(period, campaignStart, cFrom, cTo);

  const run = useCallback(async () => {
    if (!from || !to || to < from) return;
    setBusy(true);
    setErr(null);
    try {
      setRows(await load(from, to));
    } catch (e: any) {
      setErr(e?.message || 'Gagal memuat peringkat');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);
  useEffect(() => {
    void run();
    const t = window.setInterval(() => void run(), 20_000);
    return () => window.clearInterval(t);
  }, [run]);
  useRealtime(['modis_gb_history', 'modis_conversions'], () => void run());

  const top = useMemo(() => (rows || []).slice(0, 10), [rows]);
  const rest = useMemo(() => (rows || []).slice(10), [rows]);
  const max = Math.max(1, ...top.map((r) => r.gb30));
  const tiedRank = useMemo(() => {
    const c: Record<number, number> = {};
    (rows || []).forEach((r) => (c[r.rank] = (c[r.rank] || 0) + 1));
    return c;
  }, [rows]);
  const total = (rows || []).reduce((a, r) => a + r.gb30, 0);
  const periods: [PeriodKey, string][] = [
    ['all', 'Seluruh kampanye'],
    ['m1', 'Bulan 1'],
    ['m2', 'Bulan 2'],
    ['m3', 'Bulan 3'],
    ['custom', 'Pilih tanggal'],
  ];

  return (
    <section className="bg-white rounded-2xl p-4 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-grab" /> Peringkat GrabBike Hemat
          </h2>
          <p className="text-[13px] text-ink-2 mt-0.5">
            Jumlah order GrabBike Hemat (PaHe) 30 hari terakhir saat customer bertemu SPG. Memakai entri terakhir tiap customer. Pemenang ditetapkan pihak Grab.
          </p>
        </div>
        {exportCsv && (
          <button
            onClick={() => exportCsv(from, to)}
            disabled={!rows?.length}
            className="h-10 px-3 rounded-xl bg-grab-cta text-white text-[13px] font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Unduh CSV
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {periods.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPeriod(k)}
            aria-pressed={period === k}
            className={`h-9 px-3 rounded-full text-[13px] font-semibold border ${period === k ? 'bg-grab-tint border-grab text-grab-deep' : 'bg-white border-[#D5D8DC] text-ink-2'}`}
          >
            {label}
          </button>
        ))}
        {period === 'custom' && (
          <span className="flex items-center gap-1.5 text-[13px]">
            <input type="date" value={cFrom} max={cTo} onChange={(e) => setCFrom(e.target.value)} className="h-9 px-2 rounded-lg border border-[#D5D8DC]" />
            –
            <input type="date" value={cTo} min={cFrom} onChange={(e) => setCTo(e.target.value)} className="h-9 px-2 rounded-lg border border-[#D5D8DC]" />
          </span>
        )}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-ink-3" />}
      </div>
      <p className="text-[12px] text-ink-3 -mt-2">
        Entri tanggal {fmtDay(from, { day: 'numeric', month: 'short', year: 'numeric' })} – {fmtDay(to, { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>

      {err && <p className="text-[13px] font-semibold text-modis-red">{err}</p>}

      {rows && (
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Peserta', nf(rows.length)],
            ['Total order tercatat', nf(total)],
            ['Tertinggi', rows.length ? `${nf(rows[0].gb30)} order` : '-'],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-canvas p-3">
              <p className="text-[11px] text-ink-2">{l}</p>
              <p className="text-[18px] font-extrabold tabular-nums leading-tight">{v}</p>
            </div>
          ))}
        </div>
      )}

      {rows && rows.length === 0 && !busy && (
        <p className="text-[14px] text-ink-3 py-6 text-center flex flex-col items-center gap-2">
          <Bike className="w-8 h-8 text-ink-3/60" />
          Belum ada data order GrabBike Hemat di rentang ini.
        </p>
      )}

      {top.length > 0 && (
        <ol className="space-y-2">
          {top.map((r, i) => (
            <li key={`${i}-${r.name}-${r.last4}`} className="flex items-center gap-3">
              <span className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-[15px] shrink-0 ${RANK_BG[r.rank - 1] || 'bg-canvas text-ink-2'}`}>{r.rank}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[14px] font-semibold truncate">
                    {r.name} {r.last4 && <span className="text-[12px] font-medium text-ink-3">··{r.last4}</span>}
                    {tiedRank[r.rank] > 1 && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FFF3E0] text-[#8A5300] align-middle">SERI</span>}
                  </p>
                  <p className="text-[15px] font-extrabold tabular-nums shrink-0">{nf(r.gb30)}</p>
                </div>
                <div className="h-2.5 rounded-full bg-canvas mt-1 overflow-hidden">
                  <div className="h-full rounded-full bg-grab" style={{ width: `${Math.max(3, (r.gb30 / max) * 100)}%` }} />
                </div>
                <p className="text-[11px] text-ink-3 mt-0.5 truncate">
                  {UNITS[r.unit] || r.unit}
                  {r.poi ? ` · ${r.poi}` : ''} · dicatat {fmtDay(r.day, { day: 'numeric', month: 'short' })}
                  {r.entries > 1 ? ` · ${r.entries}x entri` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {rest.length > 0 && (
        <details className="group rounded-xl border border-line">
          <summary className="cursor-pointer list-none px-3 py-3 flex items-center justify-between text-[14px] font-semibold">
            <span>Peringkat 11 dan seterusnya ({nf(rest.length)} peserta)</span>
            <ChevronDown className="w-4 h-4 text-ink-3 transition group-open:rotate-180" />
          </summary>
          <div className="overflow-x-auto border-t border-line max-h-[480px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[11px] uppercase tracking-wide text-ink-2">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2 text-right">Order</th>
                  <th className="px-3 py-2">Unit · venue</th>
                  <th className="px-3 py-2">Dicatat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rest.map((r, i) => (
                  <tr key={`${i}-${r.name}-${r.last4}`} className="text-[13px]">
                    <td className="px-3 py-2 tabular-nums">
                      {r.rank}
                      {tiedRank[r.rank] > 1 && <span className="ml-1 text-[10px] font-bold text-[#8A5300]">seri</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.name} {r.last4 && <span className="text-ink-3">··{r.last4}</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{nf(r.gb30)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink-2">
                      {UNITS[r.unit] || r.unit}
                      {r.poi ? ` · ${r.poi}` : ''}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink-2">{fmtDay(r.day, { day: 'numeric', month: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
};

/** CSV peringkat (untuk office; kolom nomor HP terisi hanya bila akun owner) */
export const lbToCsv = (rows: LbRow[], from: string, to: string) => {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Peringkat', 'Nama', 'Nomor HP', '4 digit akhir', 'Order GrabBike Hemat 30 hari', 'Tanggal dicatat', 'Unit', 'Venue', 'SPG', 'Jumlah entri'];
  const lines = rows.map((r) =>
    [r.rank, r.name, r.phone ? (r.phone.startsWith('62') ? `0${r.phone.slice(2)}` : r.phone) : '', r.last4 || '', r.gb30, r.day, UNITS[r.unit] || r.unit, r.poi || '', r.spg || '', r.entries].map(esc).join(';'),
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `MODIS_peringkat_grabbike_${from}_sd_${to}.csv`;
  a.click();
};
