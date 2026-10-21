import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Banknote, Bike, Calculator, Camera, Check, CheckCircle2, Coffee, Cookie, Gift, History, Loader2, Phone, RefreshCw, RotateCcw, ShieldCheck, Sparkles, TriangleAlert, UserRound, Users, XCircle } from 'lucide-react';
import { CONSENT_TEXT, CONSENT_VER, ConvType, FieldSession, MERCH, REWARD_LABEL, Reward, ACTIVE_SHIFTS, Shift, TYPE_LABEL, shiftInfo, WELCOME_DRINKS, WELCOME_SNACKS, campaignWeek, fieldApi, isFullMenuDay, merchLabel, snacksFor } from './api';
import { addContact, addDaysKey, enqueueConversion, enqueueOp, getCrewCache, localClaimStatus, newId, normalizePhone62, nowHHMM, syncQueue, todayWIB } from './store';
import { rewardLeft, useUnitDay } from './TlScreens';
import { venueList } from './VenuePicker';
import { compressPhoto } from './photo';
import { Confetti } from './fx';
import { StampCardImage } from './StampCard';
import { COST_OPTIONS, calculateBoros } from '../utils/calculator';
import { ResultScreen } from '../components/ResultScreen';
import { formatIDR } from '../services/storage';
import type { HabitsData } from '../types';

export interface CustomerPrefill {
  phone: string;
  name: string;
  type?: ConvType;
}

type Lookup = { pahe: boolean; paheType?: string | null; paheToday?: boolean; gb: boolean; name?: string | null; source: 'server' | 'tablet' };

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const COUPONS: { id: Reward; label: string; cls: string }[] = [
  { id: 'candy', label: 'Candy', cls: 'bg-[#FFF0F6] text-[#C2255C] border-[#FCC2D7]' },
  { id: 'tier_c', label: 'Tier C', cls: 'bg-[#E7F5FF] text-[#1864AB] border-[#A5D8FF]' },
  { id: 'tier_b', label: 'Tier B', cls: 'bg-[#F3F0FF] text-[#5F3DC4] border-[#D0BFFF]' },
  { id: 'tier_a', label: 'Tier A', cls: 'bg-[#FFF9DB] text-[#E67700] border-[#FFE066]' },
];


