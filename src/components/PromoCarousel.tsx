import React, { useCallback, useEffect, useRef, useState } from 'react';
import { brand } from '../assets/brand';

/**
 * Banner promo yang bergeser otomatis, seperti carousel promo di aplikasi Grab.
 * - Geser sendiri tiap beberapa detik, kembali ke awal setelah slide terakhir.
 * - Berhenti sementara saat disentuh / di-hover / difokus, lalu lanjut lagi.
 * - Tidak bergerak otomatis bila perangkat meminta "kurangi animasi".
 * Semua gambar berasal dari deck proposal MODIS.
 */

type Slide = { key: string; label: string; render: () => React.ReactNode };

const ImageSlide: React.FC<{ src: string; alt: string }> = ({ src, alt }) => (
  <img src={src} alt={alt} draggable={false} className="w-full h-full object-cover" />
);

/** Banner dengan rasio berbeda (16:9): tampil utuh tanpa terpotong, sisi kiri-kanan diisi versi blur gambar yang sama. */
const FitSlide: React.FC<{ src: string; alt: string }> = ({ src, alt }) => (
  <div className="relative w-full h-full bg-[#0E7046] overflow-hidden">
    <img src={src} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-80" />
    <img src={src} alt={alt} draggable={false} className="relative w-full h-full object-contain" />
  </div>
);

export const PROMO_SLIDES: Slide[] = [
  {
    key: 'murah-nonstop',
    label: 'GrabBike Hemat: amankan murah non-stop tiap harimu, Rp7 ribuan dengan PAHE',
    render: () => <FitSlide src={brand.bannerGrabBikeMurahNonstop} alt="GrabBike Hemat: amankan murah non-stop tiap harimu, dari Rp9 ribu jadi Rp7 ribuan. Yuk langganan PAHE Paket Hemat" />,
  },
  {
    key: 'grabcar-standard',
    label: 'GrabCar Standard kini dengan standar baru: mobil baru, AC dingin, harga mulai Rp17 ribu',
    render: () => <FitSlide src={brand.bannerGrabCarStandard} alt="GrabCar Standard kini dengan standar baru: mobil baru, AC dingin, harga terjangkau, mulai Rp17 ribu" />,
  },
  {
    key: 'grabfood-mantap',
    label: 'GrabFood Diskon Puas Mantap: stok diskon sampai 55 persen nggak abis-abis',
    render: () => <FitSlide src={brand.bannerGrabFoodMantap} alt="GrabFood Diskon Puas Mantap: selalu ada, stok diskon sampai 55 persen nggak abis-abis" />,
  },
];

/**
 * Carousel berbasis transform (bukan scroll) supaya selalu bergeser otomatis di semua perangkat,
 * termasuk tablet yang mengaktifkan "kurangi animasi". Efek: geser halus, zoom pelan (Ken Burns),
 * kilau, dan indikator progres. Bisa digeser dengan jari/mouse.
 */
export const PromoCarousel: React.FC<{
  slides?: Slide[];
  intervalMs?: number;
  className?: string;
}> = ({ slides = PROMO_SLIDES, intervalMs = 4000, className = '' }) => {
  const n = slides.length;
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState<{ x: number; dx: number; w: number } | null>(null);
  const [cycle, setCycle] = useState(0); // memulai ulang animasi progres
  const wrapRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (i: number) => {
      setActive(((i % n) + n) % n);
      setCycle((c) => c + 1);
    },
    [n]
  );

  useEffect(() => {
    if (n < 2 || hover || drag) return;
    const t = window.setTimeout(() => {
      if (!document.hidden) go(active + 1);
      else setCycle((c) => c + 1);
    }, intervalMs);
    return () => window.clearTimeout(t);
  }, [active, cycle, hover, drag, n, intervalMs, go]);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ x: e.clientX, dx: 0, w: wrapRef.current?.clientWidth || 1 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, dx: e.clientX - drag.x });
  };
  const onUp = () => {
    if (!drag) return;
    const th = drag.w * 0.18;
    if (drag.dx < -th) go(active + 1);
    else if (drag.dx > th) go(active - 1);
    else setCycle((c) => c + 1);
    setDrag(null);
  };

  const offsetPct = drag ? (drag.dx / drag.w) * 100 : 0;

  return (
    <div
      className={`select-none ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label="Promo Grab"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <div ref={wrapRef} className="mx-4 sm:mx-6 overflow-hidden rounded-2xl">
        <div
          className="flex touch-pan-y cursor-grab active:cursor-grabbing"
          style={{
            gap: 12,
            transform: `translateX(calc(${-active * 100 + offsetPct}% - ${active * 12}px))`,
            transition: drag ? 'none' : 'transform 650ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {slides.map((s, i) => {
            const on = i === active;
            return (
              <div
                key={s.key}
                role="group"
                aria-roledescription="slide"
                aria-hidden={!on}
                aria-label={`${i + 1} dari ${n}: ${s.label}`}
                className="relative shrink-0 w-full aspect-[2/1] rounded-2xl overflow-hidden shadow-[0_6px_20px_-8px_rgba(0,82,59,0.45)]"
                style={{
                  transform: on ? 'scale(1)' : 'scale(0.94)',
                  opacity: on ? 1 : 0.55,
                  transition: 'transform 650ms cubic-bezier(0.22,1,0.36,1), opacity 650ms ease',
                }}
              >
                <div className={`absolute inset-0 ${on && n > 1 ? 'animate-kenburns' : ''}`} style={{ transformOrigin: i % 2 ? 'left center' : 'right center' }}>
                  {s.render()}
                </div>
                {on && (
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shine" />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {n > 1 && (
      <div className="flex items-center justify-center gap-1.5 mt-3" role="tablist" aria-label="Pilih promo">
        {slides.map((s, i) => (
          <button key={s.key} type="button" role="tab" aria-selected={i === active} aria-label={`Promo ${i + 1}`} onClick={() => go(i)} className="h-6 flex items-center">
            <span className={`relative block h-1.5 rounded-full overflow-hidden transition-all duration-300 ${i === active ? 'w-8 bg-grab/20' : 'w-1.5 bg-[#D5D8DC]'}`}>
              {i === active && (
                <span
                  key={cycle}
                  className="absolute inset-y-0 left-0 bg-grab-cta rounded-full"
                  style={{ animation: hover || drag ? 'none' : `carouselProgress ${intervalMs}ms linear forwards`, width: hover || drag ? '100%' : undefined }}
                />
              )}
            </span>
          </button>
        ))}
      </div>
      )}
    </div>
  );
};
