import React, { useEffect, useMemo, useState } from 'react';
import { Download, Lock, Search, ShieldCheck } from 'lucide-react';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/supabase';
import { addDays, fmtDay, todayWIB } from './engine';
import { Skeleton } from '../components/Charts';

/**
 * Data visitor lengkap untuk klien Grab (disetujui owner).
 * Dibuka dengan link klien + PIN klien dari tim proyek. PIN hanya diingat selama tab browser terbuka.
 */
type Row = {
  created_at: string;
  claim_day: string;
  unit_id: string;
  shift: string;
  spg_name: string;
  poi_location: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  type: string;
  reward: string;
  merch: string | null;
  prize: string | null;
  photobooth: boolean;
};

const UNITS: Record<string, string> = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk Diskon 1', kiosk2: 'Kiosk Diskon 2' };
const TYPES: Record<string, string> = { pahe_new: 'PaHe New', pahe_lapsed: 'PaHe Churned', gb_hemat: 'GB Hemat' };
const REWARDS: Record<string, string> = { snack: 'Welcome snack', drink: 'Welcome drink', candy: 'Kupon Candy', tier_c: 'Tier C', tier_b: 'Tier B', tier_a: 'Tier A', golden: 'Golden', none: '-' };
const ITEMS: Record<string, string> = {
  w_roti: 'Roti', w_pisang: 'Pisang', w_telur: 'Telur', w_caffino: 'Caffino', w_isoplus: 'Isoplus', w_nobo: 'Nobo Milk',
  c_keychain: 'Acrylic keychain', c_sticker: 'Sticker pack', c_pen: 'Pen branding', b_tote: 'Tote bag', b_pouch: 'Travel pouch', b_lanyard: 'Lanyard',
  a_umbrella: 'Payung lipat', a_tumbler: 'Egg tumbler', a_fan: 'Mini fan USB',
  h_phone: 'Smartphone Samsung', h_gold: 'Emas Antam 0,5 g', h_tws: 'TWS', h_powerbank: 'Powerbank 10.000 mAh', h_watch: 'Smartwatch',
};
const PIN_KEY = 'modis_client_pin';
const fmtPhone = (p: string | null) => (p ? (p.startsWith('62') ? `0${p.slice(2)}` : p) : '-');
const timeWIB = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const itemOf = (r: Row) => [REWARDS[r.reward] || r.reward, r.merch || r.prize ? ITEMS[(r.merch || r.prize)!] || r.merch || r.prize : ''].filter(Boolean).join(' · ');

