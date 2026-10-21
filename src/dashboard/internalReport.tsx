import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Eraser, KeyRound, Save } from 'lucide-react';
import { getSupabaseClient } from '../services/supabase';
import { VisitorRecord } from '../types';
import { fetchSettingsRemote, fetchSlotReportsRange, fetchVisitorsRange, purgeTestDataRemote, saveSettingRemote } from '../services/supabase';
import { ReportData } from '../report/ReportView';
import { fieldAsLegacy } from './legacyFeed';
import { ReportSettings, VisitRow, addDays, dayOfWIB, mergeSettings, slotFromDb, slotOf } from '../report/engine';

/** Alamat halaman report klien (project Vercel terpisah). */
export const CLIENT_REPORT_URL: string = (import.meta as any).env?.VITE_CLIENT_REPORT_URL || `${window.location.origin}/laporan`;

let settingsCache: { at: number; raw: Record<string, any> } | null = null;

async function getSettingsRaw(force = false) {
  if (!force && settingsCache && Date.now() - settingsCache.at < 60000) return settingsCache.raw;
  const raw = await fetchSettingsRemote();
  settingsCache = { at: Date.now(), raw };
  return raw;
}

const visitFromRecord = (r: VisitorRecord): VisitRow => ({
  ts: r.created_at,
  day: dayOfWIB(r.created_at),
  loc: r.poiLocation || '',
  cat: r.poiCategory || '',
  unit: r.unitType || '',
  hours: r.dutyHours || '',
  slot: slotOf(r.dutyHours || ''),
  status: r.borosStatus || '',
  savings: r.monthlySavings || 0,
  stamps: r.stampsCount || 0,
  reward: r.rewardClaimed || '',
  uid: r.phoneNumber || r.id,
  spg: r.spgName || '',
});

/** Pemuat data laporan untuk dashboard internal (akun owner/klien, data lengkap). */
export async function internalLoad(from: string, to: string): Promise<ReportData> {
  const [raw, vis, slots] = await Promise.all([
    getSettingsRaw(),
    fetchVisitorsRange(`${from}T00:00:00+07:00`, `${addDays(to, 1)}T00:00:00+07:00`),
    fetchSlotReportsRange(from, to),
  ]);
  if (!vis.success) throw new Error(vis.error || 'Gagal memuat data visitor.');
  // Data lapangan (aplikasi crew) digabung ke laporan lama; bila gagal dimuat, laporan lama tetap tampil.
  const live = await fieldAsLegacy(from, to).catch(() => ({ visits: [], slots: [] }));
  return {
    settings: mergeSettings(raw),
    visits: [...(vis.data || []).map(visitFromRecord), ...live.visits],
    slots: [...slots.map(slotFromDb), ...live.slots],
  };
}

// ---------------------------------------------------------------------
// Pengaturan campaign & link klien (owner)
// ---------------------------------------------------------------------
const box = 'bg-white rounded-2xl p-4 space-y-3';
const inp = 'h-11 px-3 rounded-xl border border-[#D5D8DC] bg-white text-[14px] outline-none focus:border-grab w-full';

