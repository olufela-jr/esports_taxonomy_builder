import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// PORT and BASE_PATH are optional overrides; the defaults work for local development.
const port = Number(process.env.PORT ?? 5173);
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Firebase (Auth, Firestore with listeners, Functions) is one ~550 kB
    // vendor file that cannot shrink without changing the data layer; it is
    // cached across deploys. Everything else stays well under the default.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Firebase and React change far less often than the app, so they ship
        // as their own files and stay cached across deploys. Screens load on
        // demand (src/screens.ts); Rollup splits those itself.
        manualChunks(id) {
          if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) return 'firebase';
          if (/\/node_modules\/(react|react-dom|scheduler|wouter)\//.test(id)) return 'react';
          if (id.includes('/node_modules/lucide-react/')) return 'icons';
          return undefined;
        },
      },
    },
  },
  server: {
    port,
  },
  preview: {
    port,
  },
});
