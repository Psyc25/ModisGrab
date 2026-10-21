import React, { useState } from 'react';

/**
 * Grafik ringan tanpa library (dipakai dashboard office & laporan Grab).
 * Satu seri per grafik (warna hijau Grab), garis target putus-putus, tooltip saat hover / sentuh.
 */

const nf = (n: number) => n.toLocaleString('id-ID');

export type BarDatum = { key: string; label: string; value: number; tip?: string };

export const BarChart: React.FC<{
  data: BarDatum[];
  target?: number;
  targetLabel?: string;
  height?: number;
  unit?: string;
  /** Tampilkan label sumbu-x tiap N batang (otomatis bila kosong). */
  labelEvery?: number;
  empty?: string;
}> = ({ data, target, targetLabel = 'target', height = 180, unit = '', labelEvery, empty = 'Belum ada data.' }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, target || 0, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const every = labelEvery || Math.max(1, Math.ceil(data.length / 12));
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!data.length || total === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-canvas text-[13px] text-ink-3" style={{ height }}>
        {empty}
      </div>
    );
  }
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="relative select-none" onMouseLeave={() => setHover(null)}>
      <div className="flex gap-2">
        {/* sumbu-y */}
        <div className="flex flex-col justify-between text-[11px] text-ink-3 tabular-nums text-right w-8 shrink-0" style={{ height }}>
          <span>{nf(nice)}</span>
          <span>{nf(Math.round(nice / 2))}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1 min-w-0">
          {/* grid */}
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <div className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: height / 2 }} />
          <div className="absolute inset-x-0 border-t border-[#D5D8DC]" style={{ top: height }} />
          {target ? (
            <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: height - (target / nice) * height }}>
              <div className="border-t-2 border-dashed border-ink/50" />
              <span className="absolute right-0 -top-[18px] text-[11px] font-semibold text-ink-2 bg-white/85 px-1 rounded">
                {targetLabel} {nf(target)}
              </span>
            </div>
          ) : null}
          <div className="relative flex items-end gap-[2px]" style={{ height }}>
            {data.map((d, i) => {
              const hit = target ? d.value >= target : false;
              return (
                <button
                  key={d.key}
                  type="button"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onClick={() => setHover(i)}
                  aria-label={`${d.label}: ${nf(d.value)}${unit}`}
                  className="flex-1 min-w-[6px] h-full flex items-end justify-center group outline-none"
                >
                  <span
                    className={`chart-bar w-full max-w-[48px] rounded-t-[6px] transition-[height,filter,box-shadow] duration-500 ${
                      hover === i ? 'chart-bar-hover' : hit ? 'chart-bar-hit' : 'chart-bar-base'
                    }`}
                    style={{ height: `${d.value > 0 ? Math.max(2, (d.value / nice) * 100) : 0}%`, animationDelay: `${Math.min(i, 40) * 14}ms` }}
                  />
                </button>
              );
            })}
          </div>
          {/* label sumbu-x */}
          <div className="flex gap-[2px] mt-1.5">
            {data.map((d, i) => (
              <span key={d.key} className="flex-1 min-w-[6px] text-center text-[10px] text-ink-3 tabular-nums whitespace-nowrap overflow-visible">
                {i % every === 0 ? d.label : ''}
              </span>
            ))}
          </div>
          {h && (
            <div
              className="absolute z-20 -translate-x-1/2 pointer-events-none bg-ink text-white rounded-lg px-2.5 py-1.5 text-[12px] shadow-lg whitespace-nowrap"
              style={{
                left: `${((hover! + 0.5) / data.length) * 100}%`,
                top: Math.max(0, height - (h.value / nice) * height - 44),
              }}
            >
              <span className="block font-semibold">{h.tip || h.label}</span>
              <span className="tabular-nums">
                {nf(h.value)}
                {unit}
                {target ? ` · ${Math.round((h.value / target) * 100)}% target` : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Daftar batang horizontal (peringkat), label & angka dalam warna teks. */
export const HBarList: React.FC<{ items: { label: string; value: number; sub?: string }[]; limit?: number; empty?: string }> = ({
  items,
  limit = 8,
  empty = 'Belum ada data.',
}) => {
  const list = items.slice(0, limit);
  const max = Math.max(1, ...list.map((i) => i.value));
  if (!list.length) return <p className="text-[13px] text-ink-3 py-4 text-center">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {list.map((it, i) => (
        <li key={it.label + i} title={`${it.label}: ${nf(it.value)}`}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">
              <span className={`rank-badge ${i < 3 ? `rank-${i + 1}` : ''} tabular-nums mr-1.5`}>{i + 1}</span>
              {it.label}
              {it.sub && <span className="text-ink-3"> · {it.sub}</span>}
            </span>
            <span className="font-bold tabular-nums shrink-0">{nf(it.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-canvas overflow-hidden">
            <div className="bar-shine h-full rounded-full bg-gradient-to-r from-grab to-[#5BE08F] transition-[width] duration-700" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

/** Kotak abu-abu berdenyut sebagai pengganti teks "Memuat…". */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => <div className={`animate-pulse rounded-2xl bg-[#E9ECEF] ${className}`} />;

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Memuat data">
    <Skeleton className="h-20" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
    <Skeleton className="h-56" />
    <div className="grid lg:grid-cols-2 gap-3">
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  </div>
);

function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
}
