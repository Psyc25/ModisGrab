import React, { useMemo, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { POI_BY_CATEGORY, isSchoolVenue } from '../data/schedule';
import { getPlottingCache, getPoiCache, todayWIB } from './store';
import { shiftText } from './api';
import { planFor } from '../data/plotting';
import { CalendarDays } from 'lucide-react';

/** Daftar venue: dari office (master POI) bila sudah ada, kalau belum pakai daftar bawaan jadwal. */
export function venueList(): Record<string, string[]> {
  const cache = getPoiCache();
  if (!cache.length) return POI_BY_CATEGORY as Record<string, string[]>;
  const out: Record<string, string[]> = { Station: [], Campus: [], Office: [], 'HOP & Public Space': [] };
  cache.filter((p) => !isSchoolVenue(p.name)).forEach((p) => (out[p.category] || (out[p.category] = [])).push(p.name));
  Object.values(out).forEach((a) => a.sort((x, y) => x.localeCompare(y, 'id')));
  return out;
}

const CAT_LABEL: Record<string, string> = {
  Station: 'Stasiun',
  Campus: 'Kampus',
  Office: 'Perkantoran',
  'HOP & Public Space': 'HOP & Publik',
};

/** Pilih venue/POI saat ini (Mobil bisa pindah venue 2x sehari). */
export const VenuePicker: React.FC<{
  unitId?: string;
  current?: string;
  onPick: (loc: string, cat: string) => void;
  onClose?: () => void;
}> = ({ unitId, current, onPick, onClose }) => {
  const plan = useMemo(() => (unitId ? planFor(getPlottingCache(), todayWIB(), unitId) : null), [unitId]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Station');
  const all = useMemo(() => venueList(), []);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term) {
      return Object.entries(all)
        .flatMap(([c, arr]) => arr.map((name) => ({ name, cat: c })))
        .filter((x) => x.name.toLowerCase().includes(term))
        .slice(0, 60);
    }
    return (all[cat] || []).map((name) => ({ name, cat }));
  }, [q, cat, all]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg bg-white rounded-t-[28px] sm:rounded-[28px] p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[88dvh] flex flex-col animate-sheet-up">
        <div className="shrink-0 flex items-center justify-between mb-3">
          <h2 className="font-display text-[19px] font-extrabold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-grab" /> Venue sekarang
          </h2>
          {onClose && (
            <button onClick={onClose} aria-label="Tutup" className="w-10 h-10 rounded-full bg-canvas flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <label className="shrink-0 relative block mb-3">
          <Search className="w-5 h-5 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama venue" className="w-full h-12 pl-10 pr-3 rounded-xl bg-canvas text-[15px] outline-none" />
        </label>
        {!q && plan && plan.venues.length > 0 && (
          <div className="shrink-0 mb-3 rounded-2xl bg-grab-tint p-3">
            <p className="text-[12px] font-bold text-grab-deep flex items-center gap-1.5 mb-2">
              <CalendarDays className="w-4 h-4" /> Sesuai plotting hari ini{plan.shift ? ` · ${shiftText(plan.shift)}` : plan.shiftLabel ? ` · ${plan.shiftLabel}` : ''}
            </p>
            <div className="space-y-1.5">
              {plan.venues.map((v) => (
                <button
                  key={v.name}
                  onClick={() => onPick(v.name, v.category)}
                  className={`w-full text-left rounded-xl bg-white px-3 py-2.5 border-2 ${v.name === current ? 'border-grab' : 'border-transparent'}`}
                >
                  <span className="block text-[15px] font-bold">{v.name}</span>
                  <span className="block text-[12px] text-ink-2">{[v.time, ...v.tags].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!q && (
          <div className="shrink-0 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-3 mb-1 border-b border-line">
            {Object.keys(CAT_LABEL).map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`shrink-0 h-10 px-4 rounded-full text-[14px] font-semibold border ${cat === c ? 'bg-grab-tint border-grab text-grab-deep' : 'bg-white border-[#E1E4E8]'}`}
              >
                {CAT_LABEL[c]}
              </button>
            ))}
          </div>
        )}
        <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 divide-y divide-line">
          {list.map((x) => (
            <li key={x.name}>
              <button onClick={() => onPick(x.name, x.cat)} className={`w-full text-left px-3 py-3 text-[15px] hover:bg-canvas ${x.name === current ? 'font-bold text-grab-deep' : ''}`}>
                {x.name}
                {q && <span className="block text-[12px] text-ink-3">{CAT_LABEL[x.cat]}</span>}
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="p-4 text-[14px] text-ink-2">
              Tidak ditemukan.{' '}
              <button className="text-grab-cta font-semibold" onClick={() => onPick(q.trim(), 'HOP & Public Space')}>
                Pakai “{q.trim()}”
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};
