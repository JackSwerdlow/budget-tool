import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5001,
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
