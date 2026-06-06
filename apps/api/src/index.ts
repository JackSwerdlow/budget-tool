import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { migrate } from './migrate.ts';
import { seedIfEmpty } from './seed.ts';
import { getBootstrap } from './repo.ts';

migrate();
seedIfEmpty();

const app = new Hono();

const api = new Hono();
api.get('/health', (c) => c.json({ ok: true }));
api.get('/bootstrap', (c) => c.json(getBootstrap()));
app.route('/api', api);

// In production the API also serves the built web client (single-origin demo).
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './apps/web/dist' }));
  app.get('*', serveStatic({ path: './apps/web/dist/index.html' }));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[api] listening on http://0.0.0.0:${info.port} (db=${process.env.BUDGET_DB})`);
});
