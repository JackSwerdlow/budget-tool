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

const patch = (b: unknown) => ({ method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const put = (b: unknown) => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

type Cats = { categories: Array<{ id: number; name: string; group_id: number }> };

describe('PATCH /api/entries/:id', () => {
  it('edits the entry', async () => {
    const app = freshApp();
    const created = await body<Entry>(await app.request('/api/entries', json({ amount_pence: 1000, category_id: 3, date: '2026-06-05' })));
    const res = await app.request(`/api/entries/${created.id}`, patch({ amount_pence: 1500, category_id: 14, date: '2026-06-06', note: 'fixed' }));
    expect(res.status).toBe(200);
    const boot = await body<Boot>(await app.request('/api/bootstrap'));
    expect(boot.entries[0]).toMatchObject({ amount_pence: 1500, category_id: 14, date: '2026-06-06', note: 'fixed' });
  });
});

describe('categories management', () => {
  it('adds a category', async () => {
    const app = freshApp();
    const res = await app.request('/api/categories', json({ name: 'Gifts', group_id: 5, color: '#b15a48' }));
    expect(res.status).toBe(201);
    const boot = await body<Cats>(await app.request('/api/bootstrap'));
    expect(boot.categories.some((c) => c.name === 'Gifts')).toBe(true);
  });

  it('renames a category — history follows by id', async () => {
    const app = freshApp();
    await app.request('/api/entries', json({ amount_pence: 500, category_id: 14, date: '2026-06-01' }));
    const res = await app.request('/api/categories/14', patch({ name: 'Vapes' }));
    expect(res.status).toBe(200);
    const boot = await body<Cats & { entries: Array<{ category_id: number }> }>(await app.request('/api/bootstrap'));
    expect(boot.categories.find((c) => c.id === 14)?.name).toBe('Vapes');
    expect(boot.entries[0].category_id).toBe(14);
  });

  it('moves a category to another group', async () => {
    const app = freshApp();
    const res = await app.request('/api/categories/14', patch({ group_id: 3 }));
    expect(res.status).toBe(200);
    const boot = await body<Cats>(await app.request('/api/bootstrap'));
    expect(boot.categories.find((c) => c.id === 14)?.group_id).toBe(3);
  });

  it('refuses to delete a category in use without reassignment (inUse flag)', async () => {
    const app = freshApp();
    await app.request('/api/entries', json({ amount_pence: 500, category_id: 3, date: '2026-06-01' }));
    const res = await app.request('/api/categories/3', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const result = await body<{ deleted: boolean; inUse?: boolean }>(res);
    expect(result).toEqual({ deleted: false, inUse: true });
    const boot = await body<Cats>(await app.request('/api/bootstrap'));
    expect(boot.categories.some((c) => c.id === 3)).toBe(true); // not deleted
  });

  it('reassigns entries then deletes the category', async () => {
    const app = freshApp();
    await app.request('/api/entries', json({ amount_pence: 500, category_id: 3, date: '2026-06-01' }));
    const res = await app.request('/api/categories/3?reassignTo=4', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const boot = await body<Cats & { entries: Array<{ category_id: number }> }>(await app.request('/api/bootstrap'));
    expect(boot.categories.some((c) => c.id === 3)).toBe(false);
    expect(boot.entries[0].category_id).toBe(4);
  });

  it('deletes an unused category directly', async () => {
    const app = freshApp();
    const res = await app.request('/api/categories/15', { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});

describe('groups management', () => {
  it('refuses to delete a non-empty group (nonEmpty flag)', async () => {
    const app = freshApp();
    const res = await app.request('/api/groups/2', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await body<{ deleted: boolean; nonEmpty?: boolean }>(res)).toEqual({ deleted: false, nonEmpty: true });
  });

  it('adds then deletes an empty group', async () => {
    const app = freshApp();
    const created = await body<{ id: number }>(await app.request('/api/groups', json({ name: 'Travel Fund', color: '#6b7d5e' })));
    const del = await app.request(`/api/groups/${created.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
  });
});

describe('views management', () => {
  it('creates a view with hidden_category_ids', async () => {
    const app = freshApp();
    const res = await app.request('/api/views', json({ name: 'Excl. Rent', hidden_category_ids: [1] }));
    expect(res.status).toBe(201);
    const created = await body<{ id: number; name: string; hidden_category_ids: number[] }>(res);
    expect(created.name).toBe('Excl. Rent');
    expect(created.hidden_category_ids).toEqual([1]);
  });

  it('bootstrap reflects created views', async () => {
    const app = freshApp();
    await app.request('/api/views', json({ name: 'Excl. Rent', hidden_category_ids: [1] }));
    const boot = await body<{ views: Array<{ name: string }> }>(await app.request('/api/bootstrap'));
    expect(boot.views).toHaveLength(1);
    expect(boot.views[0].name).toBe('Excl. Rent');
  });

  it("updates a view's name and hidden_category_ids", async () => {
    const app = freshApp();
    const created = await body<{ id: number }>(await app.request('/api/views', json({ name: 'V1', hidden_category_ids: [] })));
    const res = await app.request(`/api/views/${created.id}`, patch({ name: 'V1 renamed', hidden_category_ids: [2, 3] }));
    expect(res.status).toBe(200);
    const updated = await body<{ name: string; hidden_category_ids: number[] }>(res);
    expect(updated.name).toBe('V1 renamed');
    expect(updated.hidden_category_ids).toEqual([2, 3]);
  });

  it('deletes a view', async () => {
    const app = freshApp();
    const created = await body<{ id: number }>(await app.request('/api/views', json({ name: 'V1', hidden_category_ids: [] })));
    const del = await app.request(`/api/views/${created.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(await body<{ deleted: boolean }>(del)).toEqual({ deleted: true });
    const boot = await body<{ views: unknown[] }>(await app.request('/api/bootstrap'));
    expect(boot.views).toEqual([]);
  });

  it('refuses a 5th view (cap of 4)', async () => {
    const app = freshApp();
    for (let i = 0; i < 4; i++) {
      const res = await app.request('/api/views', json({ name: `V${i}`, hidden_category_ids: [] }));
      expect(res.status).toBe(201);
    }
    const res = await app.request('/api/views', json({ name: 'V5', hidden_category_ids: [] }));
    expect(res.status).toBe(400);
  });
});

describe('income', () => {
  it('PUT upserts a month income; bootstrap reflects it', async () => {
    const app = freshApp();
    const res = await app.request('/api/income/2026/6', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount_pence: 250000 }) });
    expect(res.status).toBe(200);
    const boot = await body<{ income: Array<{ year: number; month: number; amount_pence: number }> }>(await app.request('/api/bootstrap'));
    expect(boot.income).toContainEqual({ year: 2026, month: 6, amount_pence: 250000 });
  });
});

describe('default income', () => {
  type BootDefault = { defaultIncomePence: number | null };

  it('is null in a fresh bootstrap', async () => {
    const app = freshApp();
    const boot = await body<BootDefault>(await app.request('/api/bootstrap'));
    expect(boot.defaultIncomePence).toBeNull();
  });

  it('PUT sets it and bootstrap reflects it; the month-income route is untouched', async () => {
    const app = freshApp();
    const res = await app.request('/api/income/default', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount_pence: 250000 }) });
    expect(res.status).toBe(200);
    const boot = await body<BootDefault & { income: unknown[] }>(await app.request('/api/bootstrap'));
    expect(boot.defaultIncomePence).toBe(250000);
    expect(boot.income).toEqual([]); // the default is NOT a monthly_income row
  });

  it('DELETE clears it', async () => {
    const app = freshApp();
    await app.request('/api/income/default', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount_pence: 250000 }) });
    const res = await app.request('/api/income/default', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const boot = await body<BootDefault>(await app.request('/api/bootstrap'));
    expect(boot.defaultIncomePence).toBeNull();
  });

  it('rejects an invalid amount', async () => {
    const app = freshApp();
    const res = await app.request('/api/income/default', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount_pence: -1 }) });
    expect(res.status).toBe(400);
  });
});

