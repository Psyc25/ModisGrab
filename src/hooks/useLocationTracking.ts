import { useEffect, useRef, useState } from 'react';
import { SPGConfig } from '../types';
import { dutyHoursLabel, getDeviceId } from '../services/storage';
import { reportPositionRemote } from '../services/supabase';

export type TrackingStatus = 'off' | 'waiting' | 'active' | 'denied' | 'unavailable';

const MIN_INTERVAL = 60_000; // kirim paling sering 1x/menit
const HEARTBEAT = 3 * 60_000; // tetap kirim tiap 3 menit walau diam
const MOVE_M = 50;

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Selama tugas jaga aktif, posisi GPS tablet dikirim ke dashboard internal (peta unit).
 * Hemat kuota: hanya saat berpindah > 50 m atau setiap 3 menit.
 */
export function useLocationTracking(cfg: SPGConfig, active: boolean) {
  const [status, setStatus] = useState<TrackingStatus>('off');
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const last = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const latest = useRef<GeolocationPosition | null>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    if (!active) {
      setStatus('off');
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('waiting');
    let cancelled = false;

    const send = async (pos: GeolocationPosition, force = false) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const now = Date.now();
      const prev = last.current;
      if (!force && prev) {
        const moved = distanceM(prev, p);
        if (now - prev.at < MIN_INTERVAL) return;
        if (moved < MOVE_M && now - prev.at < HEARTBEAT - 5000) return;
      }
      last.current = { ...p, at: now };
      const c = cfgRef.current;
      const ok = await reportPositionRemote({
        device_id: getDeviceId(),
        spg_name: c.spgName,
        unit_type: c.unitType,
        poi_location: c.poiLocation,
        duty_hours: dutyHoursLabel(c),
        lat: p.lat,
        lng: p.lng,
        accuracy: Math.round(pos.coords.accuracy || 0),
      });
      if (cancelled) return;
      if (ok) setLastSent(new Date());
      else last.current = prev; // coba lagi di pembaruan berikutnya
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos;
        setStatus('active');
        send(pos);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied');
        else if (!latest.current) setStatus('unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 60_000 },
    );
    const hb = window.setInterval(() => {
      if (latest.current) send(latest.current);
    }, HEARTBEAT);
    const onOnline = () => latest.current && send(latest.current, true);
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(hb);
      window.removeEventListener('online', onOnline);
    };
  }, [active]);

  return { status, lastSent };
}

export const TRACKING_LABEL: Record<TrackingStatus, string> = {
  off: 'Pelacakan mati',
  waiting: 'Mencari sinyal GPS…',
  active: 'Lokasi terpantau',
  denied: 'Izin lokasi ditolak',
  unavailable: 'GPS tidak tersedia',
};
