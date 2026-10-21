import React, { useEffect, useState } from 'react';
import { Hand } from 'lucide-react';
import { brand } from '../assets/brand';
import { GrabOfficialLogo } from '../components/BrandLogos';
import { PromoCarousel } from '../components/PromoCarousel';

/**
 * Layar iklan saat tablet tidak disentuh: banner promo besar untuk menarik orang mendekat.
 * Hanya banner promo (tanpa Mas Adam). Sentuhan apa pun menutupnya.
 */
export const IdleAttract: React.FC<{ onWake: () => void }> = ({ onWake }) => {
  const [armed, setArmed] = useState(false);
  // Abaikan sentuhan dalam 400 ms pertama supaya tidak langsung tertutup oleh sisa ketukan
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 400);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Sentuh untuk kembali"
      onPointerDown={() => armed && onWake()}
      onKeyDown={() => armed && onWake()}
      className="hero-grab fixed inset-0 z-[90] text-white flex flex-col animate-fade-in overflow-hidden select-none"
    >
      <span className="hero-orb hero-orb-a" aria-hidden="true" />
      <span className="hero-orb hero-orb-b" aria-hidden="true" />
      <img src={brand.skyline} alt="" className="absolute inset-x-0 bottom-0 w-full opacity-20 pointer-events-none" draggable={false} />

      <div className="relative z-10 flex items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <GrabOfficialLogo className="h-7" color="#FFFFFF" />
      </div>
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-5 px-4 py-4 w-full">
        <h2 className="text-center font-display text-[clamp(26px,4.6vw,52px)] font-extrabold leading-[1.05] drop-shadow">
          Ongkos harianmu boros nggak?
          <span className="block text-modis-yellow mt-1">Gratis hadiah buat kamu!</span>
        </h2>
        {/* Banner sebesar mungkin, rasio 2:1 dijaga dan tinggi disesuaikan dengan layar */}
        <div className="w-full mx-auto pointer-events-none" style={{ maxWidth: 'min(100%, calc((100dvh - 22rem) * 2 + 2rem))' }}>
          <PromoCarousel intervalMs={3500} />
        </div>
        <p className="flex items-center gap-2 text-[clamp(15px,2.2vw,20px)] font-bold bg-white text-grab-deep rounded-full px-5 py-3 shadow-[0_12px_26px_-10px_rgba(0,50,25,.55)] animate-pulse-ring">
          <Hand className="w-5 h-5 animate-bounce" /> Sentuh layar untuk mulai
        </p>
      </div>
    </div>
  );
};