/** Pilihan item (welcome snack / drink). */
const ItemChip: React.FC<{ label: string; sub?: string; on: boolean; tag: string | null; onClick: () => void }> = ({ label, sub, on, tag, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={`min-h-14 px-3 py-2 rounded-2xl border-2 text-left ${on ? 'border-grab bg-grab-tint text-grab-deep shadow-[0_4px_14px_-6px_rgba(0,177,79,0.6)]' : 'border-[#E1E4E8] bg-white'}`}
  >
    <span className="flex items-center justify-between gap-2">
      <span className="text-[15px] font-bold">{label}</span>
      {on && <Check className="w-4 h-4 shrink-0 animate-pop" strokeWidth={3} />}
    </span>
    {sub && <span className="block text-[11px] text-ink-3 leading-tight">{sub}</span>}
    {tag && <span className="block text-[10px] font-bold text-modis-red">{tag}</span>}
  </button>
);

const isTier = (r: Reward | null): r is 'tier_c' | 'tier_b' | 'tier_a' => r === 'tier_c' || r === 'tier_b' || r === 'tier_a';

/** Pilihan item merch untuk tier yang didapat. */
const TIER_NAME: Record<'tier_c' | 'tier_b' | 'tier_a', string> = { tier_c: 'Tier C', tier_b: 'Tier B', tier_a: 'Tier A' };
const MerchPicker: React.FC<{ tier: 'tier_c' | 'tier_b' | 'tier_a'; value: string | null; onChange: (v: string) => void; tag: (id: string) => string | null; title: string }> = ({ tier, value, onChange, tag, title }) => (
  <div className="rounded-2xl border border-line bg-white overflow-hidden animate-fade-in">
    <div className="px-3 py-2 bg-canvas flex items-center justify-between gap-2">
      <p className="text-[13px] font-bold text-ink-1">{title}</p>
      <span className="text-[11px] font-bold text-ink-3 uppercase tracking-wide">{TIER_NAME[tier]}</span>
    </div>
    <div className={`p-2 grid gap-2 ${MERCH[tier].length === 2 ? 'grid-cols-2' : MERCH[tier].length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
      {MERCH[tier].map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={value === m.id}
          className={`min-h-14 px-3 py-2 rounded-xl border-2 text-left flex items-center justify-between gap-2 ${value === m.id ? 'border-grab bg-grab-tint text-grab-deep' : 'border-[#E1E4E8] bg-white'}`}
        >
          <span>
            <span className="block text-[14px] font-bold leading-tight">{m.label}</span>
            {tag(m.id) && <span className="block text-[10px] font-bold text-modis-red">{tag(m.id)}</span>}
          </span>
          {value === m.id && <Check className="w-4 h-4 shrink-0" strokeWidth={3} />}
        </button>
      ))}
    </div>
  </div>
);

/**
 * Alur input customer di layar SPG (spec 4). Consent dibacakan & dicentang lebih dulu (spec 2),
 * lalu HP → Nama → Tipe → Foto bukti → Reward → Simpan.
 * Mode input susulan (TL): waktu, nama SPG, shift, venue diisi manual; foto boleh dari Google Form.
 * Tersimpan dulu di tablet (aman tanpa sinyal), lalu dikirim otomatis.
 */
export const CustomerFlow: React.FC<{
  session: FieldSession;
  prefill?: CustomerPrefill | null;
  onDone: (saved: { phone: string; name: string; type: ConvType } | null) => void;
  backfill?: boolean;
  onExit?: () => void;
}> = ({ session, prefill, onDone, backfill = false, onExit }) => {
  // Input susulan (khusus TL)
  const [bfDate, setBfDate] = useState(todayWIB());
  const [bfTime, setBfTime] = useState(nowHHMM());
  const [bfSpg, setBfSpg] = useState('');
  const [bfShift, setBfShift] = useState<Shift>(session.shift);
  const [bfPoi, setBfPoi] = useState(session.poi_location || '');
  const [bfNoPhoto, setBfNoPhoto] = useState(true);
  const crewNames = getCrewCache().filter((c) => c.unit_id === session.unit_id);
  const poiOptions = React.useMemo(() => Object.values(venueList()).flat(), []);
  const unitDay = useUnitDay(session);
  const left = rewardLeft(unitDay);
  const todaySnacks = snacksFor(todayWIB(), unitDay.welcome);
  const fullMenu = isFullMenuDay(todayWIB(), unitDay.welcome);

  const lowTag = (r: string) => {
    const n = left?.[r];
    if (n === undefined || n === Infinity) return null;
    return n <= 0 ? 'habis' : `sisa ${n}`;
  };
  const [phoneRaw, setPhoneRaw] = useState(prefill?.phone ? `0${prefill.phone.slice(2)}` : '');
  const phone = normalizePhone62(phoneRaw);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [checking, setChecking] = useState(false);
  const [name, setName] = useState(prefill?.name || '');
  const [type, setType] = useState<ConvType | null>(prefill?.type || null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [merch, setMerch] = useState<string | null>(null);
  const [photobooth, setPhotobooth] = useState(false);
  const [consent, setConsent] = useState(false);
  // Cek Boros: dihitung setelah data visitor diisi (customer lanjutan GB Hemat tidak perlu lagi)
  const showBoros = !prefill && !backfill;
  // Peringkat GrabBike Hemat: jumlah order 30 hari terakhir (dari Riwayat di aplikasi Grab customer) atau "tidak ikut"
  const [gb30, setGb30] = useState<number | null>(null);
  const [gbSkip, setGbSkip] = useState(false);
  const [gbOk, setGbOk] = useState(false);
  const gbReady = gbSkip || gb30 !== null;
  const gbHigh = !gbSkip && gb30 !== null && gb30 > 60;
  const [habits, setHabits] = useState<HabitsData>({ dailyBikeTrips: '', avgTripCost: '' });
  const borosReady = Number(habits.dailyBikeTrips) > 0 && Boolean(habits.avgTripCost);
  const boros = React.useMemo(() => calculateBoros(habits), [habits]);
  const [borosOpen, setBorosOpenRaw] = useState(false);
  const scrollY = useRef(0);
  const setBorosOpen = (v: boolean) => {
    if (v) scrollY.current = window.scrollY;
    setBorosOpenRaw(v);
    window.setTimeout(() => window.scrollTo(0, v ? 0 : scrollY.current), 0);
  };
  const contactCounted = useRef(false);
  // Hasil Cek Boros dikirim sekali per customer (saat simpan, atau saat keluar tanpa simpan)
  const borosSent = useRef(false);
  const borosLatest = useRef<{ ready: boolean; habits: HabitsData; calc: ReturnType<typeof calculateBoros> } | null>(null);
  borosLatest.current = { ready: borosReady, habits, calc: boros };
  const sendBoros = () => {
    const b = borosLatest.current;
    if (!b?.ready || borosSent.current) return;
    borosSent.current = true;
    enqueueOp(session, 'boros', {
      boros: {
        poi: session.poi_location || '',
        trips_day: `${b.habits.dailyBikeTrips} kali`,
        trip_cost: b.habits.avgTripCost,
        trips_month: b.calc.tripsPerMonth,
        monthly_cost: b.calc.monthlyCostNormal,
        discount: b.calc.paheDiscount,
        savings: b.calc.monthlySavings,
        status: b.calc.borosStatus,
      },
    });
  };
  useEffect(() => () => sendBoros(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (borosReady && !contactCounted.current) {
      contactCounted.current = true;
      addContact(session.unit_id);
    }
  }, [borosReady, session.unit_id]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ type: ConvType; note?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(Date.now());

  // Cek klaim: server bila ada sinyal, cache tablet bila tidak
  useEffect(() => {
    setLookup(null);
    if (!phone) return;
    let cancelled = false;
    setChecking(true);
    (async () => {
      const local = await localClaimStatus(phone);
      let res: Lookup = { pahe: local.pahe, gb: local.gb, source: 'tablet' };
      if (navigator.onLine) {
        try {
          const r = await withTimeout(fieldApi.lookup(session.token, phone), 4000);
          res = { pahe: Boolean(r.pahe) || local.pahe, paheType: r.pahe, paheToday: r.pahe_day === todayWIB(), gb: r.gb_today || local.gb, name: r.name, source: 'server' };
        } catch {
          /* pakai cache tablet */
        }
      }
      if (cancelled) return;
      setLookup(res);
      setChecking(false);
      if (res.name && !name) setName(res.name);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, session.token]);

  // Tipe yang sudah tidak boleh diklaim otomatis dibatalkan
  useEffect(() => {
    if (!lookup || !type) return;
    if ((type !== 'gb_hemat' && lookup.pahe) || (type === 'gb_hemat' && lookup.gb)) setType(null);
  }, [lookup, type]);

  // Ganti tipe: reward & item dipilih ulang
  useEffect(() => {
    setReward(null);
    setMerch(null);
    if (type === 'gb_hemat') setPhotobooth(false);
  }, [type]);

  const pickReward = (r: Reward, item: string | null = null) => {
    setReward(r);
    setMerch(item);
  };

  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);

  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const b = await compressPhoto(f);
      setPhoto(b);
      setPhotoUrl(URL.createObjectURL(b));
    } catch (e: any) {
      setError(e?.message || 'Foto gagal diproses');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const blocked = (t: ConvType) => (lookup ? (t === 'gb_hemat' ? lookup.gb : lookup.pahe) : false);
  const bfMissing = !backfill
    ? null
    : bfSpg.trim().length < 2
    ? 'Isi nama SPG'
    : !/^\d{2}:\d{2}$/.test(bfTime)
    ? 'Isi jam kejadian'
    : `${bfDate}T${bfTime}` > `${todayWIB()}T${nowHHMM()}`
    ? 'Jam kejadian belum lewat'
    : bfPoi.trim().length < 2
    ? 'Isi venue'
    : null;
  const missing = !consent
    ? 'Centang consent dulu'
    : bfMissing
    ? bfMissing
    : !phone
    ? 'Isi nomor HP'
    : checking
    ? 'Mengecek nomor…'
    : name.trim().length < 2
    ? 'Isi nama'
    : !type
    ? 'Pilih tipe'
    : showBoros && !gbReady
    ? 'Isi order GrabBike 30 hari'
    : gbHigh && !gbOk
    ? 'Konfirmasi angka order'
    : !photo && !(backfill && bfNoPhoto)
    ? 'Ambil foto bukti'
    : !reward
    ? type === 'gb_hemat' ? 'Pilih kupon' : 'Pilih welcome item'
    : isTier(reward) && !merch
    ? 'Pilih item hadiah'
    : null;

  const save = async () => {
    if (missing || saving || !type || !reward || (!photo && !(backfill && bfNoPhoto))) return;
    setSaving(true);
    setError(null);
    try {
      // Cek ulang cache tablet tepat sebelum simpan (mencegah 2 SPG input nomor sama di tablet ini)
      const local = await localClaimStatus(phone);
      if ((type === 'gb_hemat' && local.gb) || (type !== 'gb_hemat' && local.pahe)) {
        throw new Error(type === 'gb_hemat' ? 'Nomor ini sudah klaim GB Hemat hari ini.' : 'Nomor ini sudah pernah klaim PaHe.');
      }
      const convId = newId();
      await enqueueConversion(
        session,
        {
          id: convId,
          created_at: backfill ? new Date(`${bfDate}T${bfTime}:00+07:00`).toISOString() : new Date().toISOString(),
          phone,
          name: name.trim(),
          type,
          reward,
          extra_draw: false,
          photobooth,
          consent: true,
          consent_ver: CONSENT_VER,
          poi_location: backfill ? bfPoi.trim() : session.poi_location,
          poi_category: backfill ? Object.entries(venueList()).find(([, a]) => a.includes(bfPoi.trim()))?.[0] || session.poi_category : session.poi_category,
          ...(backfill ? { backfill: true, spg_name: bfSpg.trim(), shift: bfShift } : {}),
          ...(merch ? { merch } : {}),
        },
        photo,
      );
      sendBoros();
      if (showBoros && !gbSkip && gb30 !== null) enqueueOp(session, 'gb30', { gb30: { conv: convId, gb30, poi: session.poi_location || '' } });
      void syncQueue();
      try {
        navigator.vibrate?.([60, 40, 60]);
      } catch {
        /* tidak semua perangkat */
      }
      setSaved({ type });
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  // ---------------- Layar sukses ----------------
  if (saved) {
    const canGb = !backfill && saved.type !== 'gb_hemat' && !(lookup?.gb ?? false);
    // Kartu stamp digital: stamp 1 = PaHe hari ini, stamp 2 = GB Hemat hari ini
    const s1 = saved.type !== 'gb_hemat' || Boolean(lookup?.paheToday) || prefill?.type === 'gb_hemat';
    const s2 = saved.type === 'gb_hemat' || Boolean(lookup?.gb);
    const stampDone = !backfill && s1 && s2;
    const secs = Math.round((Date.now() - startedAt.current) / 1000);
    const giveLabel =
      merch
        ? merchLabel(merch)
        : reward === 'candy'
        ? 'Permen 5 pcs'
        : REWARD_LABEL[reward as Reward] || '-';
    const giveSub =
      reward === 'snack'
        ? 'Welcome snack'
        : reward === 'drink'
        ? 'Welcome drink'
        : isTier(reward)
        ? `${REWARD_LABEL[reward as Reward]} · tukar kupon dengan hadiah`
        : reward === 'candy'
        ? 'Kupon candy'
        : '';
    return (
      <div className="relative min-h-[100dvh] bg-canvas flex items-center justify-center p-6 animate-fade-in overflow-hidden">
        <Confetti />
        <div className="relative w-full max-w-md bg-white rounded-[28px] p-6 text-center space-y-4 shadow-xl animate-pop">
          <div className="mx-auto w-16 h-16 rounded-full bg-grab text-white flex items-center justify-center animate-pop">
            <Check className="w-9 h-9" strokeWidth={3} />
          </div>
          <div className="rounded-2xl border-2 border-dashed border-grab bg-grab-tint px-4 py-3 animate-zoom-in" style={{ animationDelay: '120ms' }}>
            <p className="text-[12px] font-bold tracking-[0.12em] text-grab-deep">BERIKAN KE CUSTOMER</p>
            <p className="font-display text-[26px] font-extrabold leading-tight mt-0.5">{giveLabel}</p>
            {giveSub && <p className="text-[13px] text-ink-2 mt-0.5">{giveSub}</p>}
            {photobooth && <p className="text-[13px] font-semibold text-grab-deep mt-1">+ Arahkan ke photobooth</p>}
          </div>
          {!backfill && (
            <div className="animate-zoom-in" style={{ animationDelay: '220ms' }}>
              <StampCardImage data={{ name: name.trim(), last4: phone.slice(-4), day: todayWIB(), unit: session.unit_name, venue: session.poi_location || null, s1, s2 }} />
              <p className={`mt-2 text-[13px] font-semibold ${stampDone ? 'text-grab-deep' : 'text-ink-2'}`}>
                {stampDone ? 'Kartu stamp lengkap! Customer boleh main gacha. Kartu tersimpan otomatis.' : 'Stamp 1 terisi. Lanjut GB Hemat hari ini untuk stamp ke-2.'}
              </p>
            </div>
          )}
          <div>
            <h2 className="font-display text-[22px] font-extrabold">Tersimpan</h2>
            <p className="text-[14px] text-ink-2 mt-1">
              {TYPE_LABEL[saved.type]} · {name.trim()} · ••{phone.slice(-4)} · {secs} detik
            </p>
            <p className="text-[12px] text-ink-3 mt-1">{navigator.onLine ? 'Sedang dikirim ke server.' : 'Tersimpan di tablet, dikirim otomatis saat ada sinyal.'}</p>
          </div>
          {canGb && (
            <button
              onClick={() => onDone({ phone, name: name.trim(), type: 'gb_hemat' })}
              className="w-full min-h-14 py-2 px-4 rounded-2xl bg-modis-yellow text-ink flex items-center justify-center gap-3 active:scale-[0.99]"
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              <span className="text-left leading-tight">
                <span className="block font-bold text-[16px]">Lanjut GB Hemat</span>
                <span className="block text-[12px] text-ink-2">Customer yang sama, nomor & nama terisi</span>
              </span>
            </button>
          )}
          <button onClick={() => onDone(null)} className="w-full h-14 rounded-2xl bg-grab-cta text-white font-bold text-[16px]">
            {backfill ? 'Input susulan berikutnya' : 'Customer berikutnya'}
          </button>
          {backfill && onExit && (
            <button onClick={onExit} className="w-full h-11 text-[15px] font-semibold text-ink-2">
              Selesai, kembali ke beranda
            </button>
          )}
        </div>
      </div>
    );
  }

  if (borosOpen) {
    return (
      <div className="max-w-3xl mx-auto bg-white min-h-[100dvh] flex flex-col animate-fade-in">
        <ResultScreen userName={name.trim()} calcResult={boros} fieldMode ctaLabel="Lanjut input customer" onClaim={() => setBorosOpen(false)} onBack={() => setBorosOpen(false)} />
      </div>
    );
  }

  const sec = 'bg-white rounded-3xl p-4 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_30px_-22px_rgba(0,60,30,0.35)] border border-white';
  const step = (n: number, done: boolean) => (
    <span className={`w-7 h-7 rounded-full text-[13px] font-bold flex items-center justify-center shrink-0 transition ${done ? 'bg-grab text-white shadow-[0_4px_10px_-3px_rgba(0,177,79,0.6)] animate-pop' : 'bg-canvas text-ink-2'}`}>
      {done ? <Check className="w-4 h-4" strokeWidth={3} /> : n}
    </span>
  );

  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-line px-4 h-14 box-content pt-[env(safe-area-inset-top)] flex items-center gap-3">
        <button onClick={() => (backfill && onExit ? onExit() : onDone(null))} aria-label="Kembali" className="w-10 h-10 -ml-2 rounded-full hover:bg-canvas flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 font-display text-[18px] font-bold">{backfill ? 'Input susulan' : 'Customer baru'}</h1>
        <span className="text-[12px] text-ink-3">{session.unit_name} · {shiftInfo(session.shift).name}</span>
      </header>

      <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-4 space-y-3 stagger">
        {backfill && (
          <section className="bg-[#FFF9DB] border-2 border-[#FFE066] rounded-3xl p-4 space-y-3">
            <h2 className="text-[16px] font-bold flex items-center gap-2">
              <History className="w-5 h-5 text-[#E67700]" /> Data susulan
            </h2>
            <p className="text-[13px] text-ink-2 leading-snug">Untuk data dari Google Form / kertas saat app tidak bisa dipakai. Isi sesuai kejadian asli (maks. 3 hari ke belakang).</p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((n) => {
                const d = addDaysKey(todayWIB(), -n);
                return (
                  <button key={n} type="button" onClick={() => setBfDate(d)} aria-pressed={bfDate === d}
                    className={`h-12 rounded-2xl border-2 text-[14px] font-semibold ${bfDate === d ? 'border-grab bg-grab-tint text-grab-deep' : 'border-[#E1E4E8] bg-white'}`}>
                    {n === 0 ? 'Hari ini' : n === 1 ? 'Kemarin' : d.slice(5).split('-').reverse().join('/')}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[13px] font-semibold text-ink-2 mb-1">Jam kejadian</span>
                <input type="time" value={bfTime} onChange={(e) => setBfTime(e.target.value)} className="w-full h-12 px-3 rounded-xl bg-white text-[17px] outline-none border-2 border-[#E1E4E8] focus:border-grab" />
              </label>
              <div>
                <span className="block text-[13px] font-semibold text-ink-2 mb-1">Shift</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {ACTIVE_SHIFTS.map((s) => (
                    <button key={s.id} type="button" onClick={() => setBfShift(s.id)} aria-pressed={bfShift === s.id}
                      className={`h-12 rounded-xl border-2 text-[14px] font-bold ${bfShift === s.id ? 'border-grab bg-grab-tint text-grab-deep' : 'border-[#E1E4E8] bg-white'}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <span className="block text-[13px] font-semibold text-ink-2 mb-1">Nama SPG yang melayani</span>
              {crewNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {crewNames.map((c) => (
                    <button key={c.name} type="button" onClick={() => setBfSpg(c.name)} aria-pressed={bfSpg === c.name}
                      className={`h-10 px-3 rounded-full border-2 text-[14px] font-semibold ${bfSpg === c.name ? 'border-grab bg-grab-tint text-grab-deep' : 'border-[#E1E4E8] bg-white'}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <input value={bfSpg} onChange={(e) => setBfSpg(e.target.value)} maxLength={60} placeholder="Nama SPG" className="w-full h-12 px-3 rounded-xl bg-white text-[16px] outline-none border-2 border-[#E1E4E8] focus:border-grab" />
            </div>
            <label className="block">
              <span className="block text-[13px] font-semibold text-ink-2 mb-1">Venue</span>
              <input list="bf-venues" value={bfPoi} onChange={(e) => setBfPoi(e.target.value)} maxLength={120} placeholder="Ketik nama venue" className="w-full h-12 px-3 rounded-xl bg-white text-[16px] outline-none border-2 border-[#E1E4E8] focus:border-grab" />
              <datalist id="bf-venues">
                {poiOptions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label className="flex items-start gap-3 text-[14px] leading-snug">
              <input type="checkbox" checked={bfNoPhoto} onChange={(e) => setBfNoPhoto(e.target.checked)} className="w-5 h-5 mt-0.5 shrink-0 accent-[#00B14F]" />
              <span>
                Foto bukti sudah ada di Google Form
                <span className="block text-[12px] text-ink-3">Hilangkan centang bila ingin memotret bukti fisik sekarang</span>
              </span>
            </label>
          </section>
        )}

        {/* Consent dulu (spec 2: ditampilkan sebelum input) */}
        <section className={sec}>
          <label className="flex items-start gap-3">
            {step(1, consent)}
            <span className="flex-1">
              <span className="flex items-center gap-1.5 text-[16px] font-bold">
                <ShieldCheck className="w-4 h-4 text-grab" /> Consent
              </span>
              <span className="block text-[13px] text-ink-2 leading-snug mt-1">{CONSENT_TEXT}</span>
              <span className={`mt-3 flex items-center gap-3 rounded-2xl border-2 px-3 h-14 text-[15px] font-semibold transition ${consent ? 'border-grab bg-grab-tint text-grab-deep' : 'border-[#E1E4E8]'}`}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="w-6 h-6 shrink-0 accent-[#00B14F]" />
                Customer setuju (dibacakan / ditunjukkan dulu)
              </span>
            </span>
          </label>
        </section>

        {/* 1-2. Nomor & nama */}
        <section className={sec}>
          <div className="flex items-center gap-2">
            {step(2, Boolean(phone))}
            <h2 className="text-[16px] font-bold flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-grab" /> Nomor HP customer
            </h2>
          </div>
          <input
            inputMode="tel"
            autoFocus={false}
            value={phoneRaw}
            onChange={(e) => setPhoneRaw(e.target.value.replace(/[^0-9+]/g, '').slice(0, 15))}
            placeholder="08xx xxxx xxxx"
            className="w-full h-16 px-4 rounded-2xl bg-canvas text-[24px] font-semibold tracking-wide outline-none border-2 border-transparent focus:border-grab focus:bg-white"
          />
          {phoneRaw && !phone && <p className="text-[13px] text-ink-3">Nomor 10–13 digit, mulai 08.</p>}
          {checking && (
            <p className="text-[13px] text-ink-2 flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" /> Mengecek klaim…
            </p>
          )}
          {lookup && (
            <div className="flex flex-wrap gap-2 text-[13px] font-semibold animate-fade-in">
              <span className={`px-3 py-1.5 rounded-full flex items-center gap-1 ${lookup.pahe ? 'bg-[#FDECEA] text-modis-red' : 'bg-grab-tint text-grab-deep'}`}>
                {lookup.pahe ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                {lookup.pahe ? 'PaHe sudah pernah klaim' : 'PaHe belum pernah klaim'}
              </span>
              <span className={`px-3 py-1.5 rounded-full flex items-center gap-1 ${lookup.gb ? 'bg-[#FDECEA] text-modis-red' : 'bg-grab-tint text-grab-deep'}`}>
                {lookup.gb ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                {lookup.gb ? 'GB Hemat sudah klaim hari ini' : 'GB Hemat hari ini belum'}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-canvas text-ink-3 font-medium">{lookup.source === 'server' ? 'cek server' : 'cek tablet (offline)'}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {step(3, name.trim().length >= 2)}
            <h2 className="text-[16px] font-bold flex items-center gap-1.5">
              <UserRound className="w-4 h-4 text-grab" /> Nama
            </h2>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="off"
            placeholder="Nama customer"
            className="w-full h-14 px-4 rounded-2xl bg-canvas text-[18px] outline-none border-2 border-transparent focus:border-grab focus:bg-white"
          />

        </section>

        {/* Peringkat GrabBike Hemat */}
        {showBoros && (
          <section className={sec}>
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition ${gbReady ? 'bg-grab text-white' : 'bg-modis-yellow text-ink'}`}>
                {gbReady ? <Check className="w-4 h-4" strokeWidth={3} /> : <Bike className="w-4 h-4" />}
              </span>
              <h2 className="text-[16px] font-bold flex-1">Order GrabBike Hemat 30 hari</h2>
            </div>
            <p className="text-[13px] text-ink-2 leading-snug">
              Minta customer buka <b>Riwayat</b> di aplikasi Grab. Hitung order <b>GrabBike Hemat (PaHe)</b> dalam 30 hari terakhir sampai hari ini. GrabBike saja.
            </p>
            <div className={`flex items-center justify-center gap-4 ${gbSkip ? 'opacity-40 pointer-events-none' : ''}`}>
              <button type="button" aria-label="Kurangi" onClick={() => { setGb30((v) => Math.max(0, (v ?? 1) - 1)); setGbOk(false); }} className="w-14 h-14 rounded-2xl bg-canvas text-[28px] font-bold active:scale-95">−</button>
              <div className="w-28 text-center">
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={gb30 ?? ''}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setGb30(d === '' ? null : Number(d));
                    setGbOk(false);
                  }}
                  placeholder="–"
                  aria-label="Jumlah order GrabBike Hemat 30 hari"
                  className="w-full h-16 rounded-2xl border-2 border-[#E1E4E8] bg-white text-center text-[36px] font-extrabold tabular-nums outline-none focus:border-grab"
                />
                <p className="text-[11px] text-ink-3 mt-1">order (ketik angkanya)</p>
              </div>
              <button type="button" aria-label="Tambah" onClick={() => { setGb30((v) => Math.min(99, (v ?? -1) + 1)); setGbOk(false); }} className="w-14 h-14 rounded-2xl bg-grab-cta text-white text-[28px] font-bold active:scale-95">+</button>
            </div>
            {gbHigh && (
              <button type="button" onClick={() => setGbOk(true)} aria-pressed={gbOk}
                className={`w-full min-h-11 px-3 rounded-xl text-[13px] font-semibold text-left ${gbOk ? 'bg-grab-tint text-grab-deep' : 'bg-[#FFF3E0] text-[#8A5300]'}`}>
                {gbOk ? '✓ Angka sudah dicek' : `Angka tinggi (${gb30}). Ketuk jika sudah dicek di Riwayat customer.`}
              </button>
            )}
            <button type="button" onClick={() => { setGbSkip((v) => !v); setGb30(null); setGbOk(false); }} aria-pressed={gbSkip}
              className={`w-full h-11 rounded-xl border text-[14px] font-semibold ${gbSkip ? 'border-grab bg-grab-tint text-grab-deep' : 'border-[#E1E4E8] bg-white text-ink-2'}`}>
              {gbSkip ? '✓ Customer tidak ikut peringkat' : 'Customer tidak ikut peringkat'}
            </button>
          </section>
        )}

        {/* Cek Boros (setelah data visitor) */}
        {showBoros && (
          <section className={sec}>
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition ${borosReady ? 'bg-grab text-white' : 'bg-modis-yellow text-ink'}`}>
                {borosReady ? <Check className="w-4 h-4" strokeWidth={3} /> : <Calculator className="w-4 h-4" />}
              </span>
              <h2 className="text-[16px] font-bold flex-1">Cek Boros</h2>
              <span className="text-[12px] text-ink-3">ketik rides, pilih ongkos</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
              <div>
                <p className="text-[13px] font-semibold text-ink-2 mb-1.5 flex items-center gap-1.5">
                  <Bike className="w-4 h-4" /> Sehari naik GrabBike berapa kali?
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Kurangi" onClick={() => setHabits((h) => ({ ...h, dailyBikeTrips: String(Math.max(0, (Number(h.dailyBikeTrips) || 0) - 1) || '') }))} className="w-12 h-12 rounded-xl bg-canvas text-[22px] font-bold active:scale-95">−</button>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={habits.dailyBikeTrips}
                    onChange={(e) => setHabits((h) => ({ ...h, dailyBikeTrips: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                    placeholder="0"
                    aria-label="Jumlah rides per hari"
                    className="w-20 h-12 rounded-xl border-2 border-[#E1E4E8] bg-white text-center font-display text-[24px] font-extrabold tabular-nums focus:border-grab outline-none"
                  />
                  <button type="button" aria-label="Tambah" onClick={() => setHabits((h) => ({ ...h, dailyBikeTrips: String(Math.min(30, (Number(h.dailyBikeTrips) || 0) + 1)) }))} className="w-12 h-12 rounded-xl bg-grab-tint text-grab-deep text-[22px] font-bold active:scale-95">+</button>
                  <span className="text-[13px] text-ink-3">kali / hari</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-ink-2 mb-1.5 flex items-center gap-1.5">
                <Banknote className="w-4 h-4" /> Rata-rata ongkos sekali jalan?
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {COST_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setHabits((h) => ({ ...h, avgTripCost: o }))}
                    aria-pressed={habits.avgTripCost === o}
                    className={`h-12 rounded-xl border-2 text-[14px] font-semibold transition active:scale-[0.98] ${
                      habits.avgTripCost === o ? 'border-grab bg-grab-tint text-grab-deep' : 'border-[#E1E4E8] bg-white'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
            {borosReady && (
              <div className="rounded-2xl bg-grab-deep text-white p-4 animate-zoom-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-white/80">{name.trim() ? `Skor boros ${name.trim().split(' ')[0]}` : 'Skor boros'}</p>
                    <p className="font-display text-[22px] font-extrabold leading-tight">{boros.borosStatus}</p>
                    <p className="text-[13px] text-white/80 mt-1">
                      Ongkos sebulan {formatIDR(boros.monthlyCostNormal)} · {boros.tripsPerMonth} perjalanan
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] text-white/80">Potensi hemat</p>
                    <p className="font-display text-[22px] font-extrabold text-modis-yellow leading-tight">{formatIDR(boros.monthlySavings)}</p>
                    <p className="text-[11px] text-white/70">−{formatIDR(boros.paheDiscount)} × {boros.eligibleTrips}x · bulan 1 gratis</p>
                    <p className="text-[11px] text-white/70">bulan berikutnya bersih {formatIDR(Math.max(0, boros.netSavingsAfterTrial))}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setBorosOpen(true)} className="mt-3 w-full h-12 rounded-xl bg-white text-grab-deep font-bold text-[15px]">
                  Tunjukkan hasil ke customer
                </button>
              </div>
            )}
          </section>
        )}

        {/* 3. Tipe */}
        <section className={sec}>
          <div className="flex items-center gap-2">
            {step(4, Boolean(type))}
            <h2 className="text-[16px] font-bold">Tipe conversion</h2>
          </div>
          <div className="grid grid-cols-3 gap-2.5 stagger">
            {(['pahe_new', 'pahe_lapsed', 'gb_hemat'] as ConvType[]).map((t) => {
              const no = blocked(t);
              const on = type === t;
              const gb = t === 'gb_hemat';
              const Icon = t === 'pahe_new' ? Sparkles : t === 'pahe_lapsed' ? RotateCcw : Bike;
              const tone = gb
                ? { ring: 'border-modis-orange bg-gradient-to-br from-[#FFF4E6] to-[#FFE3C2] shadow-[0_8px_20px_-10px_rgba(255,128,0,0.7)]', icon: 'bg-modis-orange text-white', idle: 'bg-[#FFF4E6] text-modis-orange' }
                : { ring: 'border-grab bg-gradient-to-br from-grab-tint to-[#CFF3DD] shadow-[0_8px_20px_-10px_rgba(0,177,79,0.7)]', icon: 'bg-grab text-white', idle: 'bg-grab-tint text-grab-deep' };
              return (
                <button
                  key={t}
                  type="button"
                  disabled={no}
                  onClick={() => setType(t)}
                  aria-pressed={on}
                  className={`relative min-h-[112px] rounded-2xl border-2 p-3 text-left transition-all duration-200 active:scale-[0.98] disabled:opacity-40 ${
                    on ? `${tone.ring} -translate-y-0.5` : 'border-[#E1E4E8] bg-white hover:border-[#C9CED4] hover:-translate-y-0.5'
                  }`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${on ? tone.icon : tone.idle}`}>
                    <Icon className="w-[18px] h-[18px]" strokeWidth={2.4} />
                  </span>
                  {on && (
                    <span className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center animate-pop ${tone.icon}`}>
                      <Check className="w-3 h-3" strokeWidth={3.5} />
                    </span>
                  )}
                  <span className="block text-[14px] font-extrabold uppercase tracking-wide leading-tight mt-2">{TYPE_LABEL[t]}</span>
                  <span className="block text-[12px] text-ink-2 mt-1 leading-snug">
                    {no ? (gb ? 'Sudah klaim hari ini' : 'Sudah pernah klaim') : t === 'pahe_new' ? 'Subscribe pertama kali' : t === 'pahe_lapsed' ? 'Pernah berhenti, langganan lagi' : 'Order hari ini, 1x/hari'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Foto bukti */}
        <section className={sec}>
          <div className="flex items-center gap-2">
            {step(5, Boolean(photo) || (backfill && bfNoPhoto))}
            <h2 className="text-[16px] font-bold flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-grab" /> Foto bukti
            </h2>
          </div>
          <p className="text-[13px] text-ink-2 leading-snug">
            {type === 'gb_hemat'
              ? 'Foto layar booking GB Hemat hari ini (on trip atau completed).'
              : 'Foto layar Grab: PaHe aktif hari ini atau renewal hari ini Rp7.000.'}
          </p>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          {photoUrl ? (
            <div className="flex items-center gap-3">
              <img src={photoUrl} alt="Bukti" className="w-24 h-32 object-cover rounded-xl border border-line" />
              <div className="text-[13px] text-ink-2 space-y-2">
                <p className="flex items-center gap-1 text-grab-deep font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Foto siap ({Math.round((photo?.size || 0) / 1024)} KB)
                </p>
                <button type="button" onClick={() => fileRef.current?.click()} className="h-10 px-3 rounded-xl border border-[#D5D8DC] font-semibold flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4" /> Foto ulang
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoBusy}
              className="w-full h-16 rounded-2xl border-2 border-dashed border-grab text-grab-deep font-bold text-[16px] flex items-center justify-center gap-2 bg-grab-tint-2 active:scale-[0.99]"
            >
              {photoBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />} {photoBusy ? 'Memproses foto…' : 'Buka kamera'}
            </button>
          )}
        </section>

        {/* 6. Reward */}
        <section className={sec}>
          <div className="flex items-center gap-2">
            {step(6, Boolean(reward) && (!isTier(reward) || Boolean(merch)))}
            <h2 className="text-[16px] font-bold flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-grab" /> Reward
            </h2>
          </div>
          {!type && <p className="text-[13px] text-ink-3">Pilih tipe dulu.</p>}
          {type && type !== 'gb_hemat' && (
            <div key="welcome" className="space-y-3 animate-tab-swap">
              <div>
                <p className="text-[13px] font-semibold text-ink-2 mb-1.5 flex items-center gap-1.5">
                  <Cookie className="w-4 h-4" /> Welcome snack
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {WELCOME_SNACKS.filter((w) => todaySnacks.includes(w.id)).map((w) => (
                    <ItemChip
                      key={w.id}
                      label={w.label}
                      sub={fullMenu ? 'Hari menu lengkap' : undefined}
                      on={reward === 'snack' && merch === w.id}
                      tag={lowTag(w.id)}
                      onClick={() => pickReward('snack', w.id)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink-2 mb-1.5 flex items-center gap-1.5">
                  <Coffee className="w-4 h-4" /> Welcome drink
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {WELCOME_DRINKS.map((w) => (
                    <ItemChip key={w.id} label={w.label} on={reward === 'drink' && merch === w.id} tag={lowTag(w.id)} onClick={() => pickReward('drink', w.id)} />
                  ))}
                </div>
              </div>
              <label className="fx-tap flex items-start gap-3 text-[14px] pt-1 leading-snug rounded-xl">
                <input type="checkbox" checked={photobooth} onChange={(e) => setPhotobooth(e.target.checked)} className="w-5 h-5 mt-0.5 shrink-0 accent-[#00B14F]" />
                <span>
                  <span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4 text-ink-2" /> Ikut photobooth</span>
                  <span className="block text-[12px] text-ink-3">Minimal 2 orang yang subscribe PaHe</span>
                </span>
              </label>
            </div>
          )}
          {type === 'gb_hemat' && (
            <div key="coupon" className="space-y-3 animate-tab-swap">
              <p className="text-[13px] text-ink-2">Customer main gacha/claw, buka kapsul, lalu pilih kupon yang didapat:</p>
              <div className="grid grid-cols-4 gap-2">
                {COUPONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickReward(c.id)}
                    aria-pressed={reward === c.id}
                    className={`relative h-14 rounded-2xl border-2 font-bold text-[14px] flex items-center justify-center gap-1 ${c.cls} ${reward === c.id ? 'ring-2 ring-grab ring-offset-2' : 'opacity-70'}`}
                  >
                    {reward === c.id && <Check className="w-4 h-4" strokeWidth={3} />}
                    {c.label}
                    {lowTag(c.id) && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md bg-modis-red text-white text-[10px] font-bold whitespace-nowrap">{lowTag(c.id)}</span>
                    )}
                  </button>
                ))}
              </div>
              {isTier(reward) && <MerchPicker tier={reward} value={merch} onChange={setMerch} tag={lowTag} title="Pilih item hadiah" />}
            </div>
          )}
        </section>

        {reward && merch && lowTag(merch) === 'habis' && (
          <p className="text-[13px] text-[#8A5300] bg-[#FFF3E0] rounded-2xl p-3 flex items-start gap-2 animate-fade-in">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" /> Menurut app stok item ini sudah habis. Tetap bisa disimpan bila barangnya masih ada; minta TL cek &amp; refill.
          </p>
        )}
        {error && (
          <p role="alert" className="text-[14px] font-semibold text-modis-red bg-[#FDECEA] rounded-2xl p-3 animate-shake">
            {error}
          </p>
        )}
        <div className="h-20" />
      </div>

      <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={save}
            disabled={Boolean(missing) || saving}
            className="w-full h-14 rounded-2xl bg-grab-cta text-white font-bold text-[17px] disabled:bg-[#C9CDD2] flex items-center justify-center gap-2 transition active:scale-[0.99]"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {saving ? 'Menyimpan…' : missing || 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
};
