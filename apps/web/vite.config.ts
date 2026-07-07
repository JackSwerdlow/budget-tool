import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Set by the Tauri CLI during `tauri android dev` when the device needs the dev server on the
// public network address; unset (→ identical config) for plain web dev and desktop tauri:dev.
const tauriDevHost = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: tauriDevHost || '0.0.0.0',
    port: 5001,
    hmr: tauriDevHost ? { protocol: 'ws', host: tauriDevHost, port: 5002 } : undefined,
    allowedHosts: ['5001-lab14102.labs.decoded.com'],
    proxy: {
      // Dev only: forward /api to the Hono server. Keep the /api prefix (no rewrite).
      '/api': {
        target: 'http://localhost:8100',
        changeOrigin: true,
      },
    },
  },
}));
