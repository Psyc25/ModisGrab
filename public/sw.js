/* MODIS Field App service worker: aplikasi crew tetap bisa dibuka tanpa internet.
   - Halaman /crew: network-first, cadangan dari cache (offline).
   - File /assets/* (nama ber-hash): cache-first.
   - Permintaan ke server data (Supabase) tidak disentuh: antrean data diurus aplikasi. */
const VERSION = 'modis-crew-v53';
const SHELL = 'shell:/crew';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      try {
        const res = await fetch('/crew', { cache: 'no-store' });
        if (res.ok) await cache.put(SHELL, res.clone());
      } catch (e) {
        /* offline saat install: diisi saat kunjungan berikutnya */
      }
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Halaman aplikasi crew
  if (req.mode === 'navigate' && url.pathname.startsWith('/crew')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        try {
          const res = await Promise.race([fetch(req), timeout(5000)]);
          if (res && res.ok) cache.put(SHELL, res.clone());
          return res;
        } catch (e) {
          const cached = await cache.match(SHELL);
          return cached || new Response('<h1>Offline</h1><p>Buka aplikasi sekali saat ada sinyal.</p>', { headers: { 'Content-Type': 'text/html' } });
        }
      })(),
    );
    return;
  }

  // File aplikasi & gambar (nama ber-hash, aman disimpan lama)
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
