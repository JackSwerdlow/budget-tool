import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import { createEntry, deleteEntry, getBootstrap } from './repo.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createApp(db: DatabaseSync): Hono {
  const app = new Hono();
  const api = new Hono();

  api.get('/health', (c) => c.json({ ok: true }));
  api.get('/bootstrap', (c) => c.json(getBootstrap(db)));

  api.post('/entries', async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }

    const amount = Number(body.amount_pence);
    const categoryId = Number(body.category_id);
    const date = String(body.date ?? '');
    if (!Number.isInteger(amount) || !Number.isInteger(categoryId) || !DATE_RE.test(date)) {
      return c.json({ error: 'invalid entry' }, 400);
    }
    const note = body.note == null ? null : String(body.note);

    try {
      const entry = createEntry(db, { amount_pence: amount, category_id: categoryId, date, note });
      return c.json(entry, 201);
    } catch (err) {
      // e.g. a foreign-key violation: the category does not exist.
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/entries/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    return c.json(deleteEntry(db, id));
  });

  app.route('/api', api);
  return app;
}
