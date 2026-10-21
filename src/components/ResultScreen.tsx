import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Header } from './Header';
import { PromoCarousel } from './PromoCarousel';
import { CalculationResult } from '../types';
import { formatIDR } from '../services/storage';
import { ESTIMATE_DISCLAIMER, PAHE_MAX_TRIPS, PAHE_PRICE_THRESHOLD } from '../config/campaign';
import { brand } from '../assets/brand';
import { BottomBar, PrimaryButton } from './ui';

interface ResultScreenProps {
  userName: string;
  calcResult: CalculationResult;
  onClaim: () => void;
  onBack: () => void;
  onOpenAdmin?: () => void;
  /** Dipakai di Field App: alur 2 langkah, CTA lanjut input customer. */
  fieldMode?: boolean;
  onHome?: () => void;
  /** Teks tombol utama (opsional). */
  ctaLabel?: string;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  userName,
  calcResult,
  onClaim,
  onBack,
  onOpenAdmin,
  fieldMode,
  onHome,
  ctaLabel,
}) => {
  const firstName = userName ? userName.split(' ')[0] : '';
  // Angka hemat naik perlahan supaya hasil terasa hidup
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const target = calcResult.monthlySavings;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setShown(target);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [calcResult.monthlySavings]);

  const statusStyle: Record<string, string> = {
    'Sangat Boros': 'bg-modis-red text-white',
    Boros: 'bg-modis-orange text-white',
    'Lumayan Boros': 'bg-modis-yellow text-ink',
  };
  const badgeCls = statusStyle[calcResult.borosStatus] ?? 'bg-white text-grab-deep';

  return (
    <div className="flex flex-col flex-[1_0_auto] bg-canvas text-ink w-full relative">
      <Header
        currentStep={fieldMode ? 2 : 3}
        totalSteps={fieldMode ? 2 : 3}
        showConnection={!fieldMode}
        title="Hasil Cek Boros"
        stepIndicator={ctaLabel ? undefined : fieldMode ? '2 dari 2' : '3 dari 3'}
        onBack={onBack}
        onOpenAdmin={onOpenAdmin}
        tone="green"
      />

      <div className="flex-1 flex flex-col">
        <div className="bg-canvas">
          {/* Ringkasan di atas latar hijau tua Grab polos */}
          <div className="relative bg-grab-deep text-white px-4 sm:px-6 pt-4 pb-16 overflow-hidden">
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] text-white/80">{firstName ? `Skor boros ${firstName}` : 'Skor boros kamu'}</p>
                <span className={`inline-block mt-1.5 px-3 py-1 rounded-full text-[13px] font-bold animate-pop ${badgeCls}`}>{calcResult.borosStatus}</span>
                <p className="mt-4 text-[14px] text-white/80">Perkiraan ongkos GrabBike sebulan</p>
                <p className="font-display text-[34px] sm:text-[40px] font-extrabold tracking-[-0.02em] leading-tight">
                  {formatIDR(calcResult.monthlyCostNormal)}
                </p>
              </div>
              <img src={brand.mastheadMurahNonstop} alt="Amankan murah non-stop tiap harimu" className="w-28 sm:w-36 h-auto shrink-0 -mr-1 animate-float drop-shadow-[0_6px_10px_rgba(0,40,20,.45)]" draggable={false} />
            </div>
          </div>

          {/* Rincian bergaya struk checkout Grab */}
          <div className="relative -mt-10 mx-4 sm:mx-6 bg-white rounded-2xl animate-rise shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-[16px] font-bold">Rincian per bulan</h3>
            </div>
            <dl className="px-4 text-[15px]">
              <div className="flex justify-between py-2">
                <dt className="text-ink-2">Perjalanan GrabBike</dt>
                <dd className="font-medium">{calcResult.tripsPerMonth} kali</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-ink-2">Ongkos biasa / perjalanan</dt>
                <dd className="font-medium">{formatIDR(calcResult.costPerTripNormal)}</dd>
              </div>
              <div className="flex justify-between items-center py-2">
                <dt className="flex items-center gap-2 text-ink-2">
                  <img src={brand.paheLogo} alt="PAHE" className="h-6 w-auto" draggable={false} />
                  <span>
                    Potongan PAHE / perjalanan
                    <span className="block text-[12px] text-ink-3">{calcResult.costPerTripNormal <= PAHE_PRICE_THRESHOLD ? 'ongkos s.d. Rp9.000' : 'ongkos di atas Rp9.000'}</span>
                  </span>
                </dt>
                <dd className="font-semibold text-grab-cta whitespace-nowrap">− {formatIDR(calcResult.paheDiscount)}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-ink-2">Perjalanan dapat potongan</dt>
                <dd className="font-medium text-right">
                  {calcResult.eligibleTrips} kali
                  {calcResult.tripsPerMonth > calcResult.eligibleTrips && <span className="block text-[12px] text-ink-3 font-normal">maks. {PAHE_MAX_TRIPS}x per bulan</span>}
                </dd>
              </div>
            </dl>
            <div className="mx-4 my-2 border-t border-dashed border-[#D5D8DC]" />
            <div className="px-4 pb-4 pt-1 flex justify-between items-end">
              <span className="text-[15px] font-bold">Potensi hemat</span>
              <span className="font-display text-[26px] font-extrabold text-grab-cta tracking-[-0.02em] leading-none">
                {formatIDR(shown)}
              </span>
            </div>
            <dl className="px-4 pb-3 text-[14px] space-y-1">
              <div className="flex justify-between">
                <dt className="text-ink-2">Biaya langganan PAHE</dt>
                <dd className="font-medium text-right">
                  Gratis bulan pertama
                  <span className="block text-[12px] text-ink-3 font-normal">lalu {formatIDR(calcResult.subscriptionFee)}/bulan</span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">Hemat bersih bulan berikutnya</dt>
                <dd className="font-semibold">{formatIDR(Math.max(0, calcResult.netSavingsAfterTrial))}</dd>
              </div>
            </dl>
            <div className="bg-grab-tint-2 px-4 py-2.5 text-[12px] text-ink-2 leading-snug">{ESTIMATE_DISCLAIMER}</div>
          </div>
        </div>

        <div className="pt-5 pb-6 space-y-3">
          <h3 className="px-4 sm:px-6 font-display text-[19px] font-bold tracking-[-0.01em]">Biar makin hemat</h3>
          <PromoCarousel />
          <div className="mx-4 sm:mx-6 bg-white rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-grab shrink-0 mt-0.5" />
            <p className="text-[14px] leading-snug text-ink-2">
              <strong className="text-ink">PAHE bukan GrabUnlimited.</strong> PAHE sudah bikin perjalanan rutin harianmu lebih murah, tanpa
              harus langganan GrabUnlimited.
            </p>
          </div>
        </div>

        <BottomBar>
          <PrimaryButton onClick={onClaim}>{ctaLabel || (fieldMode ? 'Customer tertarik, lanjut input' : 'Selesai, arahkan scan QR PaHe')}</PrimaryButton>
          {fieldMode && onHome && (
            <button type="button" onClick={onHome} className="w-full h-11 mt-1 text-[15px] font-semibold text-ink-2">
              Kembali ke beranda
            </button>
          )}
        </BottomBar>
      </div>
    </div>
  );
};
