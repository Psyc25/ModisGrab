import { createRoot } from 'react-dom/client';
import { ClientReportApp } from '../src/report/ClientReportApp';
import './report.css';
import { ErrorBoundary, reloadForNewVersion } from '../src/components/ErrorBoundary';

window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  reloadForNewVersion();
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary label="laporan-klien">
    <ClientReportApp />
  </ErrorBoundary>,
);
