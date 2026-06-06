import { describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { migrate } from './migrate.ts';
import { seedIfEmpty } from './seed.ts';
import { createApp } from './app.ts';

function freshApp() {
  const db = openDatabase(':memory:');
  migrate(db);
  seedIfEmpty(db);
  return createApp(db);
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function body<T>(res: { json: () => Promise<unknown> }): Promise<T> {
  return (await res.json()) as T;
}

type Boot = { groups: unknown[]; categories: unknown[]; entries: Array<Record<string, unknown>>; lists: unknown[] };
type Entry = { id: number; amount_pence: number };

describe('GET /api/bootstrap', () => {
  it('returns the seeded taxonomy and no entries', async () => {
    const app = freshApp();
    const res = await app.request('/api/bootstrap');
    expect(res.status).toBe(200);
    const data = await body<Boot>(res);
    expect(data.groups).toHaveLength(5);
    expect(data.categories).toHaveLength(15);
    expect(data.entries).toEqual([]);
    expect(data.lists).toEqual([]);
  });
});

describe('POST /api/entries', () => {
  it('inserts an entry and bootstrap reflects it', async () => {
    const app = freshApp();
    const post = await app.request('/api/entries', json({ amount_pence: 4000, category_id: 3, date: '2026-06-03', note: 'shop' }));
    expect(post.status).toBe(201);
    const created = await body<Entry>(post);
    expect(created.id).toBeGreaterThan(0);
    expect(created.amount_pence).toBe(4000);

    const boot = await body<Boot>(await app.request('/api/bootstrap'));
    expect(boot.entries).toHaveLength(1);
    expect(boot.entries[0]).toMatchObject({ amount_pence: 4000, category_id: 3, date: '2026-06-03', note: 'shop' });
    expect(typeof boot.entries[0].created_at).toBe('string');
  });

  it('rejects a non-integer amount with 400', async () => {
    const app = freshApp();
    const res = await app.request('/api/entries', json({ amount_pence: 'x', category_id: 3, date: '2026-06-03' }));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed date with 400', async () => {
    const app = freshApp();
    const res = await app.request('/api/entries', json({ amount_pence: 1000, category_id: 3, date: 'June 3rd' }));
    expect(res.status).toBe(400);
  });

  it('rejects an entry referencing a missing category (FK) with 400', async () => {
    const app = freshApp();
    const res = await app.request('/api/entries', json({ amount_pence: 4000, category_id: 9999, date: '2026-06-03' }));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/entries/:id', () => {
  it('removes the entry', async () => {
    const app = freshApp();
    const created = await body<Entry>(await app.request('/api/entries', json({ amount_pence: 1000, category_id: 3, date: '2026-06-05' })));
    const del = await app.request(`/api/entries/${created.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    const boot = await body<Boot>(await app.request('/api/bootstrap'));
    expect(boot.entries).toEqual([]);
  });
});

type ListRow = { id: number; note: string | null; items: unknown[] };
type BootLists = { lists: ListRow[] };

const sampleList = {
  date: '2026-06-05',
  note: 'weekly shop',
  delivery_fee_pence: 0,
  delivery_share_pct: 0,
  delivery_category_id: 3,
  items: [
    { name: 'milk', price_pence: 500, quantity: 1, share_pct: 0, category_id: 3 },
    { name: 'soap', price_pence: 200, quantity: 1, share_pct: 50, category_id: 4 },
  ],
};

describe('POST /api/lists', () => {
  it('creates a list with items and bootstrap reflects the fan-out', async () => {
    const app = freshApp();
    const res = await app.request('/api/lists', json(sampleList));
    expect(res.status).toBe(201);
    const created = await body<ListRow>(res);
    expect(created.id).toBeGreaterThan(0);
    expect(created.items).toHaveLength(2);

    const boot = await body<BootLists>(await app.request('/api/bootstrap'));
    expect(boot.lists).toHaveLength(1);
    expect(boot.lists[0].items).toHaveLength(2);
  });

  it('rejects a list item referencing a missing category (FK) with 400', async () => {
    const app = freshApp();
    const res = await app.request('/api/lists', json({
      ...sampleList,
      items: [{ name: 'x', price_pence: 100, quantity: 1, share_pct: 0, category_id: 9999 }],
    }));
    expect(res.status).toBe(400);
  });

  it('rejects an out-of-range share with 400', async () => {
    const app = freshApp();
    const res = await app.request('/api/lists', json({
      ...sampleList,
      items: [{ name: 'x', price_pence: 100, quantity: 1, share_pct: 150, category_id: 3 }],
    }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/lists/:id', () => {
  it('replaces note and items', async () => {
    const app = freshApp();
    const created = await body<ListRow>(await app.request('/api/lists', json(sampleList)));
    const patched = await app.request(`/api/lists/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...sampleList,
        note: 'v2',
        items: [{ name: 'bread', price_pence: 120, quantity: 1, share_pct: 0, category_id: 3 }],
      }),
    });
    expect(patched.status).toBe(200);
    const boot = await body<BootLists>(await app.request('/api/bootstrap'));
    expect(boot.lists[0].note).toBe('v2');
    expect(boot.lists[0].items).toHaveLength(1);
  });
});

describe('DELETE /api/lists/:id', () => {
  it('removes the list and cascades its items', async () => {
    const app = freshApp();
    const created = await body<ListRow>(await app.request('/api/lists', json(sampleList)));
    const del = await app.request(`/api/lists/${created.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    const boot = await body<BootLists>(await app.request('/api/bootstrap'));
    expect(boot.lists).toEqual([]);
  });
});
