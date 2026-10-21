import { CountUp } from '../components/CountUp';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  CheckCircle2,
  Circle,
  MapPin,
  Download,
  FileSpreadsheet,
  Filter,
  GitCompare,
  Minus,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import {
  ALL,
  Agg,
  Filters,
  NO_FILTER,
  RecentVisitor,
  ReportSettings,
  Row,
  SlotRow,
  Summary,
  VisitRow,
  addDays,
  avgSavings,
  campaignDayNo,
  catLabel,
  diffDays,
  filterOptions,
  filterSlots,
  filterVisits,
  fmtDay,
  fmtRange,
  rate,
  summarize,
  todayWIB,
  delta as deltaOf,
  slotOf,
} from './engine';
import { idr, idrShort, nf, pct } from './format';
import { scheduleFor } from '../data/schedule';

export interface ReportData {
  visits: VisitRow[];
  slots: SlotRow[];
  recent?: RecentVisitor[];
  settings: ReportSettings;
}

type Preset = 'today' | 'yesterday' | 'last7' | 'month' | 'campaign' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Hari ini' },
  { id: 'yesterday', label: 'Kemarin' },
  { id: 'last7', label: '7 hari' },
  { id: 'month', label: 'Bulan ini' },
  { id: 'campaign', label: 'Sejak awal campaign' },
  { id: 'custom', label: 'Pilih tanggal' },
];

const C = {
  grab: '#00B14F',
  deep: '#00523B',
  yellow: '#FFD902',
  orange: '#F79705',
  red: '#DB3735',
  grey: '#B7BDC5',
  b: '#1F6FEB',
};

const card = 'bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]';
const selectCls = 'h-10 pl-3 pr-8 rounded-xl border border-[#D5D8DC] bg-white text-[13px] outline-none focus:border-grab appearance-none w-full';
const dateCls = 'h-10 px-3 rounded-xl border border-[#D5D8DC] bg-white text-[13px] outline-none focus:border-grab';

/** Istilah yang tampil. Laporan klien: Conversion = visitor yang diverifikasi SPG (PAHE aktif). */
const Terms = React.createContext({ conv: 'Conversion', convShort: 'Conv.', visitor: 'Visitor Cek Boros', client: false });
const CLIENT_TERMS = { conv: 'Diverifikasi SPG', convShort: 'Verif.', visitor: 'Visitor terdaftar', client: true };
const INTERNAL_TERMS = { conv: 'Conversion', convShort: 'Conv.', visitor: 'Visitor Cek Boros', client: false };

/** Untuk klien: angka Conversion diambil dari visitor yang diverifikasi SPG lewat PIN (dapat stamp). */
function toVerified(S: Summary): Summary {
  const m = (a: Agg): Agg => ({ ...a, conversion: a.rewards });
  const rows = (r: Row[]) => r.map((x) => ({ ...x, agg: m(x.agg) }));
  return {
    ...S,
    total: m(S.total),
    daily: S.daily.map((d) => ({ ...d, agg: m(d.agg) })),
    unitSlot: rows(S.unitSlot),
    category: rows(S.category),
    location: rows(S.location),
    locationUnits: Object.fromEntries(Object.entries(S.locationUnits).map(([k, v]) => [k, rows(v)])),
    status: rows(S.status),
    reward: rows(S.reward),
    spg: rows(S.spg),
    weeks: rows(S.weeks),
    months: rows(S.months),
  };
}

