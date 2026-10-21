import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudOff,
  CloudUpload,
  LogOut,
  MapPin,
  Menu,
  Package,
  ClipboardCheck,
  Boxes,
  History,
  Plus,
  CalendarDays,
  PartyPopper,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { brand } from '../assets/brand';
import { GrabOfficialLogo } from '../components/BrandLogos';
import { DAILY_TARGET_PER_UNIT, FieldSession, REWARD_LABEL, STOCK_ITEMS, merchLabel, shiftInfo, shiftText, TYPE_LABEL, UnitToday, fieldApi } from './api';
import { HourlyCard, rewardLeft, useUnitDay } from './TlScreens';
import { Confetti } from './fx';
import { planFor } from '../data/plotting';
import { getPlottingCache, getContacts, getLog, groupPeople, onQueueChange, pendingCounts, sessionExpired, syncQueue, todayWIB } from './store';

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

/** Label stok untuk peringatan: nama item reward (bukan kode). */
const LOW_LABEL: Record<string, string> = { candy: 'Kupon Candy', tier_c: 'Kupon Tier C', tier_b: 'Kupon Tier B', tier_a: 'Kupon Tier A' };
const lowLabel = (id: string) => LOW_LABEL[id] || STOCK_ITEMS.find((x) => x.id === id)?.label || merchLabel(id);

const SHORT_LABEL = { pahe_new: 'PaHe New', pahe_lapsed: 'PaHe Churned', gb_hemat: 'GB Hemat' } as const;

