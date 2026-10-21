import React from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { logClientError } from '../utils/errorLog';

/**
 * Penjaga tampilan: bila satu bagian aplikasi error, yang muncul adalah layar pemulihan,
 * bukan layar putih kosong. Data tugas jaga & visitor tetap aman di tablet (localStorage).
 */

const RELOAD_KEY = 'modis_chunk_reload_at';

/** File aplikasi versi lama sudah tidak ada setelah update (tablet dibiarkan terbuka lama). */
export function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|ChunkLoadError|Loading chunk/i.test(msg);
}

/** Muat ulang sekali (maks 1x per 30 detik) supaya tidak berputar terus. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* abaikan */
  }
  window.location.reload();
  return true;
}

/** lazy() dengan coba ulang: bila file versi lama hilang, aplikasi dimuat ulang ke versi terbaru. */
export function lazyWithReload<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (isChunkLoadError(err) && reloadForNewVersion()) {
        return new Promise<{ default: T }>(() => {}); // tunggu reload
      }
      throw err;
    }
  });
}

type Props = { children: React.ReactNode; onReset?: () => void; label?: string; compact?: boolean };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MODIS] Tampilan error:', error, info.componentStack);
    logClientError(`[${this.props.label || 'app'}] ${String(error?.message || error)}`, (error as any)?.stack || info.componentStack);
    try {
      localStorage.setItem(
        'modis_last_error',
        JSON.stringify({ at: new Date().toISOString(), where: this.props.label || 'app', message: String(error?.message || error).slice(0, 300) }),
      );
    } catch {
      /* abaikan */
    }
    if (isChunkLoadError(error)) reloadForNewVersion();
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkLoadError(this.state.error);
    return (
      <div
        role="alert"
        className={`${this.props.compact ? 'fixed inset-0 z-[90]' : 'min-h-[100dvh]'} bg-canvas flex items-center justify-center p-6 animate-fade-in`}
      >
        <div className="w-full max-w-sm bg-white rounded-3xl p-6 text-center space-y-3 shadow-xl">
          <div className="mx-auto w-14 h-14 rounded-full bg-grab-tint flex items-center justify-center">
            <RefreshCw className="w-7 h-7 text-grab" />
          </div>
          <h2 className="font-display text-[20px] font-extrabold">{chunk ? 'Ada versi aplikasi terbaru' : 'Tampilan perlu dimuat ulang'}</h2>
          <p className="text-[14px] text-ink-2 leading-snug">
            {chunk
              ? 'Aplikasi baru saja diperbarui. Muat ulang untuk memakai versi terbaru.'
              : 'Terjadi kendala saat menampilkan halaman ini. Data tugas jaga dan visitor tetap aman di tablet.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full h-12 rounded-xl bg-grab-cta text-white font-bold text-[15px] flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Muat ulang aplikasi
          </button>
          {this.props.onReset && !chunk && (
            <button type="button" onClick={this.reset} className="w-full h-11 rounded-xl border border-[#D5D8DC] font-semibold text-[14px] flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Kembali
            </button>
          )}
          <p className="text-[11px] text-ink-3 break-words">{String(this.state.error?.message || '').slice(0, 140)}</p>
        </div>
      </div>
    );
  }
}