export const ReportView: React.FC<{
  mode: 'internal' | 'client';
  load: (from: string, to: string) => Promise<ReportData>;
  /** Interval muat ulang otomatis (ms). 0 = tidak. */
  refreshMs?: number;
  /** Bagian tambahan di bawah laporan (mis. tabel visitor lengkap di dashboard internal). */
  children?: React.ReactNode;
  /** Rentang awal & callback, supaya filter tanggal sama dengan tab lain di dashboard internal. */
  range?: { from: string; to: string };
  onRangeChange?: (from: string, to: string) => void;
}> = ({ mode, load, refreshMs = 0, children, range, onRangeChange }) => {
  const today = todayWIB();
  const [preset, setPreset] = useState<Preset>(() => (!range || (range.from === today && range.to === today) ? 'today' : 'custom'));
  const [from, setFrom] = useState(range?.from || today);
  const [to, setTo] = useState(range?.to || today);
  useEffect(() => {
    onRangeChange?.(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);
  const [compare, setCompare] = useState(false);
  const [fromB, setFromB] = useState(addDays(today, -1));
  const [toB, setToB] = useState(addDays(today, -1));
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [showFilters, setShowFilters] = useState(true);

  const [dataA, setDataA] = useState<ReportData | null>(null);
  const [dataB, setDataB] = useState<ReportData | null>(null);
  const [dataC, setDataC] = useState<ReportData | null>(null); // campaign s/d hari ini
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const settings = dataA?.settings || dataC?.settings;
  const cStart = settings?.campaign.start;
  const cEnd = settings ? addDays(settings.campaign.start, settings.campaign.days - 1) : undefined;

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const t = todayWIB();
    if (p === 'today') (setFrom(t), setTo(t));
    if (p === 'yesterday') (setFrom(addDays(t, -1)), setTo(addDays(t, -1)));
    if (p === 'last7') (setFrom(addDays(t, -6)), setTo(t));
    if (p === 'month') (setFrom(`${t.slice(0, 8)}01`), setTo(t));
    if (p === 'campaign' && cStart) {
      const end = cEnd && cEnd < t ? cEnd : t;
      setFrom(cStart < end ? cStart : end);
      setTo(end);
    }
  };

  const toggleCompare = () => {
    if (!compare) {
      // Periode B = periode yang dipilih, Periode A = periode sebelumnya dengan panjang yang sama.
      const len = diffDays(from, to) + 1;
      setFromB(from);
      setToB(to);
      setFrom(addDays(from, -len));
      setTo(addDays(from, -1));
      setPreset('custom');
    }
    setCompare((c) => !c);
  };

  const fetchAll = useCallback(async () => {
    if (from > to || (compare && fromB > toB)) {
      setError('Tanggal mulai harus sebelum tanggal selesai.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const a = await load(from, to);
      setDataA(a);
      const s = a.settings;
      const t = todayWIB();
      const end = addDays(s.campaign.start, s.campaign.days - 1);
      const cTo = end < t ? end : t;
      const cFrom = s.campaign.start <= cTo ? s.campaign.start : cTo;
      const [b, c] = await Promise.all([
        compare ? load(fromB, toB) : Promise.resolve(null),
        cFrom === from && cTo === to ? Promise.resolve(a) : load(cFrom, cTo),
      ]);
      setDataB(b);
      setDataC(c);
      setUpdatedAt(new Date());
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [load, from, to, compare, fromB, toB]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchAll();
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs, fetchAll]);

  const options = useMemo(() => {
    const visits = [...(dataA?.visits || []), ...(dataB?.visits || []), ...(dataC?.visits || [])];
    const slots = [...(dataA?.slots || []), ...(dataB?.slots || []), ...(dataC?.slots || [])];
    return filterOptions(visits, slots);
  }, [dataA, dataB, dataC]);

  const isClient = mode === 'client';
  const conv = isClient ? toVerified : (x: Summary) => x;
  const terms = isClient ? CLIENT_TERMS : INTERNAL_TERMS;
  const A = useMemo(
    () => (dataA ? conv(summarize(filterVisits(dataA.visits, filters), filterSlots(dataA.slots, filters), dataA.settings, from, to)) : null),
    [dataA, filters, from, to]
  );
  const B = useMemo(
    () => (compare && dataB ? conv(summarize(filterVisits(dataB.visits, filters), filterSlots(dataB.slots, filters), dataB.settings, fromB, toB)) : null),
    [compare, dataB, filters, fromB, toB]
  );
  const CT = useMemo(() => {
    if (!dataC) return null;
    const s = dataC.settings;
    const t = todayWIB();
    const end = addDays(s.campaign.start, s.campaign.days - 1);
    const cTo = end < t ? end : t;
    const cFrom = s.campaign.start <= cTo ? s.campaign.start : cTo;
    return conv(summarize(filterVisits(dataC.visits, filters), filterSlots(dataC.slots, filters), s, cFrom, cTo));
  }, [dataC, filters]);

  const activeFilters = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k] !== ALL);
  const filtersLabel = activeFilters.map((k) => `${FILTER_LABEL[k]}: ${k === 'cat' ? catLabel(filters[k]) : filters[k]}`).join(' · ');

  const recent = useMemo(() => {
    if (!dataA?.recent) return [];
    return dataA.recent.filter(
      (r) =>
        (filters.loc === ALL || r.loc === filters.loc) &&
        (filters.cat === ALL || r.cat === filters.cat) &&
        (filters.unit === ALL || r.unit === filters.unit) &&
        (filters.slot === ALL || slotOf(r.hours) === filters.slot) &&
        (filters.status === ALL || r.status === filters.status)
    );
  }, [dataA, filters]);

  const download = async () => {
    if (!A || !CT || !settings) return;
    const { exportReportXlsx } = await import('./exportXlsx');
    exportReportXlsx({
      settings,
      A,
      B,
      campaignToDate: CT,
      filtersLabel,
      recent: mode === 'client' ? recent : undefined,
      liveUrl: mode === 'client' ? window.location.href : undefined,
      clientLabels: mode === 'client',
      fileName: `Report_CekBoros_${from}${from !== to ? `_sd_${to}` : ''}${B ? `_vs_${fromB}_sd_${toB}` : ''}.xlsx`,
    });
  };

  const dayNo = settings ? campaignDayNo(settings, today) : 0;

  return (
    <Terms.Provider value={terms}>
    <div className="space-y-4">
      {/* ===== Toolbar ===== */}
      <section className={`${card} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              aria-pressed={preset === p.id}
              className={`h-9 px-3.5 rounded-full text-[13px] border transition-colors ${
                preset === p.id ? 'bg-grab-tint border-grab text-grab-deep font-semibold' : 'bg-white border-[#D5D8DC] text-ink font-medium hover:border-ink-3'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={toggleCompare}
            aria-pressed={compare}
            className={`h-9 px-3.5 rounded-full text-[13px] border flex items-center gap-1.5 ${
              compare ? 'bg-[#EAF2FF] border-[#1F6FEB] text-[#1F4FB0] font-semibold' : 'bg-white border-[#D5D8DC] text-ink font-medium hover:border-ink-3'
            }`}
          >
            <GitCompare className="w-4 h-4" /> Bandingkan periode
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <DateRange label={compare ? 'Periode A' : 'Periode'} color={C.grab} from={from} to={to} onFrom={(v) => (setFrom(v), setPreset('custom'))} onTo={(v) => (setTo(v), setPreset('custom'))} />
          {compare && <DateRange label="Periode B (pembanding)" color={C.b} from={fromB} to={toB} onFrom={setFromB} onTo={setToB} />}
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowFilters((s) => !s)} className="h-10 px-3.5 rounded-xl border border-[#D5D8DC] bg-white text-[13px] font-semibold flex items-center gap-1.5">
              <Filter className="w-4 h-4" /> Filter{activeFilters.length ? ` (${activeFilters.length})` : ''}
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={download} disabled={!A} className="h-10 px-3.5 rounded-xl bg-grab-cta text-white text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50">
              <Download className="w-4 h-4" /> Unduh laporan
            </button>
            {mode === 'client' && settings?.live_sheet_url && (
              <a href={settings.live_sheet_url} target="_blank" rel="noopener noreferrer" className="h-10 px-3.5 rounded-xl border border-grab text-grab-deep text-[13px] font-semibold flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4" /> Excel live
              </a>
            )}
            <button onClick={fetchAll} aria-label="Muat ulang" className="h-10 w-10 rounded-xl border border-[#D5D8DC] bg-white flex items-center justify-center">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className={`grid grid-cols-2 sm:grid-cols-3 ${mode === 'internal' ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-2 pt-1`}>
            <FilterSelect label="Lokasi" value={filters.loc} options={options.loc} onChange={(v) => setFilters({ ...filters, loc: v })} />
            <FilterSelect label="Kategori POI" value={filters.cat} options={options.cat} render={catLabel} onChange={(v) => setFilters({ ...filters, cat: v })} />
            <FilterSelect label="Unit" value={filters.unit} options={options.unit} onChange={(v) => setFilters({ ...filters, unit: v })} />
            <FilterSelect label="Slot" value={filters.slot} options={options.slot} onChange={(v) => setFilters({ ...filters, slot: v })} />
            <FilterSelect label="Status boros" value={filters.status} options={options.status} onChange={(v) => setFilters({ ...filters, status: v })} />
            {mode === 'internal' && <FilterSelect label="SPG" value={filters.spg} options={options.spg} onChange={(v) => setFilters({ ...filters, spg: v })} />}
          </div>
        )}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 text-[12px] text-ink-2">
            <span>{filtersLabel}</span>
            <button onClick={() => setFilters(NO_FILTER)} className="text-modis-red font-semibold flex items-center gap-0.5">
              <X className="w-3.5 h-3.5" /> Hapus filter
            </button>
          </div>
        )}
        <p className="text-[12px] text-ink-3">
          {compare ? (
            <>
              <Dot color={C.grab} /> A: <strong className="text-ink">{fmtRange(from, to)}</strong> &nbsp; <Dot color={C.b} /> B:{' '}
              <strong className="text-ink">{fmtRange(fromB, toB)}</strong>
            </>
          ) : (
            <>
              Periode <strong className="text-ink">{fmtRange(from, to)}</strong>
            </>
          )}
          {updatedAt && ` · diperbarui ${updatedAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} WIB`}
          {refreshMs ? ' · otomatis tiap 1 menit' : ''}
        </p>
        {error && <p className="text-[13px] text-modis-red font-medium">{error}</p>}
      </section>

      {!A || !settings ? (
        <div className={`${card} p-10 text-center text-[14px] text-ink-3`}>{loading ? 'Memuat laporan…' : 'Belum ada data.'}</div>
      ) : (
        <>
          {/* ===== Progres campaign ===== */}
          {CT && (
            <section className={`${card} p-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-display text-[16px] font-bold">Progres campaign s/d hari ini</h2>
                <span className="text-[12px] text-ink-2">
                  {dayNo < 1
                    ? `Belum mulai · running ${fmtDay(settings.campaign.start, { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : dayNo > settings.campaign.days
                    ? 'Campaign selesai'
                    : `Hari ke-${dayNo} dari ${settings.campaign.days}`}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['reach', 'contact', 'conversion'] as const).map((k) => (
                  <Progress key={k} label={k === 'conversion' && isClient ? 'Diverifikasi SPG (PAHE aktif)' : KPI_LABEL[k]} value={CT.total[k]} target={settings.targets[k]} />
                ))}
              </div>
            </section>
          )}

          {/* ===== KPI ===== */}
          {isClient ? (
            <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <KpiCard label="Reach" a={A.total.reach} b={B?.total.reach} target={A.target.reach} />
              <KpiCard label="Contact" a={A.total.contact} b={B?.total.contact} target={A.target.contact} />
              <KpiCard label="Diverifikasi SPG" sub="PAHE aktif" a={A.total.conversion} b={B?.total.conversion} target={A.target.conversion} />
              <KpiCard
                label="Contact rate"
                a={rate(A.total.contact, A.total.reach)}
                b={B ? rate(B.total.contact, B.total.reach) : undefined}
                fmt={(n) => pct(n, 1)}
                note={`Verifikasi dari contact ${pct(rate(A.total.conversion, A.total.contact), 1)}${B ? ` → ${pct(rate(B.total.conversion, B.total.contact), 1)}` : ''}`}
              />
              <KpiCard label="Visitor terdaftar" sub="setiap pendaftaran Cek Boros" a={A.total.visits} b={B?.total.visits} />
              <KpiCard label="Visitor unik" sub="orang berbeda (1 nomor WA = 1 orang)" a={A.total.unique} b={B?.total.unique} />
            </section>
          ) : (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Reach" a={A.total.reach} b={B?.total.reach} target={A.target.reach} />
            <KpiCard label="Contact" a={A.total.contact} b={B?.total.contact} target={A.target.contact} />
            <KpiCard label="Conversion" a={A.total.conversion} b={B?.total.conversion} target={A.target.conversion} />
            <KpiCard
              label="Contact & Conv. rate"
              a={rate(A.total.contact, A.total.reach)}
              b={B ? rate(B.total.contact, B.total.reach) : undefined}
              fmt={(n) => pct(n, 1)}
              note={`Conv. rate ${pct(rate(A.total.conversion, A.total.contact), 1)}${B ? ` → ${pct(rate(B.total.conversion, B.total.contact), 1)}` : ''}`}
            />
            <KpiCard label="Visitor Cek Boros" sub="kunjungan" a={A.total.visits} b={B?.total.visits} />
            <KpiCard label="Visitor unik" sub="berdasarkan nomor WA" a={A.total.unique} b={B?.total.unique} />
            <KpiCard label="Stamp diberikan" a={A.total.rewards} b={B?.total.rewards} />
            <KpiCard label="Rata-rata potensi hemat" sub="per visitor / bulan" a={avgSavings(A.total)} b={B ? avgSavings(B.total) : undefined} fmt={idr} />
          </section>
          )}


          {/* ===== Grafik ===== */}
          <section className={`grid grid-cols-1 ${B ? 'lg:grid-cols-2' : ''} gap-3`}>
            <ChartCard title={B ? 'Tren harian · Periode A' : 'Tren harian'} sub={`${terms.conv} vs target & ${terms.visitor.toLowerCase()}`}>
              <TrendChart S={A} />
            </ChartCard>
            {B && (
              <ChartCard title="Perbandingan per hari ke-" sub={`${terms.conv} & visitor, Periode A vs B`}>
                <CompareChart A={A} B={B} />
              </ChartCard>
            )}
          </section>

          {/* ===== Tabel ===== */}
          <TableCard title="Laporan per unit & slot" rowsA={A.unitSlot} rowsB={B?.unitSlot} />
          <LocationDrawer A={A} B={B} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <TableCard title="Per kategori POI" rowsA={A.category} rowsB={B?.category} compact />
            <TableCard title="Rekap mingguan" rowsA={A.weeks} rowsB={B?.weeks} compact />
            <TableCard title="Rekap bulanan" rowsA={A.months} rowsB={B?.months} compact />
            {mode === 'internal' && <TableCard title="Per SPG" rowsA={A.spg} rowsB={B?.spg} compact />}
            <StatusCard S={A} />
            <MerchCard settings={settings} CT={CT} A={A} />
            {!isClient && <RewardCard S={A} />}
          </div>

          {mode === 'client' && <RecentVisitors rows={recent} total={A.total.visits} />}
          {children}
        </>
      )}
    </div>
    </Terms.Provider>
  );
};