export const SettingsPanel: React.FC = () => {
  const [raw, setRaw] = useState<Record<string, any> | null>(null);
  const [s, setS] = useState<ReportSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getSettingsRaw(true)
      .then((r) => {
        setRaw(r);
        setS(mergeSettings(r));
      })
      .catch((e) => setMsg(e.message));
  }, []);

  if (!s || !raw) return <div className={box}>{msg || 'Memuat pengaturan…'}</div>;

  const key = typeof raw.report_key === 'string' ? raw.report_key : '';
  // Link rapi untuk klien: domain/grab/KUNCI
  const link = key ? `${window.location.origin}/grab/${key}` : '';
  const end = addDays(s.campaign.start, s.campaign.days - 1);

  const setNum = (group: 'targets' | 'merch_stock', k: string, v: string) =>
    setS({ ...s, [group]: { ...(s as any)[group], [k]: Math.max(0, Number(v) || 0) } } as ReportSettings);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const ok = (
      await Promise.all([
        saveSettingRemote('campaign', s.campaign),
        saveSettingRemote('targets', s.targets),
        saveSettingRemote('merch_stock', s.merch_stock),
        saveSettingRemote('live_sheet_url', s.live_sheet_url.trim()),
      ])
    ).every(Boolean);
    setBusy(false);
    settingsCache = null;
    setMsg(ok ? 'Pengaturan tersimpan. Laporan internal & klien memakai angka baru.' : 'Gagal menyimpan pengaturan.');
  };

  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <label className="block">
      <span className="block text-[13px] font-semibold mb-1">{label}</span>
      {el}
      {hint && <span className="block text-[11px] text-ink-3 mt-1">{hint}</span>}
    </label>
  );

  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="font-display text-[17px] font-bold">Link report klien</h2>
        <p className="text-[13px] text-ink-2">
          Kirim link ini ke klien Grab. Laporan conversion terbuka langsung tanpa kata sandi. Tab "Data visitor" (nama, nomor HP, email lengkap) butuh PIN klien di bawah.
        </p>
        {link ? (
          <div className="flex flex-wrap gap-2">
            <input readOnly value={link} className={`${inp} flex-1 min-w-[240px] font-mono text-[13px]`} onFocus={(e) => e.target.select()} />
            <button
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="h-11 px-4 rounded-xl bg-grab-cta text-white text-[14px] font-semibold flex items-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Tersalin' : 'Salin link'}
            </button>
            <a href={link} target="_blank" rel="noopener noreferrer" className="h-11 px-4 rounded-xl border border-[#D5D8DC] text-[14px] font-semibold flex items-center gap-1.5">
              <ExternalLink className="w-4 h-4" /> Buka
            </a>
          </div>
        ) : (
          <p className="text-[13px] text-modis-red">Kunci link belum ada di database.</p>
        )}
        <p className="text-[12px] text-ink-3">Siapa pun yang memegang link ini bisa membuka laporan angka. Bila link tersebar ke pihak lain, minta tim teknis mengganti kuncinya.</p>
      </section>

      <ClientPinCard />

      <section className={box}>
        <h2 className="font-display text-[17px] font-bold">Periode campaign</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {field('Mulai running (hari ke-1)', <input type="date" className={inp} value={s.campaign.start} onChange={(e) => e.target.value && setS({ ...s, campaign: { ...s.campaign, start: e.target.value } })} />)}
          {field('Durasi (hari)', <input type="number" className={inp} value={s.campaign.days} onChange={(e) => setS({ ...s, campaign: { ...s.campaign, days: Math.max(1, Number(e.target.value) || 1) } })} />, `Selesai ${end}`)}
          {field('Klien / pelaksana', <input className={inp} value={s.campaign.client} onChange={(e) => setS({ ...s, campaign: { ...s.campaign, client: e.target.value } })} />)}
        </div>
        {field('Nama campaign', <input className={inp} value={s.campaign.name} onChange={(e) => setS({ ...s, campaign: { ...s.campaign, name: e.target.value } })} />)}
      </section>

      <section className={box}>
        <h2 className="font-display text-[17px] font-bold">Target KPI</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {field('Target total Reach', <input type="number" className={inp} value={s.targets.reach} onChange={(e) => setNum('targets', 'reach', e.target.value)} />)}
          {field('Target total Contact', <input type="number" className={inp} value={s.targets.contact} onChange={(e) => setNum('targets', 'contact', e.target.value)} />)}
          {field('Target total Conversion', <input type="number" className={inp} value={s.targets.conversion} onChange={(e) => setNum('targets', 'conversion', e.target.value)} />)}
          {field('Reach / SPG / hari', <input type="number" className={inp} value={s.targets.reach_per_spg} onChange={(e) => setNum('targets', 'reach_per_spg', e.target.value)} />)}
          {field('Contact / SPG / hari', <input type="number" className={inp} value={s.targets.contact_per_spg} onChange={(e) => setNum('targets', 'contact_per_spg', e.target.value)} />)}
          {field('Conversion / SPG / hari', <input type="number" className={inp} value={s.targets.conversion_per_spg} onChange={(e) => setNum('targets', 'conversion_per_spg', e.target.value)} />)}
          {field('SPG per unit', <input type="number" className={inp} value={s.targets.spg_per_unit} onChange={(e) => setNum('targets', 'spg_per_unit', e.target.value)} />)}
          {field('Jumlah unit', <input type="number" className={inp} value={s.targets.units} onChange={(e) => setNum('targets', 'units', e.target.value)} />, 'Mobil Diskon + Kiosk 1 + Kiosk 2 = 3')}
        </div>
        <p className="text-[12px] text-ink-3">Target harian = SPG per unit × jumlah unit × basis per SPG. Target periode = target harian × jumlah hari campaign di periode itu.</p>
      </section>

      <section className={box}>
        <h2 className="font-display text-[17px] font-bold">Stok awal merchandise</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {field('Merch Tier A', <input type="number" className={inp} value={s.merch_stock.a} onChange={(e) => setNum('merch_stock', 'a', e.target.value)} />)}
          {field('Merch Tier B', <input type="number" className={inp} value={s.merch_stock.b} onChange={(e) => setNum('merch_stock', 'b', e.target.value)} />)}
          {field('Merch Tier C', <input type="number" className={inp} value={s.merch_stock.c} onChange={(e) => setNum('merch_stock', 'c', e.target.value)} />)}
          {field('Minuman', <input type="number" className={inp} value={s.merch_stock.drinks} onChange={(e) => setNum('merch_stock', 'drinks', e.target.value)} />)}
        </div>
      </section>

      <section className={box}>
        <h2 className="font-display text-[17px] font-bold">Excel live untuk klien (opsional)</h2>
        {field(
          'Link Google Sheet',
          <input className={inp} placeholder="https://docs.google.com/spreadsheets/d/…" value={s.live_sheet_url} onChange={(e) => setS({ ...s, live_sheet_url: e.target.value })} />,
          'Bila diisi, halaman klien menampilkan tombol "Excel live". Gunakan spreadsheet laporan klien (tanpa data pribadi).'
        )}
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="h-12 px-6 rounded-xl bg-grab-cta text-white font-bold text-[15px] flex items-center gap-2 disabled:opacity-60">
          <Save className="w-4 h-4" /> {busy ? 'Menyimpan…' : 'Simpan pengaturan'}
        </button>
        {msg && <span className="text-[13px] text-ink-2">{msg}</span>}
      </div>

      <PurgeSection />
    </div>
  );
};

