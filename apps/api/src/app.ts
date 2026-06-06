import { Hono } from 'hono';
import type { Context } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import {
  createCategory,
  createEntry,
  createGroup,
  createList,
  deleteCategory,
  deleteEntry,
  deleteGroup,
  deleteIncome,
  deleteList,
  getBootstrap,
  getGroup,
  getList,
  setIncome,
  updateCategory,
  updateEntry,
  updateGroup,
  updateList,
  type EntryPatch,
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

  api.patch('/entries/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);

    const p: EntryPatch = {};
    if ('amount_pence' in body) {
      const a = Number(body.amount_pence);
      if (!Number.isInteger(a)) return c.json({ error: 'invalid amount' }, 400);
      p.amount_pence = a;
    }
    if ('category_id' in body) {
      const cat = Number(body.category_id);
      if (!Number.isInteger(cat)) return c.json({ error: 'invalid category' }, 400);
      p.category_id = cat;
    }
    if ('date' in body) {
      const d = String(body.date);
      if (!DATE_RE.test(d)) return c.json({ error: 'invalid date' }, 400);
      p.date = d;
    }
    if ('note' in body) p.note = body.note == null ? null : String(body.note);

    try {
      const updated = updateEntry(db, id, p);
      if (!updated) return c.json({ error: 'not found' }, 404);
      return c.json(updated);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/entries/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    return c.json(deleteEntry(db, id));
  });

  // ── Taxonomy ───────────────────────────────────────────────────────────────
  api.post('/categories', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const name = String(body.name ?? '').trim();
    const groupId = Number(body.group_id);
    if (name === '' || !Number.isInteger(groupId)) return c.json({ error: 'invalid category' }, 400);
    const group = getGroup(db, groupId) as { color: string } | undefined;
    const color = typeof body.color === 'string' ? body.color : group?.color ?? '#9a8b6e';
    try {
      return c.json(createCategory(db, { name, group_id: groupId, color }), 201);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.patch('/categories/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const p: { name?: string; group_id?: number; color?: string } = {};
    if ('name' in body) {
      const n = String(body.name ?? '').trim();
      if (n === '') return c.json({ error: 'invalid name' }, 400);
      p.name = n;
    }
    if ('group_id' in body) {
      const g = Number(body.group_id);
      if (!Number.isInteger(g)) return c.json({ error: 'invalid group' }, 400);
      p.group_id = g;
    }
    if ('color' in body) p.color = String(body.color);
    try {
      const updated = updateCategory(db, id, p);
      if (!updated) return c.json({ error: 'not found' }, 404);
      return c.json(updated);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/categories/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const reassignQuery = c.req.query('reassignTo');
    const reassignTo = reassignQuery ? Number(reassignQuery) : null;
    try {
      // 200 with { deleted:false, inUse:true } when in use (the UI then prompts to
      // reassign) — keeps it a normal response, not a console-noisy 4xx.
      return c.json(deleteCategory(db, id, reassignTo));
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.post('/groups', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const name = String(body.name ?? '').trim();
    if (name === '') return c.json({ error: 'invalid group' }, 400);
    const color = typeof body.color === 'string' ? body.color : '#9a8b6e';
    return c.json(createGroup(db, { name, color }), 201);
  });

  api.patch('/groups/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const p: { name?: string; color?: string } = {};
    if ('name' in body) {
      const n = String(body.name ?? '').trim();
      if (n === '') return c.json({ error: 'invalid name' }, 400);
      p.name = n;
    }
    if ('color' in body) p.color = String(body.color);
    const updated = updateGroup(db, id, p);
    if (!updated) return c.json({ error: 'not found' }, 404);
    return c.json(updated);
  });

  api.delete('/groups/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const result = deleteGroup(db, id);
    if (result.nonEmpty) return c.json({ error: 'group not empty', nonEmpty: true }, 400);
    return c.json(result);
  });

  // ── Income ─────────────────────────────────────────────────────────────────
  api.put('/income/:year/:month', async (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return c.json({ error: 'invalid month' }, 400);
    }
    const bodyJson = await readJson(c);
    if (!bodyJson) return c.json({ error: 'invalid JSON' }, 400);
    const amount = Number(bodyJson.amount_pence);
    if (!Number.isInteger(amount) || amount < 0) return c.json({ error: 'invalid amount' }, 400);
    return c.json(setIncome(db, year, month, amount));
  });

  api.delete('/income/:year/:month', (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month)) return c.json({ error: 'invalid month' }, 400);
    return c.json(deleteIncome(db, year, month));
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
