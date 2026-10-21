import React, { useEffect, useState } from 'react';
import { KeyRound, LogIn, Sun, Sunset, UserRound, WifiOff } from 'lucide-react';
import { brand } from '../assets/brand';
import { GrabOfficialLogo } from '../components/BrandLogos';
import { getDeviceId } from '../services/storage';
import { FieldSession, ACTIVE_SHIFTS, shiftText, Shift, UnitInfo, fieldApi, getJadwalCache, shiftFor, teamOf } from './api';
import { getCrewCache, getPlottingCache, nowHHMM, refreshClaimCache, refreshMasters, todayWIB } from './store';
import { planFor } from '../data/plotting';

const FALLBACK_UNITS: UnitInfo[] = [
  { id: 'mobil', name: 'Mobil Diskon', ready: true },
  { id: 'kiosk1', name: 'Kiosk Diskon 1', ready: true },
  { id: 'kiosk2', name: 'Kiosk Diskon 2', ready: true },
];
const LAST_KEY = 'modis_f1_last_login';

/** Login per shift: unit + nama SPG + shift + PIN unit (PIN TL membuka menu Team Leader). */
export const LoginScreen: React.FC<{ onLoggedIn: (s: FieldSession) => void }> = ({ onLoggedIn }) => {
  const last = (() => {
    try {
      return JSON.parse(localStorage.getItem(LAST_KEY) || '{}');
    } catch {
      return {};
    }
  })();
  const [units, setUnits] = useState<UnitInfo[]>(FALLBACK_UNITS);
  const [unit, setUnit] = useState<string>(last.unit || '');
  const [name, setName] = useState('');
  const [shift, setShift] = useState<Shift>(nowHHMM() < '12:00' ? 'AM' : 'PM');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const [crewTick, setCrewTick] = useState(0);
  useEffect(() => {
    refreshMasters()
      .then(() => setCrewTick((t) => t + 1))
      .catch(() => {});
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const crew = React.useMemo(() => getCrewCache().filter((c) => c.unit_id === unit), [unit, crewTick]);
  // Shift mengikuti plotting hari ini untuk unit terpilih
  const plan = React.useMemo(() => (unit ? planFor(getPlottingCache(), todayWIB(), unit) : null), [unit, crewTick]);
  // Jadwal dari office untuk hari ini menentukan shift dan mengunci pilihan; tanpa jadwal, ikut plotting atau jam
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const jad = React.useMemo(() => getJadwalCache(), [crewTick]);
  const team = teamOf(jad, name);
  const scheduled = shiftFor(jad, todayWIB(), name);
  const teamOff = Boolean(team) && !scheduled;
  useEffect(() => {
    if (scheduled) setShift(scheduled);
    else if (plan?.shift) setShift(plan.shift);
  }, [scheduled, plan?.shift]);

  useEffect(() => {
    fieldApi
      .units()
      .then((u) => u?.length && setUnits(u))
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!unit) return setError('Pilih unit.');
    if (name.trim().length < 2) return setError('Isi nama SPG.');
    if (!/^\d{4,8}$/.test(pin)) return setError('PIN 4–8 angka.');
    if (!navigator.onLine) return setError('Login butuh sinyal sekali di awal shift. Setelah masuk, aplikasi tetap jalan tanpa sinyal.');
    setBusy(true);
    try {
      const s = await fieldApi.login(unit, pin, name.trim(), shift, getDeviceId());
      const session: FieldSession = { ...s, started_at: new Date().toISOString() };
      localStorage.setItem(LAST_KEY, JSON.stringify({ unit }));
      await refreshClaimCache(session.token).catch(() => {});
      onLoggedIn(session);
    } catch (err: any) {
      setError(String(err?.message || 'Login gagal').replace(/^.*?: /, ''));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    `min-h-[52px] px-4 rounded-2xl border-2 text-[15px] font-semibold transition active:scale-[0.98] ${
      on ? 'bg-grab-tint border-grab text-grab-deep' : 'bg-white border-[#E1E4E8] text-ink'
    }`;

  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col">
      <div className="hero-grab relative text-white px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-10 overflow-hidden">
        <img src={brand.skyline} alt="" className="absolute inset-x-0 bottom-0 w-full opacity-20" draggable={false} />
        <img src={brand.masAdam} alt="" draggable={false} className="adam-peek pointer-events-none absolute right-3 bottom-[-40px] h-[150px] w-auto select-none" />
        <div className="relative flex items-center justify-between">
          <GrabOfficialLogo className="h-6" color="#FFFFFF" />
          <span className="flex items-center gap-2 text-[12px] font-semibold bg-white/15 rounded-full px-3 py-1">
            Crew
          </span>
        </div>
        <div className="relative mt-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-extrabold leading-tight">Masuk shift</h1>
            <p className="text-[14px] text-white/85 mt-1">Pilih unit, isi nama, lalu PIN unit.</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="relative -mt-5 mx-auto w-full max-w-xl bg-white rounded-t-[28px] sm:rounded-[28px] sm:mb-8 p-5 space-y-5 flex-1 sm:flex-none shadow-sm" noValidate>
        <section>
          <p className="text-[14px] font-bold mb-2">Unit</p>
          <div className="grid grid-cols-3 gap-2">
            {units.map((u) => (
              <button key={u.id} type="button" onClick={() => setUnit(u.id)} aria-pressed={unit === u.id} className={chip(unit === u.id)}>
                {u.name}
              </button>
            ))}
          </div>
        </section>

        <label className="block">
          <span className="flex items-center gap-2 text-[14px] font-bold mb-2">
            <UserRound className="w-4 h-4 text-grab" /> Nama SPG / TL
          </span>
          {crew.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {crew.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setName(c.name)}
                  aria-pressed={name === c.name}
                  className={`h-11 px-4 rounded-full border-2 text-[15px] font-semibold ${name === c.name ? 'bg-grab-tint border-grab text-grab-deep' : 'bg-white border-[#E1E4E8]'}`}
                >
                  {c.name}
                  {c.role === 'tl' && <span className="ml-1.5 text-[11px] font-bold text-ink-3">TL</span>}
                </button>
              ))}
            </div>
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="off"
            placeholder={crew.length ? 'Atau ketik nama (crew pengganti)' : 'Nama panggilan'}
            className="w-full h-14 px-4 rounded-2xl bg-canvas text-[17px] outline-none border-2 border-transparent focus:border-grab focus:bg-white"
          />
        </label>

        <section>
          <p className="text-[14px] font-bold mb-2">
            Shift{scheduled ? <span className="ml-2 text-[12px] font-semibold text-grab-deep">{team ? `Tim ${team}, ` : ''}jadwal hari ini, diatur office</span> : teamOff ? <span className="ml-2 text-[12px] font-semibold text-[#B45309]">Tim {team} libur minggu ini. Pilih shift hanya bila menggantikan.</span> : plan?.shift && <span className="ml-2 text-[12px] font-semibold text-grab-deep">plotting hari ini: {shiftText(plan.shift)}</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ACTIVE_SHIFTS.map((sh) => (
              <button key={sh.id} type="button" disabled={Boolean(scheduled) && sh.id !== scheduled} onClick={() => setShift(sh.id)} aria-pressed={shift === sh.id} className={`${chip(shift === sh.id)} ${scheduled && sh.id !== scheduled ? 'opacity-40' : ''} flex flex-col items-center justify-center gap-0.5 px-1`}>
                {sh.id === 'AM' ? <Sun className="w-5 h-5" /> : sh.id === 'MID' ? <Sun className="w-5 h-5" /> : <Sunset className="w-5 h-5" />}
                <span className="text-[14px] leading-tight">{sh.name}</span>
                <span className="text-[11px] font-medium opacity-75 whitespace-nowrap">{sh.jam}</span>
              </button>
            ))}
          </div>
        </section>

        <label className="block">
          <span className="flex items-center gap-2 text-[14px] font-bold mb-2">
            <KeyRound className="w-4 h-4 text-grab" /> PIN unit
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="••••••"
            className="w-full h-14 px-4 rounded-2xl bg-canvas text-[22px] tracking-[0.4em] outline-none border-2 border-transparent focus:border-grab focus:bg-white"
          />
          <span className="block text-[12px] text-ink-3 mt-1.5">Team Leader memakai PIN TL untuk membuka menu stok dan close day.</span>
        </label>

        {!online && (
          <p className="text-[13px] bg-[#FFF3E0] rounded-xl p-3 flex items-start gap-2">
            <WifiOff className="w-4 h-4 text-modis-orange shrink-0 mt-0.5" /> Tidak ada sinyal. Login butuh sinyal sekali di awal shift.
          </p>
        )}
        {error && (
          <p role="alert" className="text-[14px] font-semibold text-modis-red animate-shake">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="w-full h-14 rounded-2xl bg-grab-cta text-white font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] transition">
          <LogIn className="w-5 h-5" /> {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
};
