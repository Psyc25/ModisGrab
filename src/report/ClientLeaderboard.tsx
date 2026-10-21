import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/supabase';
import type { LbRow } from '../field/api';
import { GbLeaderboard } from '../components/GbLeaderboard';

/** Peringkat GrabBike Hemat untuk klien Grab. Dibuka dengan link klien + PIN klien (sama dengan Data visitor); hanya 4 digit akhir nomor HP. */
const PIN_KEY = 'modis_client_pin';

async function fetchLb(key: string, pin: string, from: string, to: string): Promise<LbRow[]> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/modis_f1_public_leaderboard`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key, p_pin: pin, p_from: from, p_to: to }),
  });
  if (!resp.ok) {
    const b = await resp.json().catch(() => ({}));
    const m = String(b?.message || '');
    throw new Error(/could not find|does not exist/i.test(m) ? 'Peringkat belum diaktifkan oleh tim proyek.' : m || `Gagal memuat (${resp.status})`);
  }
  return resp.json();
}

export const ClientLeaderboard: React.FC<{ reportKey: string; campaignStart: string }> = ({ reportKey, campaignStart }) => {
  const [pin, setPin] = useState(() => {
    try {
      return sessionStorage.getItem(PIN_KEY) || '';
    } catch {
      return '';
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const forget = () => {
    setPin('');
    try {
      sessionStorage.removeItem(PIN_KEY);
    } catch {
      /* abaikan */
    }
  };
  const submit = async (p: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fetchLb(reportKey, p, campaignStart, campaignStart); // cek PIN
      try {
        sessionStorage.setItem(PIN_KEY, p);
      } catch {
        /* abaikan */
      }
      setPin(p);
    } catch (e: any) {
      setErr(e?.message || 'Gagal memuat');
    } finally {
      setBusy(false);
    }
  };

  if (!pin) {
    return (
      <section className="bg-white rounded-2xl p-6 max-w-md mx-auto text-center space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] animate-fade-in">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-grab-tint text-grab-deep flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </span>
        <div>
          <h2 className="font-display text-[19px] font-extrabold">Peringkat GrabBike Hemat</h2>
          <p className="text-[13px] text-ink-2 mt-1">Berisi nama customer. Masukkan PIN dari tim proyek.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pinInput.length >= 6) void submit(pinInput);
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
            {busy ? 'Memeriksa…' : 'Buka peringkat'}
          </button>
        </form>
        <p className="text-[11px] text-ink-3 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-grab" /> Data pribadi dilindungi UU PDP. Gunakan hanya untuk program Grab MODIS.
        </p>
      </section>
    );
  }

  return (
    <GbLeaderboard
      campaignStart={campaignStart}
      load={async (f, t) => {
        try {
          return await fetchLb(reportKey, pin, f, t);
        } catch (e: any) {
          if (/PIN/i.test(e?.message || '')) forget();
          throw e;
        }
      }}
    />
  );
};
