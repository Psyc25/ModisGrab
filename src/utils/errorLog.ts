import { getSupabaseClient } from '../services/supabase';

/**
 * Pencatat galat dari tablet crew ke server (terlihat di dashboard office).
 * Hanya mengirim ringkasan galat (pesan + sedikit jejak), tanpa data customer. Dibatasi 5 per menit per tablet.
 */
export const APP_VER = 'crew-v53';
const sent: Record<string, number> = {};
let windowStart = Date.now();
let inWindow = 0;

function ctx() {
  try {
    const s = JSON.parse(localStorage.getItem('modis_f1_session') || 'null');
    return { unit: s?.unit_id || null, spg: s?.spg_name || null };
  } catch {
    return { unit: null, spg: null };
  }
}

const IGNORE = /ResizeObserver loop|dynamically imported module|Importing a module script failed|Failed to fetch dynamically|Loading chunk|^Script error\.?$|NetworkError|Failed to fetch|Load failed|The operation was aborted|AbortError/i;

export function logClientError(message: unknown, stack?: unknown) {
  try {
    const msg = String((message as any)?.message || message || '').slice(0, 300);
    if (!msg || IGNORE.test(msg)) return;
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      inWindow = 0;
    }
    if (inWindow >= 5) return;
    if (sent[msg] && now - sent[msg] < 10 * 60_000) return;
    sent[msg] = now;
    inWindow++;
    const sb = getSupabaseClient();
    if (!sb) return;
    const c = ctx();
    void sb
      .rpc('modis_f1_log_error', {
        p_unit: c.unit,
        p_spg: c.spg,
        p_ver: APP_VER,
        p_msg: msg,
        p_stack: String(stack || '').slice(0, 1500),
        p_url: location.pathname,
        p_ua: navigator.userAgent,
      })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    /* pencatat tidak boleh membuat galat baru */
  }
}

export function installErrorLogger() {
  if (!(location.pathname === '/' || location.pathname.startsWith('/crew'))) return;
  window.addEventListener('error', (e) => logClientError(e.error?.message || e.message, e.error?.stack));
  window.addEventListener('unhandledrejection', (e) => logClientError((e.reason as any)?.message || e.reason, (e.reason as any)?.stack));
}