export const FieldHome: React.FC<{
  session: FieldSession;
  onNewCustomer: () => void;
  onChangeVenue: () => void;
  onOpenDashboard: () => void;
  onOpenStock: () => void;
  onOpenClose: () => void;
  onOpenStockView: () => void;
  onOpenIssue: () => void;
  onBackfill: () => void;
  onLogout: () => void;
}> = ({ session, onNewCustomer, onChangeVenue, onOpenDashboard, onOpenStock, onOpenClose, onOpenStockView, onOpenIssue, onBackfill, onLogout }) => {
  const [pending, setPending] = useState({ records: 0, photos: 0 });
  const [online, setOnline] = useState(navigator.onLine);
  const [server, setServer] = useState<UnitToday | null>(null);
  const [menu, setMenu] = useState(false);
  const [tick, setTick] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      pendingCounts().then(setPending);
      setTick((t) => t + 1);
    };
    refresh();
    const off = onQueueChange(refresh);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      off();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  // Progres unit dari server (termasuk tablet lain) bila ada sinyal
  useEffect(() => {
    if (!online) return;
    let alive = true;
    const load = () =>
      fieldApi
        .unitToday(session.token)
        .then((r) => alive && setServer(r))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [online, session.token, tick]);

  const day = todayWIB();
  const log = useMemo(() => getLog().filter((e) => e.day === day && e.unit_id === session.unit_id), [day, session.unit_id, tick]);
  // Satu orang = satu data (nama + 4 digit nomor sama digabung); total & kartu tipe dihitung per orang
  const people = useMemo(() => groupPeople(log), [log]);
  const local = useMemo(() => {
    const c = { pahe_new: 0, pahe_lapsed: 0, gb_hemat: 0 };
    people.filter((g) => g.status !== 'conflict').forEach((g) => (c[g.type] += 1));
    return c;
  }, [people]);
  const count = (t: 'pahe_new' | 'pahe_lapsed' | 'gb_hemat') => local[t];
  const total = count('pahe_new') + count('pahe_lapsed') + count('gb_hemat');
  const pct = Math.min(100, (total / DAILY_TARGET_PER_UNIT) * 100);
  const expired = sessionExpired(session);
  const plan = useMemo(() => planFor(getPlottingCache(), day, session.unit_id), [day, session.unit_id, tick]);

  // Stok menipis / habis (≤15% dari stok masuk) dari hitungan app
  const unitDay = useUnitDay(session);
  const low = useMemo(() => {
    const l = rewardLeft(unitDay);
    if (!l) return [];
    return Object.entries(l)
      .filter(([, n]) => n !== Infinity)
      .sort((a, b) => a[1] - b[1])
      .map(([id, n]) => ({ id, n }));
  }, [unitDay]);

  // Selebrasi saat melewati 25/50/75/100% target (sekali per hari per unit)
  const [cheer, setCheer] = useState<number | null>(null);
  useEffect(() => {
    const step = Math.floor(Math.min(100, (total / DAILY_TARGET_PER_UNIT) * 100) / 25) * 25;
    if (step < 25) return;
    const key = `modis_ms_${session.unit_id}_${day}`;
    let last = 0;
    try {
      last = Number(localStorage.getItem(key) || 0);
    } catch {
      /* abaikan */
    }
    if (step > last) {
      try {
        localStorage.setItem(key, String(step));
      } catch {
        /* abaikan */
      }
      setCheer(step);
      try {
        navigator.vibrate?.([80, 60, 80, 60, 120]);
      } catch {
        /* abaikan */
      }
      const t = window.setTimeout(() => setCheer(null), 4200);
      return () => window.clearTimeout(t);
    }
  }, [total, day, session.unit_id]);
  const contacts = getContacts(session.unit_id);

  const syncNow = async () => {
    setSyncing(true);
    await syncQueue();
    setSyncing(false);
  };

  const syncChip = !online ? (
    <span className="h-9 px-3 rounded-full bg-[#FFF3E0] text-[#8A5300] text-[13px] font-bold flex items-center gap-1.5">
      <CloudOff className="w-4 h-4" /> Offline · {pending.records} antre
    </span>
  ) : pending.records + pending.photos > 0 ? (
    <button onClick={syncNow} className="h-9 px-3 rounded-full bg-modis-yellow text-ink text-[13px] font-bold flex items-center gap-1.5">
      <CloudUpload className={`w-4 h-4 ${syncing ? 'animate-bounce' : ''}`} /> {pending.records + pending.photos} belum terkirim
    </button>
  ) : (
    <span className="h-9 px-3 rounded-full bg-white/15 text-white text-[13px] font-semibold flex items-center gap-1.5">
      <CheckCircle2 className="w-4 h-4" /> Semua terkirim
    </span>
  );

  return (
    <div className="min-h-[100dvh] bg-canvas">
      {/* Header */}
      <div className="hero-grab relative text-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-16 overflow-hidden">
        <img src={brand.skyline} alt="" className="absolute inset-x-0 bottom-0 w-full opacity-20" draggable={false} />
        <div className="relative max-w-2xl mx-auto">
          <img src={brand.masAdam} alt="" draggable={false} className="adam-peek pointer-events-none absolute right-0 bottom-[-58px] h-[188px] w-auto select-none" />
          <div className="flex items-center justify-between gap-2">
            <GrabOfficialLogo className="h-5" color="#FFFFFF" />
            <div className="flex items-center gap-2">
              {syncChip}
              <button onClick={() => setMenu(true)} aria-label="Menu" className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-3">
          <div className="min-w-0 max-w-[64%]">
            <p className="text-[13px] text-white/80 flex items-center gap-2 flex-wrap">
              {session.unit_name} · Shift {shiftInfo(session.shift).name}
              {session.role === 'tl' && <span className="px-2 py-0.5 rounded-full bg-modis-yellow text-ink text-[11px] font-bold">TEAM LEADER</span>}
            </p>
            <h1 className="font-display text-[24px] font-extrabold leading-tight">Halo, {session.spg_name}</h1>
            <button onClick={onChangeVenue} className="mt-2 h-9 pl-2.5 pr-3 rounded-full bg-white/95 text-ink text-[13px] font-semibold flex items-center gap-1.5 max-w-full">
              <MapPin className="w-4 h-4 text-grab shrink-0" />
              <span className="truncate">{session.poi_location || 'Pilih venue'}</span>
              <span className="text-grab-cta shrink-0">· ganti</span>
            </button>
          </div>
          </div>
        </div>
      </div>

      <div className="relative -mt-10 max-w-2xl mx-auto px-4 pb-10 space-y-3 stagger">
        {expired && (
          <p className="bg-[#FFF3E0] rounded-2xl p-3 text-[13px] flex items-start gap-2">
            <TriangleAlert className="w-4 h-4 text-modis-orange shrink-0 mt-0.5" />
            Sesi 12 jam sudah habis. Input tetap bisa dan tersimpan di tablet. Logout lalu login ulang saat ada sinyal supaya data terkirim.
          </p>
        )}

        {plan && plan.venues.length > 0 && (
          <button onClick={onChangeVenue} className="w-full text-left rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(0,80,40,0.10)] active:scale-[0.99] transition">
            <p className="text-[12px] font-bold text-ink-3 uppercase tracking-wide flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-grab" /> Plotting hari ini{plan.shift ? ` · ${shiftText(plan.shift)}` : plan.shiftLabel ? ` · ${plan.shiftLabel}` : ''}
            </p>
            <div className="mt-2 space-y-1.5">
              {plan.venues.map((v, i) => {
                const here = v.name === session.poi_location;
                return (
                  <div key={v.name} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${here ? 'bg-grab-tint' : 'bg-canvas'}`}>
                    <span className={`w-7 h-7 rounded-full text-[13px] font-bold flex items-center justify-center shrink-0 ${here ? 'bg-grab text-white' : 'bg-white text-ink-2'}`}>{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-bold truncate">{v.name}</span>
                      <span className="block text-[12px] text-ink-2 truncate">{[v.time, ...v.tags].filter(Boolean).join(' · ')}</span>
                    </span>
                    {here && <span className="text-[11px] font-bold text-grab-deep shrink-0">SEKARANG</span>}
                  </div>
                );
              })}
            </div>
            {plan.venues.every((v) => v.name !== session.poi_location) && (
              <p className="mt-2 text-[12px] font-semibold text-[#8A5300]">Venue yang dipilih belum sesuai plotting. Sentuh untuk ganti.</p>
            )}
          </button>
        )}

        {/* Aksi utama */}
        <button
          onClick={onNewCustomer}
          className="cta-glow relative overflow-hidden w-full rounded-[28px] bg-white p-5 flex items-center gap-4 shadow-[0_8px_30px_rgba(0,80,40,0.12)] active:scale-[0.99] transition text-left"
        >
          <span className="w-16 h-16 rounded-2xl bg-grab-cta text-white flex items-center justify-center shrink-0 animate-pulse-ring">
            <Plus className="w-9 h-9" strokeWidth={2.5} />
          </span>
          <span className="flex-1">
            <span className="block font-display text-[21px] font-extrabold">Customer baru</span>
            <span className="block text-[13px] text-ink-2">Data visitor + Cek Boros + reward{contacts > 0 ? ` · ${contacts}x cek boros hari ini` : ''}</span>
          </span>
          <ChevronRight className="w-6 h-6 text-ink-3" />
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={onOpenStockView} className="rounded-3xl bg-white p-4 text-left active:scale-[0.99] transition">
            <span className="w-11 h-11 rounded-xl bg-grab-tint text-grab-deep flex items-center justify-center">
              <Boxes className="w-6 h-6" />
            </span>
            <span className="block mt-2 text-[16px] font-bold">Sisa stok</span>
            <span className="block text-[12px] text-ink-2">Reward di unit ini</span>
          </button>
          <button onClick={onOpenIssue} className="rounded-3xl bg-white p-4 text-left active:scale-[0.99] transition">
            <span className="w-11 h-11 rounded-xl bg-[#FFF3E0] text-modis-orange flex items-center justify-center">
              <TriangleAlert className="w-6 h-6" />
            </span>
            <span className="block mt-2 text-[16px] font-bold">Laporkan issue</span>
            <span className="block text-[12px] text-ink-2">Kendala saat shift</span>
          </button>
        </div>

        {session.role === 'tl' && (
          <section className="rounded-3xl bg-white p-3 space-y-2">
            <p className="px-1 pt-1 text-[12px] font-bold text-ink-3 uppercase tracking-wide">Menu Team Leader</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onOpenStock} className="rounded-2xl bg-canvas p-3 text-left active:scale-[0.99] transition flex items-center gap-2.5">
                <Package className="w-5 h-5 text-grab-deep shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold">Stok unit</span>
                  <span className="block text-[12px] text-ink-2 truncate">Opening · refill · closing</span>
                </span>
              </button>
              <button onClick={onOpenClose} className="rounded-2xl bg-canvas p-3 text-left active:scale-[0.99] transition flex items-center gap-2.5">
                <ClipboardCheck className="w-5 h-5 text-grab-deep shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold">Close day</span>
                  <span className="block text-[12px] text-ink-2 truncate">Ringkasan + teks WA</span>
                </span>
              </button>
            </div>
            <button onClick={onBackfill} className="w-full rounded-2xl bg-canvas p-3 text-left active:scale-[0.99] transition flex items-center gap-2.5">
              <History className="w-5 h-5 text-grab-deep shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">Input susulan</span>
                <span className="block text-[12px] text-ink-2 truncate">Dari Google Form / kertas saat app tidak bisa dipakai</span>
              </span>
              <ChevronRight className="w-4 h-4 text-ink-3" />
            </button>
          </section>
        )}

        {low.length > 0 && (
          <section className="rounded-3xl bg-[#FFF3E0] border border-[#FFD8A8] p-4 animate-fade-in">
            <p className="text-[15px] font-bold text-[#8A5300] flex items-center gap-2">
              <TriangleAlert className="w-5 h-5 shrink-0" /> Stok menipis
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {low.slice(0, 8).map((x) => (
                <span key={x.id} className={`px-2.5 py-1 rounded-full text-[12px] font-bold ${x.n <= 0 ? 'bg-modis-red text-white' : 'bg-white text-[#8A5300]'}`}>
                  {lowLabel(x.id)} · {x.n <= 0 ? 'habis' : `sisa ${x.n}`}
                </span>
              ))}
            </div>
            {session.role === 'tl' ? (
              <button onClick={onOpenStock} className="mt-3 h-10 px-4 rounded-xl bg-white text-[14px] font-bold text-[#8A5300]">
                Buka stok unit &amp; refill
              </button>
            ) : (
              <p className="mt-2 text-[12px] text-[#8A5300]">Kabari TL untuk refill.</p>
            )}
          </section>
        )}

        {/* Progres */}
        <section className="bg-white rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold">Progres unit hari ini</h2>
            <span className="text-[12px] text-ink-3">per orang · tablet ini</span>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative w-[124px] h-[124px] shrink-0">
              <svg viewBox="0 0 124 124" className="w-full h-full -rotate-90" aria-hidden="true">
                <circle cx="62" cy="62" r={RING_R} fill="none" stroke="#EEF1F3" strokeWidth="12" />
                <circle
                  cx="62"
                  cy="62"
                  r={RING_R}
                  fill="none"
                  stroke="url(#ringGrad)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - pct / 100)}
                  style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)' }}
                />
                <defs>
                  <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00B14F" />
                    <stop offset="100%" stopColor="#2FD67B" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-[32px] font-extrabold leading-none tabular-nums"><span key={total} className="num-flash">{total}</span></span>
                <span className="text-[12px] text-ink-3">/ {DAILY_TARGET_PER_UNIT}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-[22px] font-extrabold leading-tight">{Math.round(pct)}%</p>
              <p className="text-[13px] text-ink-2 leading-snug">
                {total >= DAILY_TARGET_PER_UNIT ? 'Target hari ini tercapai! Lanjutkan 🔥' : `Kurang ${DAILY_TARGET_PER_UNIT - total} lagi menuju target harian`}
              </p>
              <div className="mt-2 flex gap-1">
                {[25, 50, 75, 100].map((m) => (
                  <span
                    key={m}
                    className={`flex-1 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${
                      pct >= m ? 'bg-grab text-white' : 'bg-canvas text-ink-3'
                    }`}
                  >
                    {m}%
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['pahe_new', 'pahe_lapsed', 'gb_hemat'] as const).map((t) => (
              <div key={t} className="rounded-2xl bg-canvas p-3 min-w-0 border-l-4 transition-transform hover:-translate-y-0.5" style={{ borderLeftColor: t === 'pahe_new' ? '#00B14F' : t === 'pahe_lapsed' ? '#3B82F6' : '#FF8000' }}>
                <p className="text-[12px] font-bold uppercase tracking-wide text-ink-2 truncate">{SHORT_LABEL[t]}</p>
                <p className="font-display text-[22px] font-extrabold tabular-nums leading-tight mt-0.5"><span key={count(t)} className="num-flash">{count(t)}</span></p>
              </div>
            ))}
          </div>
          {server && server.conflicts > 0 && (
            <p className="mt-2 text-[12px] text-modis-red flex items-center gap-1">
              <TriangleAlert className="w-3.5 h-3.5" /> {server.conflicts} data ditandai double claim (dicek office)
            </p>
          )}
        </section>

        <HourlyCard session={session} />

        {/* Riwayat */}
        <section className="bg-white rounded-3xl overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <h2 className="text-[16px] font-bold">Input terakhir di tablet ini</h2>
            {online && pending.records + pending.photos > 0 && (
              <button onClick={syncNow} className="text-[13px] font-semibold text-grab-cta flex items-center gap-1">
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Kirim sekarang
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {log.length === 0 && <li className="px-4 py-6 text-center text-[14px] text-ink-3">Belum ada input hari ini.</li>}
            {[...people]
              .reverse()
              .slice(0, 12)
              .map((g) => (
                <li key={g.key} className="px-4 py-3 flex items-center gap-3">
                  {g.status === 'ok' ? (
                    <CheckCircle2 className="w-5 h-5 text-grab shrink-0" />
                  ) : g.status === 'conflict' ? (
                    <TriangleAlert className="w-5 h-5 text-modis-red shrink-0" />
                  ) : (
                    <Clock3 className="w-5 h-5 text-ink-3 shrink-0" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold truncate">
                      {g.name} <span className="text-ink-3 font-normal">••{g.last4}</span>
                    </span>
                    {g.entries.map((e) => (
                      <span key={e.id} className="block text-[12px] text-ink-2 truncate">
                        {TYPE_LABEL[e.type]} · {REWARD_LABEL[e.reward]}
                        {e.merch || e.prize ? ` (${merchLabel(e.merch || e.prize)})` : ''}
                        {e.reward2 ? ` · draw ke-2 ${REWARD_LABEL[e.reward2]}` : ''}
                        {e.photobooth ? ' · photobooth' : ''}
                        {e.status === 'conflict' ? ` · ${e.note || 'double claim'}` : e.status === 'queued' ? ' · belum terkirim' : ''}
                      </span>
                    ))}
                  </span>
                  <span className="text-[12px] text-ink-3 tabular-nums">
                    {new Date(g.at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </div>

      {cheer && (
        <div className="fixed inset-x-0 top-0 z-[70] flex justify-center pt-[max(1rem,env(safe-area-inset-top))] px-4 pointer-events-none">
          <div className="relative pointer-events-auto bg-white rounded-3xl shadow-2xl px-5 py-4 flex items-center gap-3 animate-drop-in overflow-visible" onClick={() => setCheer(null)}>
            <Confetti count={26} />
            <span className="w-12 h-12 rounded-2xl bg-modis-yellow flex items-center justify-center shrink-0">
              <PartyPopper className="w-7 h-7" />
            </span>
            <span>
              <span className="block font-display text-[18px] font-extrabold">{cheer >= 100 ? 'Target tercapai!' : `${cheer}% target!`}</span>
              <span className="block text-[13px] text-ink-2">{cheer >= 100 ? `${DAILY_TARGET_PER_UNIT} conversion hari ini. Mantap!` : 'Semangat, terus kejar!'}</span>
            </span>
          </div>
        </div>
      )}

      {menu && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center animate-fade-in" onClick={() => setMenu(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-canvas rounded-t-[28px] sm:rounded-[28px] p-4 pb-6 space-y-2 animate-sheet-up">
            <div className="flex items-center justify-between px-1 pb-1">
              <div>
                <p className="text-[12px] font-semibold text-ink-3 uppercase tracking-wide">Menu</p>
                <p className="text-[15px] font-bold">
                  {session.spg_name} · {session.unit_name} · {shiftInfo(session.shift).name}
                </p>
              </div>
              <button onClick={() => setMenu(false)} aria-label="Tutup" className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            {session.role === 'tl' && (
              <>
                <MenuItem icon={<Package className="w-5 h-5" />} title="Stok unit" sub="Opening, refill, closing, selisih" onClick={() => (setMenu(false), onOpenStock())} />
                <MenuItem icon={<ClipboardCheck className="w-5 h-5" />} title="Close day" sub="Ringkasan + teks WA" onClick={() => (setMenu(false), onOpenClose())} />
                <MenuItem icon={<History className="w-5 h-5" />} title="Input susulan" sub="Data dari Google Form / kertas" onClick={() => (setMenu(false), onBackfill())} />
              </>
            )}
            <MenuItem icon={<Boxes className="w-5 h-5" />} title="Sisa stok unit" sub="Perkiraan sisa reward hari ini" onClick={() => (setMenu(false), onOpenStockView())} />
            <MenuItem icon={<TriangleAlert className="w-5 h-5" />} title="Laporkan issue" sub="Kendala stok, tablet, sinyal, venue" onClick={() => (setMenu(false), onOpenIssue())} />
            <MenuItem
              icon={<MapPin className="w-5 h-5" />}
              title="Ganti venue"
              sub={session.poi_location || 'Belum dipilih'}
              onClick={() => {
                setMenu(false);
                onChangeVenue();
              }}
            />
            <MenuItem
              icon={<BarChart3 className="w-5 h-5" />}
              title="Dashboard office"
              sub="PIN admin"
              onClick={() => {
                setMenu(false);
                onOpenDashboard();
              }}
            />
            <MenuItem
              icon={<LogOut className="w-5 h-5" />}
              title="Logout / ganti SPG"
              sub={pending.records ? `Masih ada ${pending.records} data belum terkirim, tetap aman di tablet` : 'Akhiri sesi shift'}
              danger
              onClick={() => {
                setMenu(false);
                onLogout();
              }}
            />
            <p className="px-1 pt-1 text-[11px] text-ink-3 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Nomor HP dihapus dari tablet setelah terkirim ke server.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; title: string; sub?: string; onClick?: () => void; disabled?: boolean; danger?: boolean }> = ({
  icon,
  title,
  sub,
  onClick,
  disabled,
  danger,
}) => (
  <button onClick={onClick} disabled={disabled} className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-white text-left disabled:opacity-50 active:scale-[0.99] transition">
    <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-[#FDECEA] text-modis-red' : 'bg-grab-tint text-grab-deep'}`}>{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-[15px] font-bold">{title}</span>
      {sub && <span className="block text-[12px] text-ink-2 truncate">{sub}</span>}
    </span>
    {!disabled && <ChevronRight className="w-4 h-4 text-ink-3" />}
  </button>
);
