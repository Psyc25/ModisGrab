export const nf = (n: number) => Math.round(n || 0).toLocaleString('id-ID');
export const pct = (n: number, digits = 0) => `${((n || 0) * 100).toLocaleString('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
export const idr = (n: number) => `Rp${Math.round(n || 0).toLocaleString('id-ID')}`;
export const idrShort = (n: number) => {
  const v = Math.round(n || 0);
  if (v >= 1e9) return `Rp${(v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (v >= 1e6) return `Rp${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (v >= 1e3) return `Rp${(v / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return `Rp${v}`;
};
