import React, { useEffect, useState } from 'react';
import { brand } from '../assets/brand';

/**
 * Kartu stamp digital "Sobat Hemat" (pengganti kartu & stempel fisik).
 * Stamp 1 = subscribe PaHe, Stamp 2 = naik GB Hemat, di hari yang sama.
 * Digambar ke canvas → JPG, sehingga bisa ditampilkan, difoto customer, dan diunduh office.
 */
export type StampCardData = {
  name: string;
  last4?: string | null;
  day: string; // YYYY-MM-DD
  unit?: string | null;
  venue?: string | null;
  s1: boolean;
  s2: boolean;
};

// Desain kartu dari tim kreatif (STAMP CARD MODIS.png, "Dapatkan Hadiah!"), 1241 x 875.
// Dua lingkaran putih = slot stamp; strip kuning di bawah = nama pemilik kartu.
const W = 1241;
const H = 875;
const SLOTS = [
  { cx: 490.5, label: 'PaHe', sub: 'Subscribe PaHe' },
  { cx: 752.5, label: 'GB Hemat', sub: 'Naik GB Hemat' },
];
const CY = 499.5;
const R = 110.5;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const loadImg = (src: string) =>
  new Promise<HTMLImageElement | null>((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
let bgPromise: Promise<HTMLImageElement | null> | null = null;
const loadBg = () => (bgPromise ||= loadImg(brand.stampCardBg));

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSlot(ctx: CanvasRenderingContext2D, i: number, done: boolean, day: string) {
  const { cx, label, sub } = SLOTS[i];
  ctx.save();
  ctx.textAlign = 'center';
  if (!done) {
    ctx.setLineDash([9, 8]);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#C3C9CF';
    ctx.beginPath();
    ctx.arc(cx, CY, R - 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#D5DADF';
    ctx.font = `900 80px ${FONT}`;
    ctx.fillText(String(i + 1), cx, CY + 18);
    ctx.fillStyle = '#7B848C';
    ctx.font = `700 17px ${FONT}`;
    ctx.fillText(sub, cx, CY + 58);
    ctx.restore();
    return;
  }
  // Cap stempel merah, sedikit miring
  ctx.translate(cx, CY);
  ctx.rotate(i === 0 ? -0.2 : 0.16);
  ctx.strokeStyle = '#D6282E';
  ctx.fillStyle = '#D6282E';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, R - 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, R - 21, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `900 32px ${FONT}`;
  ctx.fillText('MODIS', 0, -14);
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText(label.toUpperCase(), 0, 13);
  const d = new Date(`${day}T00:00:00Z`);
  ctx.font = `700 16px ${FONT}`;
  ctx.fillText(`${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`, 0, 38);
  ctx.restore();
  // Centang hijau di pojok slot
  ctx.save();
  const bx = cx + R * 0.74;
  const by = CY - R * 0.74;
  ctx.fillStyle = '#00B14F';
  ctx.beginPath();
  ctx.arc(bx, by, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(bx - 9, by);
  ctx.lineTo(bx - 2, by + 8);
  ctx.lineTo(bx + 10, by - 8);
  ctx.stroke();
  ctx.restore();
}

export async function renderStampCard(c: StampCardData): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const bg = await loadBg();
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  else {
    ctx.fillStyle = '#0F9448';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#FFD902';
    ctx.fillRect(0, 820, W, H - 820);
    SLOTS.forEach(({ cx }) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx, CY, R, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawSlot(ctx, 0, c.s1, c.day);
  drawSlot(ctx, 1, c.s2, c.day);

  // Pemilik kartu: di strip kuning bawah
  ctx.textAlign = 'center';
  ctx.fillStyle = '#12301F';
  ctx.font = `800 26px ${FONT}`;
  const nm = (c.name || '-').slice(0, 28);
  ctx.fillText(nm + (c.last4 ? `  ••${c.last4}` : ''), W / 2, 846);
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText([dayLabel(c.day), c.venue, c.unit].filter(Boolean).join('  ·  ').slice(0, 90), W / 2, 867);

  // Status di pojok kanan atas
  const done = c.s1 && c.s2;
  const label = done ? 'LENGKAP · MAIN GACHA' : `${Number(c.s1) + Number(c.s2)} / 2 STAMP`;
  ctx.font = `800 20px ${FONT}`;
  const pw = ctx.measureText(label).width + 40;
  roundRect(ctx, W - pw - 28, 28, pw, 46, 23);
  ctx.fillStyle = done ? '#FFD902' : 'rgba(0,0,0,0.3)';
  ctx.fill();
  ctx.fillStyle = done ? '#1A1A1A' : '#FFFFFF';
  ctx.fillText(label, W - pw / 2 - 28, 59);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export const StampCardImage: React.FC<{ data: StampCardData; className?: string }> = ({ data, className = '' }) => {
  const [src, setSrc] = useState<string | null>(null);
  const key = JSON.stringify(data);
  useEffect(() => {
    let alive = true;
    renderStampCard(data).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return src ? (
    <img src={src} alt={`Kartu stamp ${data.name}: ${Number(data.s1) + Number(data.s2)} dari 2 stamp`} className={`w-full h-auto rounded-2xl shadow-lg ${className}`} draggable={false} />
  ) : (
    <div className={`w-full aspect-[1241/875] rounded-2xl bg-[#E9ECEF] animate-pulse ${className}`} />
  );
};

export async function downloadStampCard(data: StampCardData) {
  const url = await renderStampCard(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kartu-stamp_${data.day}_${(data.name || 'visitor').replace(/[^A-Za-z0-9]+/g, '-')}${data.last4 ? `_${data.last4}` : ''}.jpg`;
  a.click();
}
