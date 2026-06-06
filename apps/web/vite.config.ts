import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // This platform is reached at http://lab14102.labs.decoded.com:<PORT> (never localhost),
    // so the dev server must allow that Host header.
    allowedHosts: ['lab14102.labs.decoded.com'],
    proxy: {
      // Dev only: forward /api to the Hono server. Keep the /api prefix (no rewrite).
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