// ---------------------------------------------------------------------
// Bagian kecil
// ---------------------------------------------------------------------
const FILTER_LABEL: Record<keyof Filters, string> = { loc: 'Lokasi', cat: 'Kategori', unit: 'Unit', slot: 'Slot', status: 'Status', spg: 'SPG' };
const KPI_LABEL = { reach: 'Reach', contact: 'Contact', conversion: 'Conversion' };

const Dot: React.FC<{ color: string }> = ({ color }) => <span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: color }} />;

const DateRange: React.FC<{ label: string; color: string; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }> = ({
  label,
  color,
  from,
  to,
  onFrom,
  onTo,
}) => (
  <div>
    <span className="flex items-center gap-1 text-[12px] font-semibold text-ink-2 mb-1">
      <CalendarRange className="w-3.5 h-3.5" style={{ color }} /> {label}
    </span>
    <div className="flex items-center gap-1.5">
      <input type="date" value={from} max={to} onChange={(e) => e.target.value && onFrom(e.target.value)} className={dateCls} aria-label={`${label} mulai`} />
      <span className="text-ink-3">–</span>
      <input type="date" value={to} min={from} onChange={(e) => e.target.value && onTo(e.target.value)} className={dateCls} aria-label={`${label} selesai`} />
    </div>
  </div>
);

