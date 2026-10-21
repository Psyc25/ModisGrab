import { CountUp } from '../components/CountUp';
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTapRipple } from '../field/fx';
import {
  LogOut,
  RefreshCw,
  Download,
  Copy,
  Check,
  Search,
  Trash2,
  Users,
  MapPin,
  Gift,
  Wallet,
  Lock,
  BarChart3,
  Table2,
  Package,
  AlertCircle,
  Settings,
  ClipboardCheck,
  Map as MapIcon,
} from 'lucide-react';
import { VisitorRecord, MerchInventoryItem } from '../types';
import {
  AdminRole,
  deleteVisitorRemote,
  fetchMerchRemote,
  fetchVisitorsRange,
  getAdminRole,
  getAdminSession,
  isSupabaseConfigured,
  resetMerchRemote,
  signInWithPasswordOnly,
  signOutAdmin,
  updateMerchStockRemote,
} from '../services/supabase';
import { copyForGoogleSheets, exportToCSV, exportToExcel, formatIDR, todayKey } from '../services/storage';
import { brand } from '../assets/brand';
import { GrabOfficialLogo } from '../components/BrandLogos';
import { ReportView } from '../report/ReportView';
import { SettingsPanel, internalLoad } from './internalReport';
import { MAX_STAMPS } from '../config/campaign';
import { SlotPanel } from './SlotPanel';
import { FieldPanel } from './FieldPanel';
import { ErrorBoundary, lazyWithReload } from '../components/ErrorBoundary';

const MapPanel = lazyWithReload(() => import('./MapPanel'));

/**
 * Modul owner / klien (alamat /dashboard).
 * Hanya akun yang terdaftar di tabel modis_admins (peran owner atau client) yang bisa masuk.
 * SPG tidak punya akun, jadi tidak bisa login di sini. Data dilindungi Row Level Security.
 */

type Preset = 'today' | 'yesterday' | 'last7' | 'month' | 'custom';
type View = 'field' | 'laporan' | 'slot' | 'peta' | 'data' | 'pengaturan';

const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + n));
};
/** "Hari ini" selalu menurut WIB, dari mana pun dashboard dibuka. */
const todayWIB = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Batas hari memakai zona waktu Jakarta (WIB). */
const startOfDayWIB = (key: string) => `${key}T00:00:00+07:00`;

const fmtDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const inputCls = 'h-11 px-3 rounded-xl border border-[#D5D8DC] bg-white text-[14px] outline-none focus:border-grab';

/**
 * embedded = dibuka dari menu petugas di dalam aplikasi (tablet SPG).
 * Selalu minta PIN admin, keluar otomatis setelah 10 menit tanpa aktivitas,
 * dan sesi dihapus saat kembali ke aplikasi supaya SPG tidak bisa membukanya lagi.
 */
