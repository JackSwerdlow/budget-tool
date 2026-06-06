import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Build with a RELATIVE base so the bundled demo works whether it's served at the
  // origin root (http://host:8787/) or behind a sub-path reverse proxy
  // (https://code-host/proxy/8787/). Dev ignores a relative base (uses '/'), so the
  // direct dev URL is unchanged.
  base: command === 'build' ? './' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true, // fail loudly if 5173 is taken rather than silently drifting ports
    // This platform is reached at http://lab14102.labs.decoded.com:<PORT> directly, and
    // also via the VDE gateway host code-lab14102.labs.decoded.com — allow both.
    allowedHosts: ['lab14102.labs.decoded.com', 'code-lab14102.labs.decoded.com'],
    proxy: {
      // Dev only: forward /api to the Hono server. Keep the /api prefix (no rewrite).
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
}));