describe('input hardening', () => {
  it('rejects an oversized amount and stays queryable (no orphan row, no 500 brick)', async () => {
    const app = freshApp();
    const res = await app.request('/api/entries', json({ amount_pence: 2 ** 60, category_id: 3, date: '2026-06-06' }));
    expect(res.status).toBe(400);
    const boot = await app.request('/api/bootstrap');
    expect(boot.status).toBe(200);
    expect((await body<Boot>(boot)).entries).toEqual([]);
  });

  it('rejects a negative entry amount (no negative entries)', async () => {
    const app = freshApp();
    const res = await app.request('/api/entries', json({ amount_pence: -500, category_id: 3, date: '2026-06-06' }));
    expect(res.status).toBe(400);
  });

  it('rejects an impossible calendar date', async () => {
    const app = freshApp();
    const res = await app.request('/api/entries', json({ amount_pence: 500, category_id: 3, date: '2026-02-30' }));
    expect(res.status).toBe(400);
  });
});

const SALARY_BODY = {
  gross_yearly_pence: 5_946_600,
  net_monthly_pence: 335_995,
  hours_per_week: 37,
  work_weeks_per_year: 52,
  work_days_per_week: 5,
  employee_pension_pct: 5.45,
  employer_pension_pct: 28.97,
  personal_allowance_pence: 1_257_000,
  basic_rate_band_pence: 3_770_100,
  additional_rate_threshold_pence: 12_514_000,
  basic_rate_pct: 20,
  higher_rate_pct: 40,
  additional_rate_pct: 45,
  ni_lower_monthly_pence: 104_750,
  ni_upper_monthly_pence: 418_917,
  ni_primary_pct: 8,
  ni_upper_pct: 2,
  sl_enabled: true,
  sl_threshold_yearly_pence: 2_847_000,
  sl_rate_pct: 9,
  sl_balance_pence: null,
  sl_interest_rate_pct: null,
  note: null,
};