/** Bersihkan data uji sebelum campaign berjalan (khusus owner). */
const PurgeSection: React.FC = () => {
  const [qc, setQc] = useState(true);
  const [useBefore, setUseBefore] = useState(false);
  const [before, setBefore] = useState('2026-10-26');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ready = confirm.trim().toUpperCase() === 'HAPUS' && (qc || (useBefore && before));

  const run = async () => {
    setBusy(true);
    setMsg(null);
    const res = await purgeTestDataRemote(qc, useBefore ? before : null);
    setBusy(false);
    setConfirm('');
    if (!res.ok) return setMsg(`Gagal: ${res.error}`);
    const r = res.result!;
    setMsg(`Terhapus: ${(r as any).conversions ?? 0} conversion, ${r.visitors} visitor lama, ${r.slot_reports} laporan slot, ${r.positions} titik lokasi.`);
  };

  return (
    <section className={`${box} border border-[#F5C2BE]`}>
      <h2 className="font-display text-[17px] font-bold flex items-center gap-2 text-modis-red">
        <Eraser className="w-5 h-5" /> Bersihkan data uji
      </h2>
      <p className="text-[13px] text-ink-2">Pakai sebelum hari pertama running supaya laporan klien hanya berisi data asli. Data yang terhapus tidak bisa dikembalikan.</p>
      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" checked={qc} onChange={(e) => setQc(e.target.checked)} className="accent-[#00B14F] w-4 h-4" />
        Data uji: nama customer / SPG berawalan [QC] (conversion, stok, close day, visitor lama)
      </label>
      <label className="flex flex-wrap items-center gap-2 text-[14px]">
        <input type="checkbox" checked={useBefore} onChange={(e) => setUseBefore(e.target.checked)} className="accent-[#00B14F] w-4 h-4" />
        Semua data (visitor, laporan slot, lokasi) sebelum tanggal
        <input type="date" value={before} disabled={!useBefore} onChange={(e) => setBefore(e.target.value)} className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px] disabled:opacity-50" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder='Ketik "HAPUS" untuk konfirmasi' className={`${inp} max-w-[260px]`} />
        <button onClick={run} disabled={!ready || busy} className="h-11 px-4 rounded-xl bg-modis-red text-white font-semibold text-[14px] disabled:opacity-40">
          {busy ? 'Menghapus…' : 'Hapus data'}
        </button>
      </div>
      {msg && <p role="status" className="text-[13px] font-medium">{msg}</p>}
    </section>
  );
};


/** PIN klien untuk membuka tab Data visitor di link Grab. Disimpan sebagai hash, tidak bisa dilihat ulang. */
const ClientPinCard: React.FC = () => {
  const [pin, setPin] = useState('');
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    getSupabaseClient()
      ?.rpc('modis_f1_client_pin_set')
      .then(({ data, error }) => setIsSet(error ? null : Boolean(data)));
  }, []);
  const save = async () => {
    setMsg(null);
    const { error } = (await getSupabaseClient()?.rpc('modis_f1_set_client_pin', { p_pin: pin })) || { error: { message: 'Supabase belum siap' } };
    if (error) return setMsg(`Gagal: ${error.message}`);
    setIsSet(true);
    setPin('');
    setMsg('PIN klien tersimpan. Kirim PIN ini ke Grab lewat jalur terpisah dari link (misalnya telepon / chat pribadi).');
  };
  return (
    <section className={box}>
      <h2 className="font-display text-[17px] font-bold flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-grab" /> PIN data visitor untuk klien
      </h2>
      <p className="text-[13px] text-ink-2">
        Status: {isSet === null ? 'fitur belum aktif di database' : isSet ? 'PIN sudah diatur' : 'belum diatur (tab Data visitor terkunci)'}. Ganti PIN kapan saja; PIN lama langsung tidak berlaku.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="PIN baru 6–8 angka"
          className={`${inp} max-w-[220px] tracking-[0.2em]`}
        />
        <button onClick={save} disabled={pin.length < 6} className="h-11 px-4 rounded-xl bg-grab-cta text-white text-[14px] font-semibold flex items-center gap-1.5 disabled:opacity-40">
          <Save className="w-4 h-4" /> Simpan PIN
        </button>
      </div>
      {msg && <p className="text-[13px]">{msg}</p>}
    </section>
  );
};
