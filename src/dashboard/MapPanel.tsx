import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtime } from '../hooks/useRealtime';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin, RefreshCw } from 'lucide-react';
import { DevicePosition, PositionLogRow, fetchDevicePositions, fetchPositionLog } from '../services/supabase';
import { scheduledLocation } from '../data/schedule';

/** Peta posisi tablet SPG (realtime, muat ulang tiap 30 detik) + jejak perjalanan hari ini. */

const todayWIB = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const timeWIB = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
const dayOfWIB = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(iso));

type Fresh = 'live' | 'recent' | 'stale';
const freshness = (iso: string): Fresh => {
  const age = Date.now() - new Date(iso).getTime();
  return age <= 5 * 60_000 ? 'live' : age <= 30 * 60_000 ? 'recent' : 'stale';
};
const FRESH_COLOR: Record<Fresh, string> = { live: '#00B14F', recent: '#F5A623', stale: '#9AA0A6' };
const FRESH_LABEL: Record<Fresh, string> = { live: 'Aktif (≤5 menit)', recent: '≤30 menit', stale: 'Lebih lama' };
const TRAIL_COLORS = ['#00B14F', '#1F6FEB', '#D6336C', '#7048E8', '#F08C00', '#0CA678'];

const agoLabel = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} jam lalu` : `${Math.floor(h / 24)} hari lalu`;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function markerIcon(color: string, label: string, live: boolean) {
  return L.divIcon({
    className: '',
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -38],
    html: `<div style="position:relative;width:36px;height:44px">
      ${live ? `<span style="position:absolute;left:6px;top:6px;width:24px;height:24px;border-radius:50%;background:${color};opacity:.35;animation:modisPing 1.8s ease-out infinite"></span>` : ''}
      <svg width="36" height="44" viewBox="0 0 36 44" style="position:absolute;inset:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))">
        <path d="M18 43c0 0 15-14.5 15-25A15 15 0 0 0 3 18c0 10.5 15 25 15 25z" fill="${color}" stroke="#fff" stroke-width="2.5"/>
        <text x="18" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="800" fill="#fff">${esc(label)}</text>
      </svg>
    </div>`,
  });
}

const unitShort = (u: string) => (u.startsWith('Mobil') ? 'M' : u.replace('Kiosk ', 'K') || '?');

export const MapPanel: React.FC = () => {
  const [day, setDay] = useState(todayWIB());
  const [positions, setPositions] = useState<DevicePosition[]>([]);
  const [log, setLog] = useState<PositionLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [showTrail, setShowTrail] = useState(true);
  const [, tick] = useState(0);

  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const fitted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, l] = await Promise.all([fetchDevicePositions(), fetchPositionLog(day)]);
      setPositions(p);
      setLog(l);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat posisi.');
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 10_000);
    const t2 = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => (window.clearInterval(t), window.clearInterval(t2));
  }, [load]);
  useRealtime(['modis_device_positions', 'modis_position_log'], load);

  // Inisialisasi peta (Jakarta)
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([-6.2, 106.83], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Posisi tablet yang diperbarui hari yang dipilih (hari ini = semua posisi terakhir)
  const shown = useMemo(() => (day === todayWIB() ? positions : positions.filter((p) => dayOfWIB(p.updated_at) === day)), [positions, day]);

  // Gambar ulang marker & jejak
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    markers.current.clear();
    const byDev = new Map<string, [number, number][]>();
    log.forEach((r) => {
      const arr = byDev.get(r.device_id) || [];
      arr.push([r.lat, r.lng]);
      byDev.set(r.device_id, arr);
    });
    const devices = Array.from(new Set([...shown.map((p) => p.device_id), ...byDev.keys()]));
    if (showTrail) {
      devices.forEach((id) => {
        const pts = byDev.get(id);
        if (pts && pts.length > 1) {
          const color = TRAIL_COLORS[devices.indexOf(id) % TRAIL_COLORS.length];
          L.polyline(pts, { color, weight: 4, opacity: 0.7, dashArray: '1 8', lineCap: 'round' }).addTo(g);
          L.circleMarker(pts[0], { radius: 5, color, fillColor: '#fff', fillOpacity: 1, weight: 3 }).bindTooltip('Titik awal').addTo(g);
        }
      });
    }
    const bounds: [number, number][] = [];
    shown.forEach((p) => {
      const f = freshness(p.updated_at);
      const sched = scheduledLocation(dayOfWIB(p.updated_at), p.unit_type, (p.duty_hours || '').slice(0, 5).replace('.', ':'));
      const mismatch = sched && p.poi_location && sched.location !== p.poi_location;
      const mk = L.marker([p.lat, p.lng], { icon: markerIcon(FRESH_COLOR[f], unitShort(p.unit_type || ''), f === 'live') })
        .bindPopup(
          `<div style="font:13px/1.4 'Plus Jakarta Sans Variable',system-ui;min-width:190px">
            <strong style="font-size:14px">${esc(p.spg_name || 'SPG')}</strong><br/>
            ${esc(p.unit_type || '-')} · ${esc(p.duty_hours || '-')}<br/>
            📍 ${esc(p.poi_location || '-')}<br/>
            ${sched ? `<span style="color:${mismatch ? '#D93025' : '#00804A'}">Jadwal: ${esc(sched.location)}${mismatch ? ' (berbeda)' : ' ✓'}</span><br/>` : ''}
            <span style="color:#5F6368">Update ${timeWIB(p.updated_at)} (${agoLabel(p.updated_at)}) · akurasi ±${Math.round(p.accuracy || 0)} m</span><br/>
            <a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener">Buka di Google Maps</a>
          </div>`,
        )
        .addTo(g);
      if (p.accuracy && p.accuracy < 2000) L.circle([p.lat, p.lng], { radius: p.accuracy, color: FRESH_COLOR[f], weight: 1, fillOpacity: 0.08 }).addTo(g);
      markers.current.set(p.device_id, mk);
      bounds.push([p.lat, p.lng]);
    });
    if (!fitted.current && bounds.length) {
      m.fitBounds(L.latLngBounds(bounds).pad(0.3), { maxZoom: 15 });
      fitted.current = true;
    }
  }, [shown, log, showTrail]);

  const focus = (p: DevicePosition) => {
    const m = map.current;
    if (!m) return;
    m.flyTo([p.lat, p.lng], 16, { duration: 0.8 });
    window.setTimeout(() => markers.current.get(p.device_id)?.openPopup(), 850);
  };

  const fitAll = () => {
    const m = map.current;
    if (!m || !shown.length) return;
    m.fitBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lng] as [number, number])).pad(0.3), { maxZoom: 15 });
  };

  const counts = useMemo(() => {
    const c: Record<Fresh, number> = { live: 0, recent: 0, stale: 0 };
    shown.forEach((p) => (c[freshness(p.updated_at)] += 1));
    return c;
  }, [shown, updatedAt]);

  return (
    <section className="space-y-3 animate-fade-in">
      <style>{`@keyframes modisPing{0%{transform:scale(.6);opacity:.55}100%{transform:scale(2.4);opacity:0}}`}</style>
      <div className="bg-white rounded-2xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="font-display text-[17px] font-bold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-grab" /> Peta unit realtime
          </h2>
          <p className="text-[13px] text-ink-2">
            Posisi tablet SPG selama jam jaga · muat ulang otomatis tiap 30 detik
            {updatedAt && ` · ${updatedAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={day} max={todayWIB()} onChange={(e) => ((fitted.current = false), setDay(e.target.value))} className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px]" aria-label="Tanggal jejak" />
          <label className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px] flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showTrail} onChange={(e) => setShowTrail(e.target.checked)} className="accent-[#00B14F]" /> Jejak
          </label>
          <button onClick={fitAll} className="h-10 px-3 rounded-xl border border-[#D5D8DC] text-[14px] font-semibold flex items-center gap-1.5">
            <Crosshair className="w-4 h-4" /> Semua unit
          </button>
          <button onClick={load} disabled={loading} className="h-10 px-3 rounded-xl bg-grab-cta text-white text-[14px] font-semibold flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-[13px] text-modis-red font-medium bg-white rounded-xl px-4 py-2">{error}</p>}

      <div className="grid lg:grid-cols-[1fr_320px] gap-3">
        <div className="bg-white rounded-2xl overflow-hidden relative">
          <div ref={el} className="h-[440px] lg:h-[560px] w-full z-0" />
          <div className="absolute left-3 bottom-6 z-[400] bg-white/95 rounded-xl px-3 py-2 shadow text-[12px] space-y-1">
            {(Object.keys(FRESH_COLOR) as Fresh[]).map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: FRESH_COLOR[f] }} /> {FRESH_LABEL[f]} · {counts[f]}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-3 space-y-2 max-h-[560px] overflow-y-auto">
          <p className="px-1 text-[12px] font-semibold text-ink-3 uppercase tracking-wide">Tablet ({shown.length})</p>
          {shown.length === 0 && (
            <p className="px-1 py-6 text-center text-[13px] text-ink-2">
              Belum ada posisi. Lokasi muncul setelah SPG memulai tugas jaga dan mengizinkan akses lokasi di tablet.
            </p>
          )}
          {shown.map((p) => {
            const f = freshness(p.updated_at);
            const sched = scheduledLocation(dayOfWIB(p.updated_at), p.unit_type, (p.duty_hours || '').slice(0, 5).replace('.', ':'));
            const mismatch = sched && p.poi_location && sched.location !== p.poi_location;
            return (
              <button key={p.device_id} onClick={() => focus(p)} className="w-full text-left p-3 rounded-xl border border-line hover:border-grab hover:bg-grab-tint-2 transition">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: FRESH_COLOR[f] }} />
                  <span className="font-semibold text-[14px] truncate flex-1">{p.spg_name || 'SPG'}</span>
                  <span className="text-[12px] text-ink-3 shrink-0">{agoLabel(p.updated_at)}</span>
                </div>
                <p className="text-[12px] text-ink-2 mt-1 truncate">
                  {p.unit_type} · {p.duty_hours} · {p.poi_location || '-'}
                </p>
                {mismatch && <p className="text-[12px] text-modis-red mt-0.5 truncate">Beda dari jadwal: {sched!.location}</p>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default MapPanel;