const FilterSelect: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void; render?: (v: string) => string }> = ({
  label,
  value,
  options,
  onChange,
  render,
}) => (
  <label className="block relative">
    <span className="block text-[11px] font-semibold text-ink-3 mb-1 uppercase tracking-wide">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${selectCls} ${value !== ALL ? 'border-grab bg-grab-tint-2 font-semibold' : ''}`}>
      <option value={ALL}>Semua</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {render ? render(o) : o}
        </option>
      ))}
    </select>
    <ChevronDown className="w-4 h-4 text-ink-3 absolute right-2.5 bottom-3 pointer-events-none" />
  </label>
);

const DeltaBadge: React.FC<{ a: number; b: number }> = ({ a, b }) => {
  const d = deltaOf(a, b);
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-ink-3"><Minus className="w-3 h-3" />0%</span>;
  if (d === null) return <span className="text-[11px] font-bold text-grab-deep">baru</span>;
  const up = d > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-grab-deep' : 'text-modis-red'}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {pct(Math.abs(d), Math.abs(d) < 0.1 ? 1 : 0)}
    </span>
  );
};

const KpiCard: React.FC<{ label: string; sub?: string; a: number; b?: number; target?: number; fmt?: (n: number) => string; note?: string }> = ({
  label,
  sub,
  a,
  b,
  target,
  fmt = nf,
  note,
}) => {
  const ach = target ? a / target : 0;
  return (
    <div className={`${card} kpi-card p-4 flex flex-col`}>
      <p className="text-[12px] font-semibold text-ink-2 leading-tight">
        {label}
        {sub && <span className="block font-normal text-ink-3">{sub}</span>}
      </p>
      {b === undefined ? (
        <p className="mt-1.5 font-display text-[24px] font-extrabold tracking-[-0.02em] leading-none tabular-nums"><CountUp text={fmt(a)} /></p>
      ) : (
        <div className="mt-1.5 space-y-1">
          <p className="flex items-baseline gap-1.5 tabular-nums">
            <Dot color={C.grab} />
            <span className="font-display text-[20px] font-extrabold leading-none">{fmt(a)}</span>
          </p>
          <p className="flex items-baseline gap-1.5 tabular-nums">
            <Dot color={C.b} />
            <span className="font-display text-[20px] font-extrabold leading-none">{fmt(b)}</span>
            <DeltaBadge a={a} b={b} />
          </p>
        </div>
      )}
      {target !== undefined && target > 0 && b === undefined && (
        <div className="mt-auto pt-3">
          <div className="flex justify-between text-[11px] text-ink-3 mb-1">
            <span>Target {nf(target)}</span>
            <span className={`font-bold ${ach >= 1 ? 'text-grab-deep' : ach >= 0.85 ? 'text-modis-orange' : 'text-modis-red'}`}>{pct(ach)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-canvas overflow-hidden">
            <div className="bar-shine h-full rounded-full" style={{ width: `${Math.min(100, ach * 100)}%`, background: ach >= 1 ? C.grab : ach >= 0.85 ? C.orange : C.red }} />
          </div>
        </div>
      )}
      {target === 0 && b === undefined && <p className="mt-auto pt-3 text-[11px] text-ink-3">Di luar periode campaign</p>}
      {note && <p className="mt-auto pt-2 text-[11px] text-ink-3">{note}</p>}
    </div>
  );
};

const Progress: React.FC<{ label: string; value: number; target: number }> = ({ label, value, target }) => {
  const p = target ? value / target : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline text-[13px]">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-ink-2">
          <strong className="text-ink">{nf(value)}</strong> / {nf(target)} · <strong className="text-grab-deep">{pct(p, 1)}</strong>
        </span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-full bg-canvas overflow-hidden">
        <div className="bar-shine h-full rounded-full bg-grab" style={{ width: `${Math.min(100, p * 100)}%` }} />
      </div>
    </div>
  );
};

const ChartCard: React.FC<{ title: string; sub?: string; children: React.ReactNode }> = ({ title, sub, children }) => (
  <div className={`${card} p-4`}>
    <h3 className="font-display text-[16px] font-bold">{title}</h3>
    {sub && <p className="text-[12px] text-ink-3 mb-2">{sub}</p>}
    <div className="h-[280px]">{children}</div>
  </div>
);

const axisTick = { fontSize: 11, fill: '#8A8A8A' };

const TrendChart: React.FC<{ S: Summary }> = ({ S }) => {
  const T = React.useContext(Terms);
  const data = S.daily.map((d) => ({ name: fmtDay(d.day), [T.conv]: d.agg.conversion, Target: d.target.conversion || null, Visitor: d.agg.visits }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" vertical={false} />
        <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} minTickGap={12} />
        <YAxis yAxisId="l" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis yAxisId="r" orientation="right" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EBEBEB', fontSize: 12 }} formatter={(v: any) => nf(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="l" dataKey={T.conv} fill={C.grab} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line yAxisId="l" dataKey="Target" name={`Target ${T.convShort.toLowerCase()}`} stroke={C.deep} strokeDasharray="5 4" dot={false} strokeWidth={2} connectNulls={false} />
        <Line yAxisId="r" dataKey="Visitor" name={`${T.visitor} (sumbu kanan)`} stroke={C.orange} strokeWidth={2.5} dot={data.length < 20} />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

const CompareChart: React.FC<{ A: Summary; B: Summary }> = ({ A, B }) => {
  const T = React.useContext(Terms);
  const n = Math.max(A.daily.length, B.daily.length);
  const data = Array.from({ length: n }, (_, i) => ({
    name: `H${i + 1}`,
    [`${T.convShort} A`]: A.daily[i]?.agg.conversion ?? null,
    [`${T.convShort} B`]: B.daily[i]?.agg.conversion ?? null,
    'Visitor A': A.daily[i]?.agg.visits ?? null,
    'Visitor B': B.daily[i]?.agg.visits ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" vertical={false} />
        <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis yAxisId="l" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis yAxisId="r" orientation="right" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EBEBEB', fontSize: 12 }} formatter={(v: any) => nf(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="l" dataKey={`${T.convShort} A`} stroke={C.grab} strokeWidth={2.5} dot={false} />
        <Line yAxisId="l" dataKey={`${T.convShort} B`} stroke={C.b} strokeWidth={2.5} dot={false} />
        <Line yAxisId="r" dataKey="Visitor A" stroke={C.grab} strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
        <Line yAxisId="r" dataKey="Visitor B" stroke={C.b} strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

const th = 'px-3 py-2.5 text-[11px] font-semibold text-ink-2 uppercase tracking-wide whitespace-nowrap';
const td = 'px-3 py-2.5 text-[13px] tabular-nums whitespace-nowrap';

const TableCard: React.FC<{ title: string; rowsA: Row[]; rowsB?: Row[]; compact?: boolean }> = ({ title, rowsA, rowsB, compact }) => {
  const zero: Agg = { visits: 0, unique: 0, rewards: 0, stamps: 0, savings: 0, reach: 0, contact: 0, conversion: 0, a: 0, b: 0, c: 0, drinks: 0, days: 0 };
  const keys = rowsB ? Array.from(new Set([...rowsA.map((r) => r.key), ...rowsB.map((r) => r.key)])) : rowsA.map((r) => r.key);
  const mapA = new Map(rowsA.map((r) => [r.key, r]));
  const mapB = new Map((rowsB || []).map((r) => [r.key, r]));
  const sum = (rows: Row[]) =>
    rows.reduce(
      (s, r) => ({ ...s, reach: s.reach + r.agg.reach, contact: s.contact + r.agg.contact, conversion: s.conversion + r.agg.conversion, visits: s.visits + r.agg.visits, rewards: s.rewards + r.agg.rewards, savings: s.savings + r.agg.savings }),
      { ...zero }
    );
  const tA = sum(rowsA);
  const tB = rowsB ? sum(rowsB) : zero;
  const T = React.useContext(Terms);
  const showStamp = !T.client;

  return (
    <section className={`${card} overflow-hidden`}>
      <h3 className="px-4 pt-4 pb-2 font-display text-[16px] font-bold">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-canvas">
            {rowsB ? (
              <tr>
                <th className={th}>Nama</th>
                <th className={`${th} text-right`}>{T.convShort} A</th>
                <th className={`${th} text-right`}>{T.convShort} B</th>
                <th className={`${th} text-right`}>Δ</th>
                <th className={`${th} text-right`}>Visitor A</th>
                <th className={`${th} text-right`}>Visitor B</th>
                <th className={`${th} text-right`}>Δ</th>
              </tr>
            ) : (
              <tr>
                <th className={th}>Nama</th>
                {!compact && <th className={`${th} text-right`}>Reach</th>}
                {!compact && <th className={`${th} text-right`}>Contact</th>}
                <th className={`${th} text-right`}>{T.conv}</th>
                {!compact && <th className={`${th} text-right`}>{T.convShort} rate</th>}
                <th className={`${th} text-right`}>Visitor</th>
                {showStamp && <th className={`${th} text-right`}>Stamp</th>}
                {!compact && showStamp && <th className={`${th} text-right`}>Rata² hemat</th>}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-line">
            {keys.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[13px] text-ink-3">
                  Belum ada data.
                </td>
              </tr>
            ) : (
              keys.map((k) => {
                const a = mapA.get(k);
                const b = mapB.get(k);
                const r = a || b!;
                const label = r.sub ? (
                  <>
                    {r.label} <span className="text-ink-3 text-[12px]">{r.sub}</span>
                  </>
                ) : (
                  r.label
                );
                const A = a?.agg || zero;
                const B = b?.agg || zero;
                return rowsB ? (
                  <tr key={k}>
                    <td className={`${td} font-semibold !whitespace-normal min-w-[160px] leading-snug`}>{label}</td>
                    <td className={`${td} text-right`}>{nf(A.conversion)}</td>
                    <td className={`${td} text-right`}>{nf(B.conversion)}</td>
                    <td className={`${td} text-right`}>
                      <DeltaBadge a={A.conversion} b={B.conversion} />
                    </td>
                    <td className={`${td} text-right`}>{nf(A.visits)}</td>
                    <td className={`${td} text-right`}>{nf(B.visits)}</td>
                    <td className={`${td} text-right`}>
                      <DeltaBadge a={A.visits} b={B.visits} />
                    </td>
                  </tr>
                ) : (
                  <tr key={k}>
                    <td className={`${td} font-semibold !whitespace-normal min-w-[160px] leading-snug`}>{label}</td>
                    {!compact && <td className={`${td} text-right`}>{nf(A.reach)}</td>}
                    {!compact && <td className={`${td} text-right`}>{nf(A.contact)}</td>}
                    <td className={`${td} text-right font-semibold`}>{nf(A.conversion)}</td>
                    {!compact && <td className={`${td} text-right`}>{pct(rate(A.conversion, A.contact))}</td>}
                    <td className={`${td} text-right`}>{nf(A.visits)}</td>
                    {showStamp && <td className={`${td} text-right`}>{nf(A.rewards)}</td>}
                    {!compact && showStamp && <td className={`${td} text-right`}>{idrShort(avgSavings(A))}</td>}
                  </tr>
                );
              })
            )}
          </tbody>
          {keys.length > 1 && (
            <tfoot className="bg-grab-tint-2 font-bold">
              {rowsB ? (
                <tr>
                  <td className={td}>Total</td>
                  <td className={`${td} text-right`}>{nf(tA.conversion)}</td>
                  <td className={`${td} text-right`}>{nf(tB.conversion)}</td>
                  <td className={`${td} text-right`}>
                    <DeltaBadge a={tA.conversion} b={tB.conversion} />
                  </td>
                  <td className={`${td} text-right`}>{nf(tA.visits)}</td>
                  <td className={`${td} text-right`}>{nf(tB.visits)}</td>
                  <td className={`${td} text-right`}>
                    <DeltaBadge a={tA.visits} b={tB.visits} />
                  </td>
                </tr>
              ) : (
                <tr>
                  <td className={td}>Total</td>
                  {!compact && <td className={`${td} text-right`}>{nf(tA.reach)}</td>}
                  {!compact && <td className={`${td} text-right`}>{nf(tA.contact)}</td>}
                  <td className={`${td} text-right`}>{nf(tA.conversion)}</td>
                  {!compact && <td className={`${td} text-right`}>{pct(rate(tA.conversion, tA.contact))}</td>}
                  <td className={`${td} text-right`}>{nf(tA.visits)}</td>
                  {showStamp && <td className={`${td} text-right`}>{nf(tA.rewards)}</td>}
                  {!compact && showStamp && <td className={`${td} text-right`}>{idrShort(tA.visits ? tA.savings / tA.visits : 0)}</td>}
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
};


// ---------------------------------------------------------------------
// Laci "Laporan per lokasi": ringkas (mis. 3/5 lokasi terisi), dibuka per lokasi.
// ---------------------------------------------------------------------
const SCHED_COLS: [number, string][] = [
  [2, 'Mobil Pagi'],
  [3, 'Mobil Siang'],
  [4, 'Mobil Sore/Malam'],
  [5, 'Kiosk 1'],
  [6, 'Kiosk 2'],
];

const Drawer: React.FC<{ open: boolean; children: React.ReactNode }> = ({ open, children }) => (
  <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
    <div className="overflow-hidden">{children}</div>
  </div>
);

const LocationDrawer: React.FC<{ A: Summary; B?: Summary | null }> = ({ A, B }) => {
  const T = React.useContext(Terms);
  const [open, setOpen] = useState(false);
  const [openLoc, setOpenLoc] = useState<string | null>(null);

  const items = useMemo(() => {
    // Lokasi menurut Running Schedule di periode A
    const planned = new Map<string, string[]>();
    for (let d = A.from; d <= A.to; d = addDays(d, 1)) {
      const day = scheduleFor(d);
      if (!day) continue;
      for (const [col, unit] of SCHED_COLS) {
        const loc = day[col];
        if (!loc) continue;
        const arr = planned.get(loc) || [];
        arr.push(`${fmtDay(d, { day: 'numeric', month: 'short' })} · ${unit}`);
        planned.set(loc, arr);
      }
    }
    const rowA = new Map(A.location.map((r) => [r.key, r]));
    const rowB = new Map((B?.location || []).map((r) => [r.key, r]));
    const filled = (r?: Row) => Boolean(r && (r.agg.visits > 0 || r.agg.reach > 0 || r.agg.conversion > 0));
    const keys = Array.from(new Set([...planned.keys(), ...A.location.map((r) => r.key)])).filter((k) => k !== '—' || rowA.has(k));
    const list = keys.map((k) => ({
      key: k,
      a: rowA.get(k),
      b: rowB.get(k),
      planned: planned.get(k) || [],
      isPlanned: planned.has(k),
      done: filled(rowA.get(k)),
    }));
    list.sort((x, y) => Number(y.done) - Number(x.done) || (y.a?.agg.conversion || 0) - (x.a?.agg.conversion || 0) || (y.a?.agg.visits || 0) - (x.a?.agg.visits || 0) || x.key.localeCompare(y.key, 'id'));
    const plannedCount = planned.size;
    const plannedDone = list.filter((x) => x.isPlanned && x.done).length;
    const doneCount = list.filter((x) => x.done).length;
    return { list, plannedCount, plannedDone, doneCount };
  }, [A, B]);

  const { list, plannedCount, plannedDone, doneCount } = items;
  const num = plannedCount ? plannedDone : doneCount;
  const den = plannedCount || doneCount;
  const p = den ? num / den : 0;

  return (
    <section className={`${card} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-4 py-4 flex items-center gap-3 text-left hover:bg-canvas/60 transition-colors"
      >
        <span className="w-10 h-10 rounded-xl bg-grab-tint text-grab-deep flex items-center justify-center shrink-0">
          <MapPin className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[16px] font-bold">Laporan per lokasi</span>
            <span className="px-2.5 py-0.5 rounded-full bg-grab-deep text-white text-[12px] font-bold tabular-nums">
              {num}/{den} lokasi terisi
            </span>
          </span>
          <span className="block text-[12px] text-ink-3 mt-0.5">
            {plannedCount ? 'Dibanding lokasi di Running Schedule periode ini' : 'Lokasi yang sudah ada data di periode ini'} · ketuk untuk {open ? 'menutup' : 'melihat rincian'}
          </span>
          <span className="mt-2 block h-1.5 rounded-full bg-canvas overflow-hidden">
            <span className="block h-full rounded-full bg-grab transition-[width] duration-500" style={{ width: `${Math.min(100, p * 100)}%` }} />
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 text-ink-2 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <Drawer open={open}>
        <ul className="border-t border-line divide-y divide-line">
          {list.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-ink-3">Belum ada data lokasi di periode ini.</li>}
          {list.map((x) => {
            const a = x.a?.agg;
            const b = x.b?.agg;
            const isOpen = openLoc === x.key;
            const units = A.locationUnits[x.key] || [];
            return (
              <li key={x.key}>
                <button
                  type="button"
                  onClick={() => setOpenLoc(isOpen ? null : x.key)}
                  aria-expanded={isOpen}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-canvas/60 transition-colors"
                >
                  {x.done ? <CheckCircle2 className="w-5 h-5 text-grab shrink-0" /> : <Circle className="w-5 h-5 text-[#C9CDD2] shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold leading-snug">{x.key}</span>
                    <span className="block text-[12px] text-ink-3 truncate">
                      {x.done ? (x.isPlanned ? 'Terisi' : 'Terisi · di luar jadwal') : 'Belum ada data'}
                      {x.planned.length > 0 && ` · jadwal ${x.planned.length}x`}
                    </span>
                  </span>
                  <span className="text-right shrink-0 tabular-nums">
                    <span className="block text-[15px] font-bold text-grab-deep">{nf(a?.conversion || 0)}</span>
                    <span className="block text-[11px] text-ink-3">{T.convShort.toLowerCase()} · {nf(a?.visits || 0)} visitor</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-ink-3 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <Drawer open={isOpen}>
                  <div className="px-4 pb-4 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        ['Reach', a?.reach, b?.reach],
                        ['Contact', a?.contact, b?.contact],
                        [T.conv, a?.conversion, b?.conversion],
                        ['Visitor', a?.visits, b?.visits],
                        ['Visitor unik', a?.unique, b?.unique],
                      ].map(([label, va, vb]) => (
                        <div key={String(label)} className="rounded-xl bg-canvas px-3 py-2">
                          <p className="text-[11px] text-ink-3">{label}</p>
                          <p className="text-[16px] font-bold tabular-nums">{nf(Number(va) || 0)}</p>
                          {B && <p className="text-[11px] text-ink-2 tabular-nums">B: {nf(Number(vb) || 0)}</p>}
                        </div>
                      ))}
                    </div>
                    {units.length > 0 && (
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="text-[11px] text-ink-3 uppercase tracking-wide">
                            <th className="py-1.5 font-semibold">Unit · slot</th>
                            <th className="py-1.5 font-semibold text-right">Reach</th>
                            <th className="py-1.5 font-semibold text-right">Contact</th>
                            <th className="py-1.5 font-semibold text-right">{T.convShort}</th>
                            <th className="py-1.5 font-semibold text-right">Visitor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line tabular-nums">
                          {units.map((u) => (
                            <tr key={u.key}>
                              <td className="py-1.5">{u.label}</td>
                              <td className="py-1.5 text-right">{nf(u.agg.reach)}</td>
                              <td className="py-1.5 text-right">{nf(u.agg.contact)}</td>
                              <td className="py-1.5 text-right font-semibold">{nf(u.agg.conversion)}</td>
                              <td className="py-1.5 text-right">{nf(u.agg.visits)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {x.planned.length > 0 && (
                      <p className="text-[12px] text-ink-3 leading-snug">Jadwal: {x.planned.slice(0, 6).join(', ')}{x.planned.length > 6 ? `, +${x.planned.length - 6} lagi` : ''}</p>
                    )}
                  </div>
                </Drawer>
              </li>
            );
          })}
        </ul>
      </Drawer>
    </section>
  );
};

const STATUS_COLOR: Record<string, string> = { 'Sangat Boros': C.red, Boros: C.orange, 'Lumayan Boros': C.yellow, 'Cukup Hemat': C.grab };

const StatusCard: React.FC<{ S: Summary }> = ({ S }) => (
  <section className={`${card} p-4`}>
    <h3 className="font-display text-[16px] font-bold mb-3">Status boros visitor</h3>
    <div className="flex h-3 rounded-full overflow-hidden bg-canvas mb-3">
      {S.status.map((r) =>
        r.agg.visits ? <div key={r.key} style={{ width: `${rate(r.agg.visits, S.total.visits) * 100}%`, background: STATUS_COLOR[r.key] }} title={r.label} /> : null
      )}
    </div>
    <ul className="space-y-2">
      {S.status.map((r) => (
        <li key={r.key} className="flex items-center justify-between text-[13px]">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[r.key] }} /> {r.label}
          </span>
          <span className="tabular-nums text-ink-2">
            <strong className="text-ink">{nf(r.agg.visits)}</strong> · {pct(rate(r.agg.visits, S.total.visits))} · rata² {idrShort(avgSavings(r.agg))}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

const MerchCard: React.FC<{ settings: ReportSettings; CT: Summary | null; A: Summary }> = ({ settings, CT, A }) => {
  const items: [string, number, number, number][] = [
    ['Merch Tier A', settings.merch_stock.a, CT?.total.a || 0, A.total.a],
    ['Merch Tier B', settings.merch_stock.b, CT?.total.b || 0, A.total.b],
    ['Merch Tier C', settings.merch_stock.c, CT?.total.c || 0, A.total.c],
    ['Minuman / Refreshment', settings.merch_stock.drinks, CT?.total.drinks || 0, A.total.drinks],
  ];
  return (
    <section className={`${card} overflow-hidden`}>
      <h3 className="px-4 pt-4 font-display text-[16px] font-bold">Stok merchandise</h3>
      <p className="px-4 pb-2 text-[12px] text-ink-3">Keluar dihitung sejak awal campaign s/d hari ini</p>
      <table className="w-full text-left">
        <thead className="bg-canvas">
          <tr>
            <th className={th}>Item</th>
            <th className={`${th} text-right`}>Stok awal</th>
            <th className={`${th} text-right`}>Keluar</th>
            <th className={`${th} text-right`}>Sisa</th>
            <th className={`${th} text-right`}>Periode ini</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map(([label, stock, out, period]) => {
            const left = stock - out;
            const used = stock ? out / stock : 0;
            return (
              <tr key={label}>
                <td className={`${td} font-semibold`}>
                  {label}
                  {stock > 0 && (
                    <div className="mt-1 h-1 w-28 rounded-full bg-canvas overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.min(100, used * 100)}%`, background: used > 0.85 ? C.red : C.grab }} />
                    </div>
                  )}
                </td>
                <td className={`${td} text-right`}>{nf(stock)}</td>
                <td className={`${td} text-right`}>{nf(out)}</td>
                <td className={`${td} text-right font-semibold ${left < 0 ? 'text-modis-red' : ''}`}>{stock ? nf(left) : '—'}</td>
                <td className={`${td} text-right`}>{nf(period)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

const RewardCard: React.FC<{ S: Summary }> = ({ S }) => (
  <section className={`${card} p-4`}>
    <h3 className="font-display text-[16px] font-bold mb-3">Stamp per tingkat kartu</h3>
    {S.reward.length === 0 ? (
      <p className="text-[13px] text-ink-3">Belum ada stamp diberikan di periode ini.</p>
    ) : (
      <ul className="space-y-2.5">
        {S.reward.map((r) => (
          <li key={r.key}>
            <div className="flex justify-between text-[13px]">
              <span>{r.label}</span>
              <strong className="tabular-nums">{nf(r.agg.visits)}</strong>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-canvas overflow-hidden">
              <div className="h-full bg-modis-yellow" style={{ width: `${rate(r.agg.visits, S.total.rewards) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const RecentVisitors: React.FC<{ rows: RecentVisitor[]; total: number }> = ({ rows, total }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className={`${card} overflow-hidden`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-grab-tint text-grab-deep flex items-center justify-center">
            <Users className="w-4.5 h-4.5" />
          </span>
          <span>
            <span className="block font-display text-[16px] font-bold">Data visitor</span>
            <span className="block text-[12px] text-ink-3">
              {nf(rows.length)} terbaru{total > rows.length ? ` dari ${nf(total)}` : ''} · nama depan & WA tersamar
            </span>
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-left">
            <thead className="bg-canvas">
              <tr>
                <th className={th}>Waktu</th>
                <th className={th}>Nama</th>
                <th className={th}>WhatsApp</th>
                <th className={th}>Lokasi</th>
                <th className={th}>Unit · Jam</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Potensi hemat</th>
                <th className={th}>Stamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[13px] text-ink-3">
                    Belum ada visitor di periode ini.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.ts}-${i}`}>
                    <td className={`${td} text-ink-2`}>
                      {new Date(r.ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className={`${td} font-semibold`}>{r.name}</td>
                    <td className={td}>{r.phone}</td>
                    <td className={td}>{r.loc}</td>
                    <td className={`${td} text-ink-2`}>
                      {r.unit} · {r.hours}
                    </td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[r.status] || C.grey }} /> {r.status}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>{idr(r.savings)}</td>
                    <td className={`${td} text-ink-2`}>{r.reward || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="px-4 py-3 text-[12px] text-ink-3">Data lengkap visitor dapat diminta ke tim proyek.</p>
        </div>
      )}
    </section>
  );
};