export const OwnerDashboard: React.FC<{ embedded?: boolean; onExit?: () => void }> = ({ embedded, onExit }) => {
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [email, setEmail] = useState('');

  const exit = async () => {
    await signOutAdmin();
    setRole(null);
    onExit?.();
  };

  // Keluar otomatis bila dibiarkan (mode tablet)
  useEffect(() => {
    if (!embedded) return;
    let last = Date.now();
    const bump = () => (last = Date.now());
    const evts = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    evts.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = window.setInterval(() => {
      if (Date.now() - last > 10 * 60 * 1000) exit();
    }, 15000);
    return () => {
      evts.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

  useEffect(() => {
    (async () => {
      if (embedded) {
        await signOutAdmin();
        setChecking(false);
        return;
      }
      const session = await getAdminSession();
      if (session) {
        const r = await getAdminRole();
        if (r) {
          setRole(r);
          setEmail(session.user.email || '');
        } else {
          await signOutAdmin();
        }
      }
      setChecking(false);
    })();
  }, []);

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-canvas text-ink-2 text-[14px]">Memuat…</div>;
  }
  if (!role) {
    return (
      <LoginScreen
        embedded={embedded}
        onCancel={embedded ? exit : undefined}
        onLoggedIn={(r, e) => {
          setRole(r);
          setEmail(e);
        }}
      />
    );
  }
  return (
    <Dashboard
      role={role}
      email={email}
      embedded={embedded}
      onLogout={embedded ? exit : async () => {
        await signOutAdmin();
        setRole(null);
      }}
    />
  );
};

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------
const LoginScreen: React.FC<{ onLoggedIn: (role: AdminRole, email: string) => void; embedded?: boolean; onCancel?: () => void }> = ({ onLoggedIn, embedded, onCancel }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Masukkan PIN admin.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await signInWithPasswordOnly(password);
    if (!res.success) {
      setBusy(false);
      setError(res.message || 'Login gagal.');
      return;
    }
    const r = await getAdminRole();
    setBusy(false);
    if (!r) {
      await signOutAdmin();
      setError('Akun ini tidak punya akses ke dashboard.');
      return;
    }
    setPassword('');
    onLoggedIn(r, '');
  };

  return (
    <div className="fx-root min-h-screen bg-canvas flex flex-col animate-fade-in">
      <div className="relative h-40 sm:h-48 bg-grab overflow-hidden">
        <div className="relative h-full flex items-center justify-center">
          <GrabOfficialLogo className="h-14 sm:h-16" color="#FFFFFF" />
        </div>
      </div>
      <div className="-mt-6 relative flex-1 flex justify-center px-4 pb-10">
        <form onSubmit={submit} noValidate className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.08)] space-y-4 h-fit">
          <div>
            <h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">Dashboard internal</h1>
            <p className="text-[14px] text-ink-2 mt-1 leading-snug">Laporan, data visitor, peta unit, dan pengaturan. Masukkan PIN admin.</p>
          </div>
          {!isSupabaseConfigured() && (
            <p className="text-[13px] text-modis-red">Supabase belum dikonfigurasi di aplikasi ini.</p>
          )}
          <label className="block">
            <span className="block text-[14px] font-semibold mb-1.5">PIN admin</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              className={`${inputCls} w-full h-12 text-[16px] tracking-[0.1em]`}
            />
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-modis-red font-medium flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="w-full h-12 rounded-xl bg-grab-cta hover:bg-grab-cta-press text-white font-bold text-[16px] disabled:opacity-60">
            {busy ? 'Memeriksa…' : 'Masuk'}
          </button>
          <p className="text-[12px] text-ink-3 leading-snug flex items-start gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Khusus tim office. SPG tidak memiliki akses ke halaman ini.
          </p>
          {onCancel && (
            <button type="button" onClick={onCancel} className="w-full h-11 rounded-xl border border-[#D5D8DC] text-[15px] font-semibold">
              Kembali ke aplikasi
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
const Dashboard: React.FC<{ role: AdminRole; email: string; onLogout: () => void; embedded?: boolean }> = ({ role, email, onLogout, embedded }) => {
  useTapRipple();
  const today = todayWIB();
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [view, setView] = useState<View>('field');

  const [rows, setRows] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const [poi, setPoi] = useState('all');
  const [spg, setSpg] = useState('all');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);
  const [toDelete, setToDelete] = useState<VisitorRecord | null>(null);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'today') {
      setFrom(today);
      setTo(today);
    } else if (p === 'yesterday') {
      const y = addDays(today, -1);
      setFrom(y);
      setTo(y);
    } else if (p === 'last7') {
      setFrom(addDays(today, -6));
      setTo(today);
    } else if (p === 'month') {
      setFrom(`${today.slice(0, 8)}01`);
      setTo(today);
    }
  };

  const load = useCallback(async () => {
    if (!from || !to || to < from) {
      setError('Rentang tanggal tidak valid.');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetchVisitorsRange(startOfDayWIB(from), startOfDayWIB(addDays(to, 1)));
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Gagal memuat data.');
      return;
    }
    setRows(res.data || []);
    setLoadedAt(new Date());
  }, [from, to]);

  useEffect(() => {
    if (view === 'data') load();
  }, [load, view]);

  /** Filter tanggal dipakai bersama oleh tab Laporan, Laporan slot, dan Data visitor. */
  const presetFor = (f: string, t: string): Preset => {
    if (f === today && t === today) return 'today';
    const y = addDays(today, -1);
    if (f === y && t === y) return 'yesterday';
    if (t === today && f === addDays(today, -6)) return 'last7';
    if (t === today && f === `${today.slice(0, 8)}01`) return 'month';
    return 'custom';
  };

  const poiOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.poiLocation).filter(Boolean))).sort(), [rows]);
  const spgOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.spgName).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (poi !== 'all' && r.poiLocation !== poi) return false;
      if (spg !== 'all' && r.spgName !== spg) return false;
      if (!term) return true;
      return [r.fullName, r.email, r.phoneNumber, r.spgName, r.poiLocation].some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [rows, poi, spg, q]);

  const kpi = useMemo(() => {
    const locations = new Set(filtered.map((r) => r.poiLocation).filter(Boolean)).size;
    const rewards = filtered.filter((r) => r.rewardClaimed).length;
    const avg = filtered.length ? Math.round(filtered.reduce((a, r) => a + (r.monthlySavings || 0), 0) / filtered.length) : 0;
    return { total: filtered.length, locations, rewards, avg };
  }, [filtered]);

  const recap = useMemo(() => {
    const map = new Map<string, { poi: string; spg: string; hours: string; total: number; rewards: number }>();
    filtered.forEach((r) => {
      const key = `${r.poiLocation}|${r.spgName}|${r.dutyHours || ''}`;
      const cur = map.get(key) || { poi: r.poiLocation, spg: r.spgName, hours: r.dutyHours || '', total: 0, rewards: 0 };
      cur.total += 1;
      if (r.rewardClaimed) cur.rewards += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const suffix = from === to ? from : `${from}_sd_${to}`;
  const rangeLabel = from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;

  const confirmDelete = async () => {
    if (!toDelete) return;
    const ok = await deleteVisitorRemote(toDelete.id);
    if (ok) setRows((prev) => prev.filter((r) => r.id !== toDelete.id));
    else setError('Gagal menghapus data.');
    setToDelete(null);
  };

  const presets: { id: Preset; label: string }[] = [
    { id: 'today', label: 'Hari ini' },
    { id: 'yesterday', label: 'Kemarin' },
    { id: 'last7', label: '7 hari' },
    { id: 'month', label: 'Bulan ini' },
    { id: 'custom', label: 'Pilih tanggal' },
  ];

  return (
    <div className="fx-root min-h-screen bg-canvas text-ink">
      {/* Header */}
      <header className="hero-grab text-white">
        <span className="hero-orb hero-orb-a" aria-hidden="true" />
        <span className="hero-orb hero-orb-b" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <GrabOfficialLogo className="h-8 shrink-0" color="#FFFFFF" />
            <span className="adam-avatar shrink-0" aria-hidden="true"><img src={brand.masAdam} alt="" draggable={false} /></span>
            <div className="min-w-0">
              <h1 className="font-display text-[17px] font-extrabold leading-tight">Dashboard Grab MODIS</h1>
              <p className="text-[12px] text-white/75 truncate">
                Masuk sebagai <span className="font-semibold text-modis-yellow">{role === 'owner' ? 'Owner' : 'Klien'}</span>
              </p>
            </div>
          </div>
          <button onClick={onLogout} className="h-10 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-[14px] font-semibold flex items-center gap-1.5 shrink-0">
            <LogOut className="w-4 h-4" /> {embedded ? 'Kembali ke aplikasi' : 'Keluar'}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Tab */}
        <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 bg-white/80 backdrop-blur rounded-2xl p-1.5 w-max shadow-[0_8px_24px_-14px_rgba(0,70,34,0.35)] ring-1 ring-black/5">
          {(
            [
              { id: 'field', label: 'Field App', icon: <Users className="w-4 h-4" /> },
              { id: 'laporan', label: 'Laporan Cek Boros', icon: <BarChart3 className="w-4 h-4" /> },
              { id: 'slot', label: 'Laporan slot', icon: <ClipboardCheck className="w-4 h-4" /> },
              { id: 'peta', label: 'Peta unit', icon: <MapIcon className="w-4 h-4" /> },
              { id: 'data', label: 'Data visitor', icon: <Table2 className="w-4 h-4" /> },
              ...(role === 'owner' ? [{ id: 'pengaturan', label: 'Pengaturan', icon: <Settings className="w-4 h-4" /> }] : []),
            ] as { id: View; label: string; icon: React.ReactNode }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              aria-pressed={view === t.id}
              className={`h-10 px-4 rounded-xl text-[14px] whitespace-nowrap flex items-center gap-1.5 transition-colors ${view === t.id ? 'tab-on text-white font-semibold' : 'text-ink-2 font-medium hover:bg-canvas'}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        </div>

        <div key={view} className="animate-tab-swap space-y-4">

        {view === 'laporan' && (
          <ReportView
            mode="internal"
            load={internalLoad}
            refreshMs={60000}
            range={{ from, to }}
            onRangeChange={(f, t) => {
              setFrom(f);
              setTo(t);
              setPreset(presetFor(f, t));
            }}
          />
        )}
        {view === 'peta' && (
          <ErrorBoundary label="peta" compact onReset={() => setView('laporan')}>
            <Suspense fallback={<div className="bg-white rounded-2xl p-6 text-[14px] text-ink-2">Memuat peta…</div>}>
              <MapPanel />
            </Suspense>
          </ErrorBoundary>
        )}
        {view === 'pengaturan' && role === 'owner' && <SettingsPanel />}

        {/* Rentang tanggal (sama dengan tab Laporan) */}
        {(view === 'data' || view === 'slot' || view === 'field') && (
        <section className="bg-white rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                aria-pressed={preset === p.id}
                className={`h-10 px-4 rounded-full border text-[14px] ${
                  preset === p.id ? 'bg-grab-tint border-grab text-grab-deep font-semibold' : 'bg-white border-[#D5D8DC] text-ink font-medium'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-[13px] text-ink-2">
                Dari
                <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} block mt-1`} />
              </label>
              <label className="text-[13px] text-ink-2">
                Sampai
                <input type="date" value={to} max={today} min={from} onChange={(e) => setTo(e.target.value)} className={`${inputCls} block mt-1`} />
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-2">
            <span>
              Periode <strong className="text-ink">{rangeLabel}</strong>
              {loadedAt && ` · diperbarui ${loadedAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })}`}
            </span>
            <button onClick={load} disabled={loading || view !== 'data'} hidden={view !== 'data'} className="h-9 px-3 rounded-lg text-grab-cta font-semibold flex items-center gap-1.5 hover:bg-grab-tint-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
            </button>
          </div>
          {error && (
            <p role="alert" className="text-[13px] text-modis-red font-medium">
              {error}
            </p>
          )}
        </section>
        )}


        {view === 'field' && <FieldPanel from={from} to={to} isOwner={role === 'owner'} />}

        {view === 'slot' && <SlotPanel from={from} to={to} canEdit={role === 'owner'} editorLabel={role === 'owner' ? 'Owner' : 'Klien'} />}

        {view === 'data' && (
          <>
            {/* Rekap per SPG / lokasi / jam jaga */}
            <section className="bg-white rounded-2xl overflow-hidden">
              <h2 className="px-4 pt-4 pb-2 font-display text-[17px] font-bold">Rekap per SPG, lokasi &amp; jam jaga</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead className="bg-canvas text-ink-2 text-left text-[12px] font-semibold">
                    <tr>
                      <th className="px-4 py-2.5">Lokasi</th>
                      <th className="px-4 py-2.5">SPG</th>
                      <th className="px-4 py-2.5">Jam jaga</th>
                      <th className="px-4 py-2.5 text-right">Visitor</th>
                      <th className="px-4 py-2.5 text-right">Dapat stamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {recap.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                          {loading ? 'Memuat…' : 'Belum ada data di periode ini.'}
                        </td>
                      </tr>
                    ) : (
                      recap.map((r) => (
                        <tr key={`${r.poi}|${r.spg}|${r.hours}`}>
                          <td className="px-4 py-2.5 whitespace-nowrap">{r.poi || '—'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-semibold">{r.spg || '—'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{r.hours || '—'}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{r.total}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{r.rewards}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Daftar visitor */}
            <section className="bg-white rounded-2xl overflow-hidden">
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-[17px] font-bold">
                    Daftar visitor <span className="text-ink-3 font-semibold">({filtered.length.toLocaleString('id-ID')})</span>
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => exportToExcel(filtered, suffix)}
                      disabled={!filtered.length}
                      className="h-10 px-3 rounded-xl bg-grab-cta text-white text-[14px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <Download className="w-4 h-4" /> Excel
                    </button>
                    <button
                      onClick={() => exportToCSV(filtered, suffix)}
                      disabled={!filtered.length}
                      className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <Download className="w-4 h-4" /> CSV
                    </button>
                    <button
                      onClick={async () => {
                        if (await copyForGoogleSheets(filtered)) {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                      disabled={!filtered.length}
                      className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Salin ke Sheets
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="relative">
                    <span className="sr-only">Cari</span>
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, WA, email, lokasi, SPG" className={`${inputCls} w-full pl-9`} />
                  </label>
                  <select aria-label="Filter lokasi" value={poi} onChange={(e) => setPoi(e.target.value)} className={inputCls}>
                    <option value="all">Semua lokasi</option>
                    {poiOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Filter SPG" value={spg} onChange={(e) => setSpg(e.target.value)} className={inputCls}>
                    <option value="all">Semua SPG</option>
                    {spgOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[560px] overflow-y-auto border-t border-line">
                <table className="w-full text-[13px]">
                  <thead className="bg-canvas text-ink-2 text-left text-[12px] font-semibold sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5">Waktu</th>
                      <th className="px-3 py-2.5">Nama</th>
                      <th className="px-3 py-2.5">WhatsApp</th>
                      <th className="px-3 py-2.5">Email</th>
                      <th className="px-3 py-2.5">Status boros</th>
                      <th className="px-3 py-2.5 text-right">Hemat/bln</th>
                      <th className="px-3 py-2.5">Stamp</th>
                      <th className="px-3 py-2.5">Stamp</th>
                      <th className="px-3 py-2.5">Lokasi</th>
                      <th className="px-3 py-2.5">SPG · Jam jaga</th>
                      {role === 'owner' && <th className="px-3 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-3 py-8 text-center text-ink-3">
                          {loading ? 'Memuat…' : 'Tidak ada data.'}
                        </td>
                      </tr>
                    ) : (
                      filtered.map((r) => (
                        <tr key={r.id} className="hover:bg-grab-tint-2">
                          <td className="px-3 py-2.5 whitespace-nowrap text-ink-2 tabular-nums">
                            {new Date(r.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-semibold">{r.fullName || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{r.phoneNumber || '—'}</td>
                          <td className="px-3 py-2.5 max-w-[200px] truncate">{r.email || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{r.borosStatus}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{formatIDR(r.monthlySavings)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {r.stampsCount}/{MAX_STAMPS}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{r.rewardClaimed || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{r.poiLocation}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">
                            {r.spgName || '—'}
                            {r.dutyHours ? ` · ${r.dutyHours}` : ''}
                          </td>
                          {role === 'owner' && (
                            <td className="px-3 py-2.5">
                              <button onClick={() => setToDelete(r)} aria-label={`Hapus data ${r.fullName}`} className="p-2 rounded-lg text-ink-3 hover:text-modis-red hover:bg-[#FDF1F1]">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}



        </div>

        <p className="text-[12px] text-ink-3 pb-6">
          Data pribadi visitor dilindungi UU PDP. Unduh dan bagikan hanya untuk keperluan program MODIS.
        </p>
      </main>

      {toDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setToDelete(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <h2 className="font-display text-[18px] font-bold">Hapus data visitor?</h2>
            <p className="text-[14px] text-ink-2">
              {toDelete.fullName} akan dihapus permanen.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setToDelete(null)} className="flex-1 h-11 rounded-xl border border-[#D5D8DC] font-semibold">
                Batal
              </button>
              <button onClick={confirmDelete} className="flex-1 h-11 rounded-xl bg-modis-red text-white font-semibold">
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string; note?: string }> = ({ icon, label, value, note }) => (
  <div className="kpi-card bg-white rounded-2xl p-4">
    <div className="kpi-icon w-9 h-9 rounded-xl text-white flex items-center justify-center">{icon}</div>
    <div className="mt-3 text-[13px] text-ink-2 leading-tight">{label}</div>
    <div className="font-display text-[24px] font-extrabold tracking-[-0.02em] tabular-nums leading-tight mt-0.5"><CountUp text={value} /></div>
    {note && <div className="text-[12px] text-ink-3 mt-0.5">{note}</div>}
  </div>
);
