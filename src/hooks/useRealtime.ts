import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * Realtime dashboard office: dengarkan perubahan tabel Supabase (insert/update/delete) lalu panggil onChange
 * (ditunda 600 ms supaya banyak perubahan beruntun hanya memicu satu muat ulang).
 * Polling tetap berjalan di komponen sebagai cadangan bila koneksi realtime putus.
 */
export function useRealtime(tables: string[], onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(',');
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    let timer: number | undefined;
    const fire = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => cb.current(), 600);
    };
    let ch = sb.channel(`rt-${key}-${Math.random().toString(36).slice(2, 8)}`);
    tables.forEach((t) => {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, fire);
    });
    ch.subscribe();
    // Saat tab kembali aktif / koneksi pulih, muat ulang langsung
    const vis = () => document.visibilityState === 'visible' && fire();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', fire);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', fire);
      void sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
