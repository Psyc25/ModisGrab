import React, { useEffect, useRef, useState } from 'react';

/**
 * Angka yang "berlari" naik dari nilai sebelumnya ke nilai baru.
 * Menerima teks yang sudah diformat (mis. "1.234", "Rp 5.000", "87%").
 * Bila bagian angkanya berbentuk desimal atau tidak dikenali, tampil apa adanya.
 */
const RE = /^(\D*?)(\d{1,3}(?:\.\d{3})+|\d+)(\D*)$/;

export const CountUp: React.FC<{ text: string; ms?: number; className?: string }> = ({ text, ms = 900, className = '' }) => {
  const m = RE.exec(text);
  const target = m ? Number(m[2].replace(/\./g, '')) : NaN;
  const [shown, setShown] = useState<number>(Number.isFinite(target) ? 0 : NaN);
  const from = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (target - start) * eased);
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  if (!m || !Number.isFinite(shown)) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {m[1]}
      {shown.toLocaleString('id-ID')}
      {m[3]}
    </span>
  );
};
