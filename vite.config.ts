import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    // Relative base so the built assets resolve correctly whether the app is
    // served from a domain root or a GitHub Pages project subpath (/SystemDesign/).
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      // Slightly more aggressive minification.
      minify: 'esbuild',
      rollupOptions: {
        output: {
          /**
           * Manual chunking strategy:
           *  - React + ReactDOM share one small vendor chunk downloaded once.
           *  - lucide-react icons used by shared lesson/learn infrastructure go
           *    into a shared "ui" chunk so they aren't duplicated across chapters.
           *  - Each chapter already gets its own lazy chunk via App.tsx's
           *    dynamic imports; this just keeps the shared base small.
           */
          manualChunks(id: string) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
          },
        },
      },
    },
  };
});
