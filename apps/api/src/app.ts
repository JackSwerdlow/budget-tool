import { Hono } from 'hono';
import type { Context } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import {
  createEntry,
  createList,
  deleteEntry,
  deleteList,
  getBootstrap,
  getList,
  updateList,
  type NewList,
  type NewListItem,
} from './repo.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isPct = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100;

async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asListInput(body: Record<string, unknown>): NewList | null {
  const date = String(body.date ?? '');
  if (!DATE_RE.test(date)) return null;

  const fee = Number(body.delivery_fee_pence ?? 0);
  const deliveryPct = Number(body.delivery_share_pct ?? 0);
  const deliveryCat = Number(body.delivery_category_id);
  if (!Number.isInteger(fee) || fee < 0 || !isPct(deliveryPct) || !Number.isInteger(deliveryCat)) {
    return null;
  }
  if (!Array.isArray(body.items)) return null;

  const items: NewListItem[] = [];
  for (const raw of body.items) {
    if (typeof raw !== 'object' || raw === null) return null;
    const it = raw as Record<string, unknown>;
    const name = String(it.name ?? '').trim();
    const price = Number(it.price_pence);
    const qty = Number(it.quantity ?? 1);
    const pct = Number(it.share_pct ?? 0);
    const cat = Number(it.category_id);
    if (
      name === '' ||
      !Number.isInteger(price) ||
      price < 0 ||
      !Number.isInteger(qty) ||
      qty < 1 ||
      !isPct(pct) ||
      !Number.isInteger(cat)
    ) {
      return null;
    }
    items.push({ name, price_pence: price, quantity: qty, share_pct: pct, category_id: cat });
  }

  const note = body.note == null ? null : String(body.note);
  return {
    date,
    note,
    delivery_fee_pence: fee,
    delivery_share_pct: deliveryPct,
    delivery_category_id: deliveryCat,
    items,
  };
}

export function createApp(db: DatabaseSync): Hono {
  const app = new Hono();
  const api = new Hono();

  api.get('/health', (c) => c.json({ ok: true }));
  api.get('/bootstrap', (c) => c.json(getBootstrap(db)));

  // ── Entries ──────────────────────────────────────────────────────────────
  api.post('/entries', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);

    const amount = Number(body.amount_pence);
    const categoryId = Number(body.category_id);
    const date = String(body.date ?? '');
    if (!Number.isInteger(amount) || !Number.isInteger(categoryId) || !DATE_RE.test(date)) {
      return c.json({ error: 'invalid entry' }, 400);
    }
    const note = body.note == null ? null : String(body.note);

    try {
      return c.json(createEntry(db, { amount_pence: amount, category_id: categoryId, date, note }), 201);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/entries/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    return c.json(deleteEntry(db, id));
  });

  // ── Itemised lists ───────────────────────────────────────────────────────
  api.post('/lists', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const input = asListInput(body);
    if (!input) return c.json({ error: 'invalid list' }, 400);
    try {
      return c.json(createList(db, input), 201);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.patch('/lists/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    if (!getList(db, id)) return c.json({ error: 'not found' }, 404);

    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const input = asListInput(body);
    if (!input) return c.json({ error: 'invalid list' }, 400);
    try {
      return c.json(updateList(db, id, input));
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/lists/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    return c.json(deleteList(db, id));
  });

  app.route('/api', api);
  return app;
}
