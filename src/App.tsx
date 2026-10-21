import { Suspense } from 'react';
import { FieldApp } from './field/FieldApp';
import { lazyWithReload } from './components/ErrorBoundary';

const OwnerDashboard = lazyWithReload(() => import('./dashboard/OwnerDashboard').then((m) => ({ default: m.OwnerDashboard })));

/**
 * Satu aplikasi, tiga pintu:
 *  /dashboard  = dashboard office
 *  /crew (dan /) = aplikasi crew, termasuk Cek Boros yang menyatu dengan input customer
 * Laporan klien ada di /grab/<key> (halaman terpisah).
 */
export default function App() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (/^\/dashboard\/?$/.test(path)) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[14px] text-ink-2">Memuat…</div>}>
        <OwnerDashboard />
      </Suspense>
    );
  }
  return <FieldApp />;
}
