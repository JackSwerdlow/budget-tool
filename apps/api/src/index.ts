import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { openDatabase } from './db.ts';
import { migrate } from './migrate.ts';
import { seedIfEmpty } from './seed.ts';
import { createApp } from './app.ts';

const dbPath = process.env.BUDGET_DB;
if (!dbPath) throw new Error('BUDGET_DB env var is required');

const db = openDatabase(dbPath);
migrate(db);
seedIfEmpty(db);

const app = createApp(db);

// In production the API also serves the built web client (single-origin demo).
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './apps/web/dist' }));
  app.get('*', serveStatic({ path: './apps/web/dist/index.html' }));
}

const port = Number(process.env.PORT ?? 8100);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[api] listening on http://0.0.0.0:${info.port} (db=${dbPath})`);
});