describe('salary config', () => {
  it('GET returns null config when no data exists', async () => {
    const app = freshApp();
    const res = await app.request('/api/salary-config/2026/6');
    expect(res.status).toBe(200);
    const data = await body<{ config: null; inheritedFrom: null }>(res);
    expect(data.config).toBeNull();
    expect(data.inheritedFrom).toBeNull();
  });

  it('PUT saves config and GET returns it; inheritedFrom is null for exact month', async () => {
    const app = freshApp();
    const putRes = await app.request('/api/salary-config/2026/6', put(SALARY_BODY));
    expect(putRes.status).toBe(200);

    const get = await app.request('/api/salary-config/2026/6');
    const data = await body<{ config: { year: number; month: number; gross_yearly_pence: number }; inheritedFrom: null }>(get);
    expect(data.config.year).toBe(2026);
    expect(data.config.month).toBe(6);
    expect(data.config.gross_yearly_pence).toBe(5_946_600);
    expect(data.inheritedFrom).toBeNull();
  });

  it('PUT round-trips extra_payment_pence (HTTP path must persist it, not drop it)', async () => {
    const app = freshApp();
    await app.request('/api/salary-config/2026/6', put({ ...SALARY_BODY, extra_payment_pence: 50_000 }));

    const get = await app.request('/api/salary-config/2026/6');
    const data = await body<{ config: { extra_payment_pence: number } }>(get);
    expect(data.config.extra_payment_pence).toBe(50_000);
  });

  it('PUT round-trips the student-loan VIR fields; omitted → off/null', async () => {
    const app = freshApp();
    await app.request('/api/salary-config/2026/6', put({
      ...SALARY_BODY,
      sl_vir_enabled: true, sl_vir_max_rate_pct: 6.2,
      sl_vir_lower_income_pence: 2_938_500, sl_vir_upper_income_pence: 5_288_500,
    }));

    const get = await app.request('/api/salary-config/2026/6');
    type VirConfig = {
      sl_vir_enabled: boolean; sl_vir_max_rate_pct: number | null;
      sl_vir_lower_income_pence: number | null; sl_vir_upper_income_pence: number | null;
    };
    const data = await body<{ config: VirConfig }>(get);
    expect(data.config.sl_vir_enabled).toBe(true);
    expect(data.config.sl_vir_max_rate_pct).toBe(6.2);
    expect(data.config.sl_vir_lower_income_pence).toBe(2_938_500);
    expect(data.config.sl_vir_upper_income_pence).toBe(5_288_500);

    await app.request('/api/salary-config/2026/7', put(SALARY_BODY));
    const plain = await body<{ config: VirConfig }>(await app.request('/api/salary-config/2026/7'));
    expect(plain.config.sl_vir_enabled).toBe(false);
    expect(plain.config.sl_vir_max_rate_pct).toBeNull();
    expect(plain.config.sl_vir_lower_income_pence).toBeNull();
    expect(plain.config.sl_vir_upper_income_pence).toBeNull();
  });

  it('PUT rejects invalid VIR values', async () => {
    const app = freshApp();
    const bad = await app.request('/api/salary-config/2026/6', put({ ...SALARY_BODY, sl_vir_max_rate_pct: 'nope' }));
    expect(bad.status).toBe(400);
    const badLower = await app.request('/api/salary-config/2026/6', put({ ...SALARY_BODY, sl_vir_lower_income_pence: 12.5 }));
    expect(badLower.status).toBe(400);
  });

  it('GET for later month inherits from saved earlier month', async () => {
    const app = freshApp();
    await app.request('/api/salary-config/2026/6', put(SALARY_BODY));

    const get = await app.request('/api/salary-config/2026/8');
    const data = await body<{ config: { gross_yearly_pence: number }; inheritedFrom: { year: number; month: number } }>(get);
    expect(data.config.gross_yearly_pence).toBe(5_946_600);
    expect(data.inheritedFrom).toEqual({ year: 2026, month: 6 });
  });

  it('GET for a month before the first-ever config is blank (no backward projection)', async () => {
    const app = freshApp();
    await app.request('/api/salary-config/2026/6', put(SALARY_BODY));

    const get = await app.request('/api/salary-config/2026/3');
    const data = await body<{ config: null; inheritedFrom: null; employmentStart: null }>(get);
    expect(data.config).toBeNull();
    expect(data.inheritedFrom).toBeNull();
    expect(data.employmentStart).toBeNull();
  });

  it('getSalaryYTD inherits an earlier-tax-year salary forward (no £0 decay)', async () => {
    const app = freshApp();
    await app.request('/api/salary-config/2026/6', put(SALARY_BODY)); // only TY 2026/27 saved

    const apr = await body<{ adjustedNetYTDPence: number; employmentStart: { year: number; month: number } }>(
      await app.request('/api/salary-ytd/2027/4'),
    );
    const sep = await body<{ adjustedNetYTDPence: number; employmentStart: { year: number; month: number } }>(
      await app.request('/api/salary-ytd/2027/9'),
    );
    expect(apr.employmentStart).toEqual({ year: 2027, month: 4 });
    expect(sep.employmentStart).toEqual({ year: 2027, month: 4 });
    expect(apr.adjustedNetYTDPence).toBeGreaterThan(0);
    // Six months accumulated (~6× the one-month figure), not the one-month value that
    // decayed PAYE to £0. Allow a few pence of per-month rounding drift.
    expect(sep.adjustedNetYTDPence).toBeGreaterThan(apr.adjustedNetYTDPence * 5);
    expect(sep.adjustedNetYTDPence).toBeLessThanOrEqual(apr.adjustedNetYTDPence * 6 + 100);
  });

  it('PUT writes net monthly pay to bootstrap income', async () => {
    const app = freshApp();
    await app.request('/api/salary-config/2026/6', put(SALARY_BODY));

    const boot = await body<{ income: Array<{ year: number; month: number; amount_pence: number }> }>(
      await app.request('/api/bootstrap'),
    );
    const incomeRow = boot.income.find((r) => r.year === 2026 && r.month === 6);
    expect(incomeRow).toBeDefined();
    expect(incomeRow!.amount_pence).toBeGreaterThan(0);
  });

  it('PUT rejects invalid gross', async () => {
    const app = freshApp();
    const res = await app.request('/api/salary-config/2026/6', put({ ...SALARY_BODY, gross_yearly_pence: -1 }));
    expect(res.status).toBe(400);
  });
});

