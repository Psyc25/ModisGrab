import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary, reloadForNewVersion } from './components/ErrorBoundary';
import { installErrorLogger } from './utils/errorLog';
import './index.css';

// Setelah aplikasi diperbarui, file versi lama hilang. Vite memberi sinyal ini; muat ulang ke versi baru.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  reloadForNewVersion();
});

installErrorLogger();

// Service worker: aplikasi crew (/crew) tetap bisa dibuka tanpa internet
if ('serviceWorker' in navigator && (location.pathname === '/' || location.pathname.startsWith('/crew')) && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary label="app">
    <App />
  </ErrorBoundary>,
);
