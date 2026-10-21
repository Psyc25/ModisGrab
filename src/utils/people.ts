/** Satu orang per hari = satu data (dipakai dashboard, laporan lama, dan laporan klien). */
const TYPE_RANK: Record<string, number> = { pahe_new: 0, pahe_lapsed: 1, gb_hemat: 2 };
/** Satu orang per hari = satu data: submission dengan nama + 4 digit nomor sama digabung. */
export function dedupePeople<T extends { claim_day: string; name: string; phone_last4: string | null; type: string; created_at: string; photobooth?: boolean | null }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.claim_day}|${(r.name || '').trim().toLowerCase().replace(/\s+/g, ' ')}|${r.phone_last4 || ''}`;
    const cur = m.get(k);
    if (!cur) m.set(k, r);
    else {
      const t = (TYPE_RANK[r.type] ?? 9) < (TYPE_RANK[cur.type] ?? 9) ? r.type : cur.type;
      m.set(k, { ...(r.created_at < cur.created_at ? r : cur), type: t, photobooth: Boolean(r.photobooth || cur.photobooth) });
    }
  }
  return [...m.values()];
}

