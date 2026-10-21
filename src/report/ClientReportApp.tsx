import React, { useCallback, useEffect, useState } from 'react';
import { ClientLeaderboard } from './ClientLeaderboard';
import { ClientVisitors } from './ClientVisitors';
import { Radio, ShieldCheck } from 'lucide-react';
import { brand } from '../assets/brand';
import { GrabOfficialLogo } from '../components/BrandLogos';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/supabase';
import { ReportData } from './ReportView';
import { FieldClientReport } from './FieldClientReport';
import {
  ReportSettings,
  addDays,
  campaignDayNo,
  fmtDay,
  mergeSettings,
  recentFromPublic,
  slotFromPublic,
  todayWIB,
  visitFromPublic,
} from './engine';

/**
 * Halaman report untuk klien (Grab / Milli).
 * Terbuka langsung dari link (tanpa kata sandi), dengan kunci di alamat: ?k=KUNCI
 * Data diambil dari fungsi modis_public_report: ringkas dan tanpa data pribadi lengkap.
 */
// Link rapi: /grab/KUNCI (juga mendukung format lama /laporan?k=KUNCI)
const KEY =
  new URLSearchParams(window.location.search).get('k') ||
  (window.location.pathname.match(/^\/(?:grab|laporan)\/([A-Za-z0-9]{16,64})\/?$/) || [])[1] ||
  '';

async function loadPublic(from: string, to: string): Promise<ReportData> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/modis_public_report`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: KEY, p_from: from, p_to: to }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body?.message === 'Link laporan tidak valid' ? 'LINK_INVALID' : body?.message || `Gagal memuat (${resp.status})`);
  }
  const j = await resp.json();
  return {
    settings: mergeSettings(j.settings),
    visits: (j.visitors || []).map(visitFromPublic),
    slots: (j.slots || []).map(slotFromPublic),
    recent: (j.recent || []).map(recentFromPublic),
  };
}

export const ClientReportApp: React.FC = () => {
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [invalid, setInvalid] = useState(!KEY);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [tab, setTab] = useState<'field' | 'peringkat' | 'visitor'>('field');

  const load = useCallback(async (from: string, to: string) => {
    try {
      const d = await loadPublic(from, to);
      setSettings(d.settings);
      setLastSync(new Date());
      return d;
    } catch (e: any) {
      if (e?.message === 'LINK_INVALID') setInvalid(true);
      throw e;
    }
  }, []);

  // Pengaturan campaign (tanggal mulai dll.) dimuat sekali untuk tampilan Field App
  useEffect(() => {
    if (!KEY) return;
    const t = todayWIB();
    load(t, t).catch(() => {});
  }, [load]);

  if (invalid) {
    return (
      <div className="min-h-screen bg-grab text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <GrabOfficialLogo className="h-10 mx-auto mb-6" color="#FFFFFF" />
          <h1 className="font-display text-[22px] font-extrabold">Link laporan tidak valid</h1>
          <p className="mt-2 text-white/80 text-[14px]">Pastikan link yang dibuka sama persis dengan yang dikirim tim proyek, atau minta link terbaru.</p>
        </div>
      </div>
    );
  }

  const t = todayWIB();
  const dayNo = settings ? campaignDayNo(settings, t) : 0;
  const end = settings ? addDays(settings.campaign.start, settings.campaign.days - 1) : '';

  return (
    <div className="fx-root min-h-screen bg-canvas text-ink font-sans">
      {/* ===== Banner ===== */}
      <header className="hero-grab relative overflow-hidden text-white">
        <span className="hero-orb hero-orb-a" aria-hidden="true" />
        <span className="hero-orb hero-orb-b" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-10 sm:pt-7 sm:pb-12">
          <img src={brand.masAdam} alt="" draggable={false} className="adam-peek pointer-events-none select-none hidden md:block absolute right-6 lg:right-16 bottom-[-6px] h-[86%] w-auto" />
          <div className="flex items-center justify-between gap-3">
            <GrabOfficialLogo className="h-8" color="#FFFFFF" />
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur text-[12px] font-semibold">
              <span className="relative flex w-2.5 h-2.5">
                <span className="absolute inline-flex w-full h-full rounded-full bg-modis-yellow opacity-75 animate-ping" />
                <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-modis-yellow" />
              </span>
              Live
              {lastSync && ` · ${lastSync.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} WIB`}
            </span>
          </div>
          <div className="mt-6 sm:mt-7">
            <div className="min-w-0">
              <p className="text-modis-yellow text-[13px] font-bold tracking-wide uppercase flex items-center gap-1.5">
                <Radio className="w-4 h-4" /> Report tracking harian
              </p>
              <h1 className="font-display text-[26px] sm:text-[34px] font-extrabold leading-[1.1] tracking-[-0.02em] mt-1">
                {settings?.campaign.name || 'Mobile Activation PAHE (Paket Hemat)'}
              </h1>
              <p className="mt-2 text-white/85 text-[14px]">
                {settings?.campaign.client || 'Grab · Milli'}
                {settings && (
                  <>
                    {' · '}
                    {fmtDay(settings.campaign.start, { day: 'numeric', month: 'short', year: 'numeric' })} – {fmtDay(end, { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {dayNo < 1 ? 'belum mulai' : dayNo > settings.campaign.days ? 'selesai' : `hari ke-${dayNo} dari ${settings.campaign.days}`}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 -mt-5 sm:-mt-7 relative pb-12">
        <div className="mb-4 max-w-full overflow-x-auto no-scrollbar">
        <div className="inline-flex gap-1 bg-white rounded-2xl p-1 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {(
            [
              ['field', 'Conversion & Cek Boros'],
              ['peringkat', 'Peringkat GrabBike'],
              ['visitor', 'Data visitor'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`h-10 px-4 rounded-xl text-[14px] font-semibold whitespace-nowrap ${tab === k ? 'bg-grab-cta text-white' : 'text-ink-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
        </div>
        <div key={tab} className="animate-tab-swap">
          {tab === 'field' ? (
            <FieldClientReport reportKey={KEY} settings={settings} />
          ) : tab === 'peringkat' ? (
            <ClientLeaderboard reportKey={KEY} campaignStart={settings?.campaign.start || todayWIB()} />
          ) : (
            <ClientVisitors reportKey={KEY} campaignStart={settings?.campaign.start || todayWIB()} />
          )}
        </div>
        <footer className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-[12px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-grab" /> Data pribadi hanya di tab Peringkat GrabBike dan Data visitor (dengan PIN). Dilindungi UU PDP.
          </span>
          <span>Diolah otomatis dari aplikasi crew MODIS</span>
        </footer>
      </main>
    </div>
  );
};
