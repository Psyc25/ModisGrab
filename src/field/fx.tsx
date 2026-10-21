import React, { useEffect, useMemo } from 'react';

/** Efek riak saat tombol ditekan, untuk semua tombol di dalam elemen .fx-root. Dipasang sekali. */
let rippleUsers = 0;
export function useTapRipple() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    rippleUsers += 1;
    if (rippleUsers > 1) return () => void (rippleUsers -= 1);
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('button, a, label.fx-tap') as HTMLElement | null;
      if (!el || !el.closest('.fx-root') || (el as HTMLButtonElement).disabled) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) return;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      const wrap = document.createElement('span');
      wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;';
      const size = Math.max(rect.width, rect.height);
      const dot = document.createElement('span');
      dot.className = 'fx-ripple';
      dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px;`;
      wrap.appendChild(dot);
      el.appendChild(wrap);
      window.setTimeout(() => wrap.remove(), 600);
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => {
      rippleUsers -= 1;
      document.removeEventListener('pointerdown', onDown);
    };
  }, []);
}

/** Taburan konfeti kecil (layar sukses). */
export const Confetti: React.FC<{ count?: number }> = ({ count = 22 }) => {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const r = 90 + Math.random() * 90;
        return {
          dx: `${Math.cos(a) * r}px`,
          dy: `${Math.sin(a) * r - 40}px`,
          rot: `${Math.round(Math.random() * 540 - 270)}deg`,
          color: ['#00B14F', '#FFD902', '#F28C00', '#2FD67B', '#00523B'][i % 5],
          delay: `${Math.random() * 120}ms`,
        };
      }),
    [count],
  );
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className="fx-confetti"
          style={{ background: b.color, animationDelay: b.delay, ['--dx' as any]: b.dx, ['--dy' as any]: b.dy, ['--rot' as any]: b.rot }}
        />
      ))}
    </span>
  );
};