async function fetchVisitors(key: string, pin: string, from: string, to: string): Promise<Row[]> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/modis_f1_public_visitors`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key, p_pin: pin, p_from: from, p_to: to }),
  });
  if (!resp.ok) {
    const b = await resp.json().catch(() => ({}));
    const m = String(b?.message || '');
    throw new Error(/could not find|does not exist/i.test(m) ? 'Data visitor belum diaktifkan oleh tim proyek.' : m || `Gagal memuat (${resp.status})`);
  }
  return resp.json();
}

export const ClientVisitors: React.FC<{ reportKey: string; campaignStart: string }> = ({ reportKey, campaignStart }) => {
  const today = todayWIB();
  const [pin, setPin] = useState(() => {
    try {
      return sessionStorage.getItem(PIN_KEY) || '';
    } catch {
      return '';
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [range, setRange] = useState<'today' | 'week' | 'all'>('today');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const from = range === 'today' ? today : range === 'week' ? addDays(today, -6) : campaignStart < today ? campaignStart : today;

  const load = async (p: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetchVisitors(reportKey, p, from, today);
      setRows(r);
      setPin(p);
      try {
        sessionStorage.setItem(PIN_KEY, p);
      } catch {
        /* abaikan */
      }
    } catch (e: any) {
      setErr(e?.message || 'Gagal memuat');
      if (/PIN/i.test(e?.message || '')) {
        setPin('');
        try {
          sessionStorage.removeItem(PIN_KEY);
        } catch {
          /* abaikan */
        }
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (pin) load(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const view = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!rows) return [];
    if (!t) return rows;
    return rows.filter((r) => [r.name, r.phone, fmtPhone(r.phone), r.email, r.poi_location, r.spg_name].some((v) => (v || '').toLowerCase().includes(t)));
  }, [rows, q]);

  const download = () => {
    const cols = ['Waktu', 'Tanggal', 'Unit', 'Venue', 'SPG', 'Nama', 'Nomor HP', 'Email', 'Tipe', 'Reward', 'Photobooth'];
    const esc = (v: string) => {
      let s = v ?? '';
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = view.map((r) =>
      [timeWIB(r.created_at), r.claim_day, UNITS[r.unit_id] || r.unit_id, r.poi_location || '', r.spg_name, r.name, fmtPhone(r.phone), r.email || '', TYPES[r.type] || r.type, itemOf(r), r.photobooth ? 'Ya' : '']
        .map((v) => esc(String(v)))
        .join(';'),
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + [cols.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `MODIS_data_visitor_${from}${from !== today ? `_sd_${today}` : ''}.csv`;
    a.click();
  };

  if (!pin || !rows) {
    return (
      <section className="bg-white rounded-2xl p-6 max-w-md mx-auto text-center space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] animate-fade-in">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-grab-tint text-grab-deep flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </span>
        <div>
          <h2 className="font-display text-[19px] font-extrabold">Data visitor</h2>
          <p className="text-[13px] text-ink-2 mt-1">Berisi nama, nomor HP, dan email customer. Masukkan PIN dari tim proyek.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pinInput.length >= 6) load(pinInput);
          }}
          className="space-y-3"
        >
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="PIN 6–8 angka"
            className="w-full h-12 px-4 rounded-xl bg-canvas text-center text-[20px] tracking-[0.4em] outline-none border-2 border-transparent focus:border-grab focus:bg-white"
          />
          {err && <p className="text-[13px] font-semibold text-modis-red">{err}</p>}
          <button type="submit" disabled={busy || pinInput.length < 6} className="w-full h-12 rounded-xl bg-grab-cta text-white font-bold disabled:opacity-50">
            {busy ? 'Memeriksa…' : 'Buka data visitor'}
          </button>
        </form>
        <p className="text-[11px] text-ink-3 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-grab" /> Data pribadi dilindungi UU PDP. Gunakan hanya untuk program Grab MODIS.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <section className="bg-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div>
          <h2 className="font-display text-[18px] font-bold">Data visitor ({view.length.toLocaleString('id-ID')})</h2>
          <p className="text-[13px] text-ink-2">
            {fmtDay(from, { day: 'numeric', month: 'short' })} – {fmtDay(today, { day: 'numeric', month: 'short', year: 'numeric' })} · hanya data terverifikasi
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-canvas rounded-xl p-1">
            {(['today', 'week', 'all'] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`h-9 px-3 rounded-lg text-[13px] font-semibold ${range === r ? 'bg-white shadow-sm' : 'text-ink-2'}`}>
                {r === 'today' ? 'Hari ini' : r === 'week' ? '7 hari' : 'Semua'}
              </button>
            ))}
          </div>
          <button onClick={download} disabled={!view.length} className="h-10 px-3 rounded-xl bg-grab-cta text-white text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50">
            <Download className="w-4 h-4" /> Unduh CSV
          </button>
        </div>
      </section>
      <label className="relative block">
        <Search className="w-5 h-5 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, nomor HP, email, venue" className="w-full h-11 pl-10 pr-3 rounded-xl bg-white text-[14px] outline-none border border-[#E1E4E8] focus:border-grab" />
      </label>
      {busy ? (
        <Skeleton className="h-64" />
      ) : view.length === 0 ? (
        <p className="bg-white rounded-2xl p-8 text-center text-[14px] text-ink-3">Belum ada data visitor di rentang ini.</p>
      ) : (
        <>
          {/* HP: kartu */}
          <ul className="sm:hidden space-y-2">
            {view.slice(0, 300).map((r, i) => (
              <li key={i} className="bg-white rounded-2xl p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-[15px] truncate">{r.name}</span>
                  <span className="text-[11px] text-ink-3 shrink-0">{timeWIB(r.created_at)}</span>
                </div>
                <p className="text-[14px] tabular-nums mt-0.5">
                  <a href={`tel:${fmtPhone(r.phone)}`} className="text-grab-deep font-semibold">{fmtPhone(r.phone)}</a>
                  {r.email && <span className="text-ink-2"> · {r.email}</span>}
                </p>
                <p className="text-[12px] text-ink-2 mt-1">
                  {TYPES[r.type] || r.type} · {itemOf(r)} · {r.poi_location || '-'} · {UNITS[r.unit_id] || r.unit_id}
                </p>
              </li>
            ))}
          </ul>
          {/* Laptop: tabel */}
          <div className="hidden sm:block bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-[13px]">
                <thead className="bg-canvas sticky top-0 text-[11px] uppercase text-ink-2">
                  <tr>
                    {['Waktu', 'Nama', 'Nomor HP', 'Email', 'Tipe', 'Reward', 'Venue', 'Unit · SPG'].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {view.slice(0, 1000).map((r, i) => (
                    <tr key={i} className="hover:bg-canvas/60">
                      <td className="px-3 py-2 whitespace-nowrap text-ink-2 tabular-nums">{timeWIB(r.created_at)}</td>
                      <td className="px-3 py-2 font-semibold">{r.name}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtPhone(r.phone)}</td>
                      <td className="px-3 py-2">{r.email || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{TYPES[r.type] || r.type}</td>
                      <td className="px-3 py-2">{itemOf(r)}{r.photobooth ? ' · photobooth' : ''}</td>
                      <td className="px-3 py-2">{r.poi_location || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-ink-2">{UNITS[r.unit_id] || r.unit_id} · {r.spg_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.length > 1000 && <p className="px-4 py-2 text-[12px] text-ink-3">Menampilkan 1.000 baris terbaru. Unduh CSV untuk data lengkap.</p>}
          </div>
        </>
      )}
      <p className="text-[11px] text-ink-3 flex items-center gap-1">
        <ShieldCheck className="w-3.5 h-3.5 text-grab" /> Data pribadi dilindungi UU PDP. Gunakan hanya untuk program Grab MODIS, jangan diteruskan ke pihak lain.
      </p>
    </div>
  );
};
