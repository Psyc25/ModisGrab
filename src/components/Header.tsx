import React from 'react';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { IS_STAFF_MODE } from '../config/mode';
import { GrabOfficialLogo } from './BrandLogos';

interface HeaderProps {
  currentStep: number; // 0: Home, 1: Data Diri, 2: Kebiasaan, 3: Hasil, 4: Promo
  title?: string;
  stepIndicator?: string;
  onBack?: () => void;
  onOpenAdmin?: () => void;
  /** Header transparan di atas latar hijau (layar hasil). */
  tone?: 'light' | 'green';
  /** Jumlah langkah pada garis progres (default 3). */
  totalSteps?: number;
  /** Tampilkan indikator koneksi (default ya). Field App punya indikator sendiri. */
  showConnection?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ currentStep, title, stepIndicator, onBack, onOpenAdmin, tone = 'light', totalSteps = 3, showConnection = true }) => {
  if (currentStep === 0) return null;

  const green = tone === 'green';
  const progress = currentStep >= 1 && currentStep <= totalSteps ? currentStep : 0;

  return (
    <div className={`sticky top-0 z-30 select-none safe-top ${green ? 'bg-grab-deep text-white' : 'bg-white text-ink shadow-[0_1px_0_#EBEBEB]'}`}>
      <div className="h-14 flex items-center gap-1 px-2 sm:px-4">
        <button
          onClick={onBack}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${green ? 'hover:bg-white/10' : 'hover:bg-canvas'}`}
          aria-label="Kembali"
        >
          <ArrowLeft className="w-6 h-6" strokeWidth={2.25} />
        </button>
        <h1 className="flex-1 min-w-0 truncate font-display text-[18px] font-bold tracking-[-0.01em]">{title}</h1>

        {IS_STAFF_MODE && showConnection && <ConnectionStatusIndicator />}
        {green && <GrabOfficialLogo className="h-5 sm:h-6 mx-2 shrink-0" color="#FFFFFF" />}
        {!green && stepIndicator && (
          <span className={`text-[13px] font-medium pr-2 ${green ? 'text-white/75' : 'text-ink-3'}`}>{stepIndicator}</span>
        )}
        {onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            aria-label="Menu petugas"
            title="Menu petugas"
            className={`w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90 ${green ? 'text-white/85 hover:bg-white/10' : 'text-ink-2 hover:bg-canvas'}`}
          >
            <LayoutGrid className="w-[19px] h-[19px]" />
          </button>
        )}
      </div>

      {progress > 0 && (
        <div className="flex gap-1 px-4 pb-2" aria-hidden="true">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
            <div
              key={s}
              className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${
                s <= progress ? (green ? 'bg-modis-yellow' : 'bg-grab') : green ? 'bg-white/20' : 'bg-line'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
