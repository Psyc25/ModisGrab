import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/** Build terpisah untuk halaman report klien (deploy ke project Vercel sendiri). */
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'report'),
  // REPORT_BASE/REPORT_OUT dipakai saat report ikut dibangun di dalam project utama (alamat /laporan/).
  base: process.env.REPORT_BASE || '/',
  envDir: import.meta.dirname,
  publicDir: false,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(import.meta.dirname, process.env.REPORT_OUT || 'dist-report'),
    emptyOutDir: !process.env.REPORT_OUT,
  },
});