describe('migrate', () => {
  it('drops the vestigial exclude_from_discretionary column from pre-existing databases', () => {
    const db = openDatabase(':memory:');
    // A pre-existing DB whose categories table still carries the dead column.
    db.exec(
      'CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, group_id INTEGER NOT NULL, sort_order INTEGER NOT NULL, color TEXT NOT NULL, exclude_from_discretionary INTEGER NOT NULL DEFAULT 0)',
    );
    migrate(db);
    const col = db
      .prepare("SELECT name FROM pragma_table_info('categories') WHERE name = 'exclude_from_discretionary'")
      .get();
    expect(col).toBeUndefined();
    seedIfEmpty(db);
    const cats = db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number };
    expect(cats.n).toBe(15);
  });
});

describe('recurring templates + monthly checklist', () => {
  type Template = { id: number; name: string; category_id: number; amount_pence: number; sort_order: number };
  type RecurringBoot = Boot & {
    recurringTemplates: Template[];
    recurringMonths: Array<{ template_id: number; month: string; entry_id: number | null }>;
  };
  const boot = async (app: ReturnType<typeof freshApp>) => body<RecurringBoot>(await app.request('/api/bootstrap'));

  it('creates, patches, and deletes a template; bootstrap carries both recurring arrays', async () => {
    const app = freshApp();
    expect((await boot(app)).recurringTemplates).toEqual([]);
    expect((await boot(app)).recurringMonths).toEqual([]);

    const post = await app.request('/api/recurring', json({ name: 'Rent', category_id: 1, amount_pence: 95000 }));
    expect(post.status).toBe(201);
    const t = await body<Template>(post);
    expect(t).toMatchObject({ name: 'Rent', category_id: 1, amount_pence: 95000, sort_order: 1 });

    const patch = await app.request(`/api/recurring/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount_pence: 97000 }),
    });
    expect(patch.status).toBe(200);
    expect((await body<Template>(patch)).amount_pence).toBe(97000);

    const del = await app.request(`/api/recurring/${t.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await boot(app)).recurringTemplates).toEqual([]);
  });

  it('rejects an invalid template and a patch to a missing id', async () => {
    const app = freshApp();
    expect((await app.request('/api/recurring', json({ name: '', category_id: 1, amount_pence: 1 }))).status).toBe(400);
    expect((await app.request('/api/recurring', json({ name: 'X', category_id: 1, amount_pence: -5 }))).status).toBe(400);
    const patch = await app.request('/api/recurring/999', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount_pence: 100 }),
    });
    expect(patch.status).toBe(404);
  });

  it('confirm writes an entry (category from the template) plus a month row', async () => {
    const app = freshApp();
    const t = await body<Template>(await app.request('/api/recurring', json({ name: 'Netflix', category_id: 12, amount_pence: 1099 })));

    const res = await app.request(`/api/recurring/${t.id}/confirm`, json({ amount_pence: 1199, date: '2026-07-03', note: 'Netflix' }));
    expect(res.status).toBe(201);
    const entry = await body<Entry & { category_id: number }>(res);
    expect(entry.amount_pence).toBe(1199);
    expect(entry.category_id).toBe(12);

    const b = await boot(app);
    expect(b.entries).toHaveLength(1);
    expect(b.recurringMonths).toEqual([{ template_id: t.id, month: '2026-07', entry_id: entry.id }]);
  });

  it('re-confirming an already-confirmed month is rejected (no orphaned double count)', async () => {
    const app = freshApp();
    const t = await body<Template>(await app.request('/api/recurring', json({ name: 'Rent', category_id: 1, amount_pence: 95000 })));
    await app.request(`/api/recurring/${t.id}/confirm`, json({ amount_pence: 95000, date: '2026-07-01', note: null }));
    const again = await app.request(`/api/recurring/${t.id}/confirm`, json({ amount_pence: 95000, date: '2026-07-02', note: null }));
    expect(again.status).toBe(409);
    expect((await boot(app)).entries).toHaveLength(1);
  });

  it('confirming a skipped month upgrades the row to confirmed', async () => {
    const app = freshApp();
    const t = await body<Template>(await app.request('/api/recurring', json({ name: 'Rent', category_id: 1, amount_pence: 95000 })));
    await app.request(`/api/recurring/${t.id}/skip/2026-07`, { method: 'PUT' });
    const res = await app.request(`/api/recurring/${t.id}/confirm`, json({ amount_pence: 95000, date: '2026-07-01', note: null }));
    expect(res.status).toBe(201);
    const b = await boot(app);
    expect(b.recurringMonths).toHaveLength(1);
    expect(b.recurringMonths[0].entry_id).not.toBeNull();
  });

  it('deleting the confirmed entry cascades the month row back to due', async () => {
    const app = freshApp();
    const t = await body<Template>(await app.request('/api/recurring', json({ name: 'Rent', category_id: 1, amount_pence: 95000 })));
    const entry = await body<Entry>(await app.request(`/api/recurring/${t.id}/confirm`, json({ amount_pence: 95000, date: '2026-07-01', note: null })));
    await app.request(`/api/entries/${entry.id}`, { method: 'DELETE' });
    const b = await boot(app);
    expect(b.entries).toEqual([]);
    expect(b.recurringMonths).toEqual([]);
  });

  it('skip / unskip round-trips and validates the month', async () => {
    const app = freshApp();
    const t = await body<Template>(await app.request('/api/recurring', json({ name: 'Rent', category_id: 1, amount_pence: 95000 })));
    expect((await app.request(`/api/recurring/${t.id}/skip/2026-13`, { method: 'PUT' })).status).toBe(400);
    await app.request(`/api/recurring/${t.id}/skip/2026-07`, { method: 'PUT' });
    expect((await boot(app)).recurringMonths).toEqual([{ template_id: t.id, month: '2026-07', entry_id: null }]);
    await app.request(`/api/recurring/${t.id}/skip/2026-07`, { method: 'DELETE' });
    expect((await boot(app)).recurringMonths).toEqual([]);
  });

  it('deleting a category in use by a template reassigns the template', async () => {
    const app = freshApp();
    const t = await body<Template>(await app.request('/api/recurring', json({ name: 'Water', category_id: 2, amount_pence: 3200 })));
    const del = await app.request('/api/categories/2?reassignTo=3', { method: 'DELETE' });
    expect(await body<{ deleted: boolean }>(del)).toEqual({ deleted: true });
    const b = await boot(app);
    expect(b.recurringTemplates.find((x) => x.id === t.id)!.category_id).toBe(3);
  });
});
