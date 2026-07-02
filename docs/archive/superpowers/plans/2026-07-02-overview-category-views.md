# Overview category/group show-hide + saved Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four duplicated, Rent-only "incl./excl. Rent" toggles across Overview
(This-month total, running chart, by-group donut, comparison bars, trends matrix) with one shared
category/group hide filter, plus a new saved-preset **View** entity manageable from Manage.

**Architecture:** A single `hiddenCategoryIds: Set<number>` lives in `App.tsx` and is threaded
down as a prop to every Overview summary surface; `packages/core`'s `TotalOptions` generalizes
from a `excludeRent: boolean` to `excludedCategoryIds: ReadonlySet<number>`. A new `views` table
(id, name, sort_order, `hidden_category_ids` JSON text) stores named snapshots of that same set,
CRUD'd through the existing DataPort pattern on both the web (HTTP/`apps/api`) and desktop
(Tauri/rusqlite) paths — riding the desktop path's existing generic `sql_select`/`sql_execute`
commands since these are single-statement operations, no new Rust command required.

**Tech Stack:** TypeScript, React, Hono (API), node:sqlite (API + tests), Tauri v2 SQL plugin +
rusqlite (desktop), Vitest, Rust/cargo test.

## Global Constraints

- Net Balance (`monthNet`/`averageNet` in `packages/core/src/netBalance.ts`) is **never** filtered
  by `hiddenCategoryIds` — it always includes everything. Do not add an `excludedCategoryIds`
  parameter to `monthNet`/`averageNet`/`income`.
- Max 4 Views (5 buttons total including "All"), enforced both server-side (`repo.ts`/`queries.ts`
  throw past the cap) and client-side (the "+ add view" UI hides once at the cap).
- `hidden_category_ids` is category-id-only — no separate group-id tracking anywhere. A "hide
  group" action is a bulk toggle over that group's *current* category ids, not persisted state of
  its own.
- This repo has no React component test suite (`grep -rl testing-library` returns nothing) — UI
  component tasks in this plan have no test step; they're verified via `npm run typecheck` /
  `npm run lint` and a manual `/run`-driven check in the final task, consistent with how existing
  untested components (`RunningChart`, `TrendsMatrix`, etc.) already work in this codebase.
- Every new `DataPort` method (`createView`/`updateView`/`deleteView`) must be implemented on
  **both** the web path (`apps/web/src/data/http.ts` → `apps/api` route + `repo.ts`) and the
  desktop path (`apps/web/src/data/queries.ts`), per this repo's web/desktop sync rule.

---

## Task 1: Core — generalize `TotalOptions` from `excludeRent` to `excludedCategoryIds`

**Files:**
- Modify: `packages/core/src/ledger.ts:35-84`
- Test: `packages/core/src/ledger.test.ts:48-70,99-105`

**Interfaces:**
- Produces: `TotalOptions = { excludedCategoryIds?: ReadonlySet<number> }`; `monthTotal(data, ym, options?)` and `runningCumulative(data, ym, options?)` both default to **no exclusions** when `options.excludedCategoryIds` is omitted (this is a behavior change for `runningCumulative`, which previously defaulted to excluding Rent).

- [ ] **Step 1: Update the test file with the new option shape**

Replace the `monthTotal` describe block (lines 48-56) with:

```ts
describe('monthTotal', () => {
  it('includes everything by default', () => {
    expect(monthTotal(makeData(), '2026-06')).toBe(127500);
  });

  it('drops the given category ids when excludedCategoryIds is set', () => {
    expect(monthTotal(makeData(), '2026-06', { excludedCategoryIds: new Set([10]) })).toBe(7500);
  });
});
```

Replace the `runningCumulative (always ex-Rent)` describe block (lines 58-70) with:

```ts
describe('runningCumulative', () => {
  it('produces one cumulative point per spend date, sorted, with no exclusions by default', () => {
    const points = runningCumulative(makeData(), '2026-06');
    expect(points).toEqual([
      { date: '2026-06-01', cumulativePence: 120000 },
      { date: '2026-06-03', cumulativePence: 125500 },
      { date: '2026-06-10', cumulativePence: 127500 },
    ]);
  });

  it('excludes the given category ids (e.g. Rent)', () => {
    const points = runningCumulative(makeData(), '2026-06', { excludedCategoryIds: new Set([10]) });
    expect(points).toEqual([
      { date: '2026-06-03', cumulativePence: 5500 },
      { date: '2026-06-10', cumulativePence: 7500 },
    ]);
  });

  it('is empty for a month with no spend', () => {
    expect(runningCumulative(makeData(), '2026-04')).toEqual([]);
  });
});
```

In the `with itemised lists` describe block, replace the test at lines 99-105
(`includes list spend (ex-Rent) in the running cumulative on the list date`) with:

```ts
  it('excludes the given category ids in the running cumulative on the list date', () => {
    expect(runningCumulative(dataWithList(), '2026-06', { excludedCategoryIds: new Set([10]) })).toEqual([
      { date: '2026-06-03', cumulativePence: 5500 },
      { date: '2026-06-05', cumulativePence: 6100 },
      { date: '2026-06-10', cumulativePence: 8100 },
    ]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/ledger.test.ts`
Expected: FAIL — `excludedCategoryIds` isn't recognized by the current implementation (it still
reads `options.excludeRent`), so exclusions never apply and totals come back un-filtered.

- [ ] **Step 3: Implement the new option shape**

In `packages/core/src/ledger.ts`, replace lines 35-84 with:

```ts
export type TotalOptions = { excludedCategoryIds?: ReadonlySet<number> };

const EMPTY_SET: ReadonlySet<number> = new Set();

export function monthTotal(data: LedgerData, ym: string, options: TotalOptions = {}): number {
  const excluded = options.excludedCategoryIds ?? EMPTY_SET;
  let total = 0;
  for (const [categoryId, pence] of categoryTotals(data, ym)) {
    if (excluded.has(categoryId)) continue;
    total += pence;
  }
  return total;
}

export type CumulativePoint = { date: string; cumulativePence: number };

export function runningCumulative(data: LedgerData, ym: string, options: TotalOptions = {}): CumulativePoint[] {
  const excluded = options.excludedCategoryIds ?? EMPTY_SET;

  const byDate = new Map<string, number>();
  for (const entry of data.entries) {
    if (ymOf(entry.date) !== ym) continue;
    if (excluded.has(entry.category_id)) continue;
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.amount_pence);
  }
  for (const list of data.lists) {
    if (ymOf(list.date) !== ym) continue;
    let pence = 0;
    for (const [categoryId, p] of listCategorySubtotals(list)) {
      if (excluded.has(categoryId)) continue;
      pence += p;
    }
    if (pence !== 0) byDate.set(list.date, (byDate.get(list.date) ?? 0) + pence);
  }

  let running = 0;
  return [...byDate.keys()]
    .sort()
    .map((date) => {
      running += byDate.get(date) ?? 0;
      return { date, cumulativePence: running };
    });
}
```

(This deletes the old private `excludedCategoryIds(data, excludeRent)` boolean-driven helper
entirely — it's no longer needed since callers now pass the id set directly.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/ledger.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ledger.ts packages/core/src/ledger.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): generalize TotalOptions from excludeRent to excludedCategoryIds

Prepares monthTotal/runningCumulative for the Overview category filter,
which will hide arbitrary categories/groups, not just Rent.
EOF
)"
```

---

## Task 2: Core — add the `View` type

**Files:**
- Modify: `packages/core/src/types.ts`

**Interfaces:**
- Consumes: nothing (pure type addition).
- Produces: `View = { id: number; name: string; sort_order: number; hidden_category_ids: number[] }`; `LedgerData.views: View[]`. Task 3 and Task 4 both depend on this.

- [ ] **Step 1: Add the type**

In `packages/core/src/types.ts`, immediately after the `MonthlyIncome` type (line 55) and before
the `LedgerData` type (line 58), insert:

```ts
// A named, saved snapshot of Overview's category-hide filter (not a per-category tag —
// hidden_category_ids is that View's own copy of which category ids are hidden).
export type View = {
  id: number;
  name: string;
  sort_order: number;
  hidden_category_ids: number[];
};
```

Then update the `LedgerData` type (currently lines 58-67) to add a `views` field:

```ts
export type LedgerData = {
  groups: Group[];
  categories: Category[];
  entries: Entry[];
  lists: BudgetList[];
  income: MonthlyIncome[];
  views: View[];
  // Optional default monthly income: fills the current and future months that have no
  // explicit figure (never a past one). null when no default is set.
  defaultIncomePence: number | null;
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w @budget/core`
Expected: FAIL — every other package building against `LedgerData` (test fixtures in
`ledger.test.ts`, `netBalance.test.ts`) is missing the new required `views` field.

- [ ] **Step 3: Add `views: []` to the existing test fixtures**

In `packages/core/src/ledger.test.ts`, add `views: [],` to the `makeData()` return object (after
`lists: [],` — Task 1 already left `lists: [],` in this fixture; the file also has a second
literal `LedgerData` object in the `averageNet` "no activity" test). Do the same in
`packages/core/src/netBalance.test.ts`'s `makeData()` and its inline `LedgerData` literal in the
"rounds the mean" test.

- [ ] **Step 4: Typecheck again**

Run: `npm run typecheck -w @budget/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/ledger.test.ts packages/core/src/netBalance.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add the View type (a named, saved category-hide preset)

LedgerData.views — populated by the new views table, consumed by the
Overview filter's preset buttons.
EOF
)"
```

---

## Task 3: Web path — Views CRUD (schema, repo, HTTP routes, HTTP client)

**Files:**
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/repo.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/app.test.ts`
- Modify: `apps/web/src/data/port.ts`
- Modify: `apps/web/src/data/http.ts`
- Modify: `apps/web/src/data/index.ts`

**Interfaces:**
- Consumes: `View` type from Task 2.
- Produces: `DataPort.createView(input: { name: string; hidden_category_ids: number[] }): Promise<View>`, `DataPort.updateView(id: number, patch: { name?: string; hidden_category_ids?: number[] }): Promise<View>`, `DataPort.deleteView(id: number): Promise<{ deleted: boolean }>`. `LedgerData.views` is populated by `GET /api/bootstrap`. Task 4 implements the same `DataPort` methods for the desktop path. Task 6-8 (UI) call these through `apps/web/src/api.ts`.

- [ ] **Step 1: Write failing API tests**

In `apps/api/src/app.test.ts`, add this new describe block after the `groups management` block
(after line 249):

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/app.test.ts`
Expected: FAIL — `POST /api/views` doesn't exist yet, so Hono returns 404 for every request in
the new describe block.

- [ ] **Step 3: Add the `views` table to the schema**

In `apps/api/src/db/schema.sql`, insert this table after the `settings` table (after line 68, before
the `CREATE INDEX` block):

```sql
-- Saved show/hide presets for Overview's category filter. A lightweight UI convenience, not
-- a relational entity — hidden_category_ids is a JSON-encoded array of category ids, so no
-- junction table. Capped at 4 rows (enforced in the application layer).
CREATE TABLE IF NOT EXISTS views (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  sort_order          INTEGER NOT NULL,
  hidden_category_ids TEXT NOT NULL DEFAULT '[]'
);
```

- [ ] **Step 4: Add repo functions**

In `apps/api/src/repo.ts`, change the top import to include `View`:

```ts
import { computeSalaryYTD, resolveEmploymentStart, type SalaryYTD, type View, type YTDConfigRow } from '@budget/core';
```

Add this block after `deleteGroup` (after line 313, before `reorderGroups`):

```ts
// ── Manage: views ─────────────────────────────────────────────────────────────
type ViewRow = { id: number; name: string; sort_order: number; hidden_category_ids: string };
const MAX_VIEWS = 4;

function rowToView(row: ViewRow): View {
  return { ...row, hidden_category_ids: JSON.parse(row.hidden_category_ids) as number[] };
}

export function getViews(db: DatabaseSync): View[] {
  const rows = db
    .prepare('SELECT id, name, sort_order, hidden_category_ids FROM views ORDER BY sort_order, id')
    .all() as ViewRow[];
  return rows.map(rowToView);
}

export function getView(db: DatabaseSync, id: number): View | undefined {
  const row = db
    .prepare('SELECT id, name, sort_order, hidden_category_ids FROM views WHERE id = ?')
    .get(id) as ViewRow | undefined;
  return row ? rowToView(row) : undefined;
}

export function createView(db: DatabaseSync, input: { name: string; hidden_category_ids: number[] }): View {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM views').get() as { n: number };
  if (n >= MAX_VIEWS) throw new Error(`cannot have more than ${MAX_VIEWS} views`);
  const { m } = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM views').get() as { m: number };
  const { lastInsertRowid } = db
    .prepare('INSERT INTO views (name, sort_order, hidden_category_ids) VALUES (?, ?, ?)')
    .run(input.name, m + 1, JSON.stringify(input.hidden_category_ids));
  return getView(db, Number(lastInsertRowid))!;
}

export function updateView(
  db: DatabaseSync,
  id: number,
  patch: { name?: string; hidden_category_ids?: number[] },
): View | undefined {
  const existing = getView(db, id);
  if (!existing) return undefined;
  db.prepare('UPDATE views SET name = ?, hidden_category_ids = ? WHERE id = ?').run(
    patch.name ?? existing.name,
    JSON.stringify(patch.hidden_category_ids ?? existing.hidden_category_ids),
    id,
  );
  return getView(db, id);
}

export function deleteView(db: DatabaseSync, id: number): { deleted: boolean } {
  const { changes } = db.prepare('DELETE FROM views WHERE id = ?').run(id);
  return { deleted: Number(changes) > 0 };
}
```

Then update `getBootstrap` (lines 6-51) to include views — change the returned object (lines
43-50) to:

```ts
  return {
    groups,
    categories,
    entries,
    lists: listsWithItems,
    income,
    views: getViews(db),
    defaultIncomePence: getDefaultIncome(db),
  };
```

- [ ] **Step 5: Add HTTP routes**

In `apps/api/src/app.ts`, replace the import block from `./repo.ts` (lines 4-34) with:

```ts
import {
  createCategory,
  createEntry,
  createGroup,
  createList,
  createView,
  clearDefaultIncome,
  deleteCategory,
  deleteEntry,
  deleteGroup,
  deleteIncome,
  deleteList,
  deleteView,
  getBootstrap,
  getGroup,
  getList,
  deleteSalaryConfig,
  getAllSalaryConfigs,
  getSalaryConfig,
  getSalaryYTD,
  setDefaultIncome,
  setIncome,
  updateCategory,
  updateEntry,
  updateGroup,
  updateList,
  updateView,
  upsertSalaryConfig,
  reorderCategories,
  reorderGroups,
  type EntryPatch,
  type NewList,
  type NewListItem,
} from './repo.ts';
```

Add these routes after the `DELETE /groups/:id` route (after line 280, before the `// ── Income`
comment):

```ts
  api.post('/views', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const name = String(body.name ?? '').trim();
    if (name === '') return c.json({ error: 'invalid view' }, 400);
    const hiddenCategoryIds = Array.isArray(body.hidden_category_ids)
      ? (body.hidden_category_ids as unknown[]).map(Number)
      : [];
    if (hiddenCategoryIds.some((id) => !Number.isInteger(id))) {
      return c.json({ error: 'invalid hidden_category_ids' }, 400);
    }
    try {
      return c.json(createView(db, { name, hidden_category_ids: hiddenCategoryIds }), 201);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.patch('/views/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const p: { name?: string; hidden_category_ids?: number[] } = {};
    if ('name' in body) {
      const n = String(body.name ?? '').trim();
      if (n === '') return c.json({ error: 'invalid name' }, 400);
      p.name = n;
    }
    if ('hidden_category_ids' in body) {
      if (!Array.isArray(body.hidden_category_ids)) return c.json({ error: 'invalid hidden_category_ids' }, 400);
      const ids = (body.hidden_category_ids as unknown[]).map(Number);
      if (ids.some((n) => !Number.isInteger(n))) return c.json({ error: 'invalid hidden_category_ids' }, 400);
      p.hidden_category_ids = ids;
    }
    const updated = updateView(db, id, p);
    if (!updated) return c.json({ error: 'not found' }, 404);
    return c.json(updated);
  });

  api.delete('/views/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    return c.json(deleteView(db, id));
  });

```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/app.test.ts`
Expected: PASS (all tests green, including the pre-existing ones).

- [ ] **Step 7: Add the client-side DataPort interface and HTTP implementation**

In `apps/web/src/data/port.ts`, change the top import to include `View`:

```ts
import type {
  BudgetList, Category, Entry, Group, LedgerData,
  MonthlyIncome, SalaryConfig, SalaryConfigResponse, SalaryYTD, View,
} from '@budget/core';
```

Add these three lines to the `DataPort` interface, after `reorderCategories` (after line 50):

```ts
  createView(input: { name: string; hidden_category_ids: number[] }): Promise<View>;
  updateView(id: number, patch: { name?: string; hidden_category_ids?: number[] }): Promise<View>;
  deleteView(id: number): Promise<{ deleted: boolean }>;
```

In `apps/web/src/data/http.ts`, change the top import to include `View`:

```ts
import type { BudgetList, Category, Entry, Group, LedgerData, MonthlyIncome, SalaryConfig, SalaryConfigResponse, SalaryYTD, View } from '@budget/core';
```

Add these functions after `reorderCategories` (after line 94):

```ts
export const createView = (input: { name: string; hidden_category_ids: number[] }) =>
  send<View>('views', 'POST', input);

export const updateView = (id: number, patch: { name?: string; hidden_category_ids?: number[] }) =>
  send<View>(`views/${id}`, 'PATCH', patch);

export const deleteView = (id: number) =>
  send<{ deleted: boolean }>(`views/${id}`, 'DELETE');
```

Update the `httpPort` object at the bottom of the file to include the three new functions:

```ts
export const httpPort: DataPort = {
  fetchBootstrap, createEntry, updateEntry, deleteEntry, createList, updateList, deleteList,
  createCategory, updateCategory, deleteCategory, createGroup, updateGroup, deleteGroup,
  reorderGroups, reorderCategories, setIncome, deleteIncome, setDefaultIncome,
  clearDefaultIncome, getSalaryConfig, getSalaryYTD, saveSalaryConfig, deleteSalaryConfig,
  getAllSalaryConfigs, createView, updateView, deleteView,
};
```

- [ ] **Step 8: Re-export from the runtime-selected adapter**

In `apps/web/src/data/index.ts`, update the destructured re-export at the bottom to include the
three new functions:

```ts
export const {
  fetchBootstrap, createEntry, updateEntry, deleteEntry, createList, updateList, deleteList,
  createCategory, updateCategory, deleteCategory, createGroup, updateGroup, deleteGroup,
  reorderGroups, reorderCategories, setIncome, deleteIncome, setDefaultIncome,
  clearDefaultIncome, getSalaryConfig, getSalaryYTD, saveSalaryConfig, deleteSalaryConfig,
  getAllSalaryConfigs, createView, updateView, deleteView,
} = dataPort;
```

- [ ] **Step 9: Typecheck the web app** (it won't fully pass yet — `queries.ts`, from Task 4,
still needs to implement the same interface — but confirm the *only* new errors are in
`queries.ts`/`makeSqlPort`, not in `port.ts`/`http.ts`/`index.ts` themselves)

Run: `npm run typecheck -w @budget/web`
Expected: FAIL, with errors confined to `apps/web/src/data/queries.ts` (`makeSqlPort` doesn't
satisfy the `DataPort` interface yet — that's Task 4).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/db/schema.sql apps/api/src/repo.ts apps/api/src/app.ts apps/api/src/app.test.ts apps/web/src/data/port.ts apps/web/src/data/http.ts apps/web/src/data/index.ts
git commit -m "$(cat <<'EOF'
feat(api): add View CRUD (web path) — saved category-hide presets

New views table (JSON-encoded hidden_category_ids, capped at 4 rows),
repo functions, HTTP routes, and the client-side DataPort/http.ts pair.
Desktop path lands separately per the web/desktop sync rule.
EOF
)"
```

---

## Task 4: Desktop path — Views CRUD (queries.ts)

**Files:**
- Modify: `apps/web/src/data/queries.ts`
- Test: `apps/web/src/data/queries.test.ts`

**Interfaces:**
- Consumes: `View` type (Task 2); `DataPort` interface (Task 3, `port.ts`).
- Produces: the same three `DataPort` methods as Task 3, implemented against `SqlExecutor` — the
  desktop (Tauri SQL plugin) and the Vitest `node:sqlite` executor share this one implementation.

- [ ] **Step 1: Write a failing test**

In `apps/web/src/data/queries.test.ts`, add this test after the `group create / update / delete`
test (after line 92):

```ts
test('view create / update / delete, and refuses a 5th view (cap of 4)', async () => {
  const { port } = freshPort();
  const v = await port.createView({ name: 'Excl. Rent', hidden_category_ids: [1] });
  expect(v.name).toBe('Excl. Rent');
  expect(v.hidden_category_ids).toEqual([1]);

  const u = await port.updateView(v.id, { hidden_category_ids: [1, 2] });
  expect(u.hidden_category_ids).toEqual([1, 2]);

  expect(await port.deleteView(v.id)).toEqual({ deleted: true });
  expect((await port.fetchBootstrap()).views).toEqual([]);

  for (let i = 0; i < 4; i++) await port.createView({ name: `V${i}`, hidden_category_ids: [] });
  await expect(port.createView({ name: 'V5', hidden_category_ids: [] })).rejects.toThrow();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/data/queries.test.ts -t "view create"`
Expected: FAIL — `port.createView` doesn't exist on the object returned by `makeSqlPort` yet
(TypeScript error at the call site, or a runtime "not a function" if types are loose at the test
boundary).

- [ ] **Step 3: Implement the desktop-path port methods**

In `apps/web/src/data/queries.ts`, change the top import to include `View`:

```ts
import type { BudgetList, Category, Entry, Group, LedgerData, SalaryConfig, View } from '@budget/core';
```

Add a `getView` helper and a `ViewRow`/`rowToView` pair near the other `get*` helpers, after
`getGroup` (after line 22):

```ts
  type ViewRow = { id: number; name: string; sort_order: number; hidden_category_ids: string };
  const rowToView = (row: ViewRow): View => ({ ...row, hidden_category_ids: JSON.parse(row.hidden_category_ids) as number[] });

  const getView = async (id: number): Promise<View | undefined> => {
    const rows = await exec.select<ViewRow>('SELECT id, name, sort_order, hidden_category_ids FROM views WHERE id = $1', [id]);
    return rows[0] ? rowToView(rows[0]) : undefined;
  };
```

In `fetchBootstrap` (the `port` object's first method), add a views query and include it in the
returned object. Change lines 44-73 to:

```ts
    async fetchBootstrap() {
      const groups = await exec.select<Group>('SELECT id, name, sort_order, color FROM groups ORDER BY sort_order, id');
      const categories = await exec.select<Category>(
        'SELECT id, name, group_id, sort_order, color, exclude_from_discretionary FROM categories ORDER BY sort_order, id',
      );
      const entries = await exec.select<Entry>(
        'SELECT id, amount_pence, category_id, date, note, created_at FROM entries ORDER BY date, created_at, id',
      );
      const baseLists = await exec.select<Omit<BudgetList, 'items'>>(
        `SELECT id, date, note, delivery_fee_pence, delivery_share_pct, delivery_category_id, created_at
         FROM lists ORDER BY date, created_at, id`,
      );
      const lists: BudgetList[] = [];
      for (const l of baseLists) {
        const items = await exec.select(
          `SELECT id, list_id, name, price_pence, quantity, share_pct, category_id, sort_order
           FROM list_items WHERE list_id = $1 ORDER BY sort_order, id`,
          [l.id],
        );
        lists.push({ ...l, items } as BudgetList);
      }
      const income = await exec.select('SELECT year, month, amount_pence FROM monthly_income ORDER BY year, month');
      const viewRows = await exec.select<ViewRow>('SELECT id, name, sort_order, hidden_category_ids FROM views ORDER BY sort_order, id');
      const views = viewRows.map(rowToView);
      const def = await exec.select<{ value: string }>("SELECT value FROM settings WHERE key = 'default_income_pence'");
      let defaultIncomePence: number | null = null;
      if (def[0]) {
        const n = Number(def[0].value);
        defaultIncomePence = Number.isSafeInteger(n) ? n : null;
      }
      return { groups, categories, entries, lists, income, views, defaultIncomePence } as LedgerData;
    },
```

Add the three port methods after `deleteGroup` (after line 174, before `reorderGroups`):

```ts
    async createView(input) {
      const countRows = await exec.select<{ n: number }>('SELECT COUNT(*) AS n FROM views');
      if (countRows[0].n >= 4) throw new Error('cannot have more than 4 views');
      const m = (await exec.select<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM views'))[0].m;
      const r = await exec.execute('INSERT INTO views (name, sort_order, hidden_category_ids) VALUES ($1, $2, $3)', [
        input.name,
        m + 1,
        JSON.stringify(input.hidden_category_ids),
      ]);
      return (await getView(r.lastInsertId))!;
    },

    async updateView(id, patch) {
      const ex = await getView(id);
      if (!ex) throw new Error(`view ${id} not found`);
      await exec.execute('UPDATE views SET name = $1, hidden_category_ids = $2 WHERE id = $3', [
        patch.name ?? ex.name,
        JSON.stringify(patch.hidden_category_ids ?? ex.hidden_category_ids),
        id,
      ]);
      return (await getView(id))!;
    },

    async deleteView(id) {
      const r = await exec.execute('DELETE FROM views WHERE id = $1', [id]);
      return { deleted: r.rowsAffected > 0 };
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/data/queries.test.ts -t "view create"`
Expected: PASS.

- [ ] **Step 5: Run the full queries test file and full web typecheck**

Run: `npx vitest run apps/web/src/data/queries.test.ts && npm run typecheck -w @budget/web`
Expected: PASS — `makeSqlPort` now fully satisfies `DataPort`, so the Task 3 Step 9 typecheck
failure is gone.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/data/queries.ts apps/web/src/data/queries.test.ts
git commit -m "$(cat <<'EOF'
feat(desktop): add View CRUD (desktop path) — completes the sync pair

Rides the existing generic sql_select/sql_execute Tauri commands (same
pattern as Group CRUD) — no new Rust command needed since these are
single-statement operations.
EOF
)"
```

---

## Task 5: Rust — sanity-check the `views` table migrates correctly

**Files:**
- Modify: `apps/desktop/src-tauri/src/db.rs`

**Interfaces:**
- Consumes: `apps/api/src/db/schema.sql` (Task 3's `CREATE TABLE views`), picked up automatically
  via `include_str!` (`db.rs:15`) — no Rust code changes needed for the table itself, only a test.

- [ ] **Step 1: Write a failing test**

In `apps/desktop/src-tauri/src/db.rs`, inside the `#[cfg(test)] mod tests` block, add this test
after `migrate_is_idempotent_and_seeds_taxonomy` (after line 375):

```rust
    #[test]
    fn migrate_creates_the_views_table() {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        let (n, _) = execute(&c, "INSERT INTO views (name, sort_order, hidden_category_ids) VALUES ($1, $2, $3)", &[json!("Excl. Rent"), json!(1), json!("[1]")]).unwrap();
        assert_eq!(n, 1);
        let rows = select(&c, "SELECT hidden_category_ids AS h FROM views", &[]).unwrap();
        assert_eq!(rows[0]["h"].as_str().unwrap(), "[1]");
    }
```

- [ ] **Step 2: Run the test to verify it passes immediately**

Run: `cd apps/desktop/src-tauri && cargo test migrate_creates_the_views_table`
Expected: PASS on the first run, with no production code change — this is not red-green TDD.
The schema is single-sourced from `apps/api/src/db/schema.sql` via `include_str!` (`db.rs:15`), so
Task 3's `CREATE TABLE views` (already committed, since Task 3 runs before this one) is already
picked up by `migrate()`. This task exists purely to add regression coverage on the Rust side,
matching how `migrate_is_idempotent_and_seeds_taxonomy` already covers `groups`/`categories` — if
a future schema refactor ever broke `views` migrating cleanly, this is the test that would catch
it.

- [ ] **Step 3: Run the full db.rs test suite to confirm nothing else broke**

Run: `cd apps/desktop/src-tauri && cargo test`
Expected: PASS (every test in `db.rs`, including the new one).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/db.rs
git commit -m "$(cat <<'EOF'
test(desktop): cover the views table migrating into a fresh Rust DB
EOF
)"
```

---

## Task 6: UI — shared `CategoryVisibilityChecklist` component

**Files:**
- Create: `apps/web/src/components/CategoryVisibilityChecklist.tsx`

**Interfaces:**
- Consumes: `LedgerData` (for `data.groups`/`data.categories`).
- Produces: `CategoryVisibilityChecklist({ data, hiddenCategoryIds, onChange })` — a controlled
  component. Task 7 (Overview) and Task 8 (Manage's View editor) both render it with different
  state (live session state vs. a draft being edited).

No test step — this repo has no component test suite (see Global Constraints); verified via
typecheck now and manual `/run` in Task 9.

- [ ] **Step 1: Create the component**

```tsx
import type { LedgerData } from '@budget/core';

// Controlled: the caller owns `hiddenCategoryIds` and re-renders on `onChange`. Used both for
// Overview's live ad hoc filter and for editing a saved View's draft snapshot in Manage.
export function CategoryVisibilityChecklist({
  data,
  hiddenCategoryIds,
  onChange,
}: {
  data: LedgerData;
  hiddenCategoryIds: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const toggleCategory = (id: number) => {
    const next = new Set(hiddenCategoryIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  // A group checkbox is a bulk action over its *current* category ids — there is no separate
  // persisted "this group is hidden" state (see Global Constraints).
  const toggleGroup = (groupId: number) => {
    const catIds = data.categories.filter((c) => c.group_id === groupId).map((c) => c.id);
    const allShown = catIds.every((id) => !hiddenCategoryIds.has(id));
    const next = new Set(hiddenCategoryIds);
    catIds.forEach((id) => (allShown ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  return (
    <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border border-hairline bg-panel p-3">
      {data.groups.map((g) => {
        const cats = data.categories.filter((c) => c.group_id === g.id);
        const shownCount = cats.filter((c) => !hiddenCategoryIds.has(c.id)).length;
        const groupChecked = shownCount === cats.length;
        const groupIndeterminate = shownCount > 0 && shownCount < cats.length;
        return (
          <div key={g.id}>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={groupChecked}
                ref={(el) => {
                  if (el) el.indeterminate = groupIndeterminate;
                }}
                onChange={() => toggleGroup(g.id)}
              />
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} />
              <span className="font-medium">{g.name}</span>
            </label>
            <div className="ml-6 flex flex-col gap-1 pt-1">
              {cats.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-ink-muted">
                  <input type="checkbox" checked={!hiddenCategoryIds.has(c.id)} onChange={() => toggleCategory(c.id)} />
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: c.color }} />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {hiddenCategoryIds.size > 0 && (
        <button
          type="button"
          className="mt-1 self-start text-xs text-ink-muted transition-colors hover:text-accent"
          onClick={() => onChange(new Set())}
        >
          Show all
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w @budget/web`
Expected: PASS (this file has no consumers yet, so it can only fail on its own syntax/types).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/CategoryVisibilityChecklist.tsx
git commit -m "$(cat <<'EOF'
feat(web): add the shared CategoryVisibilityChecklist component

Groups with nested category checkboxes, tri-state group checkbox
(bulk-toggles its current members). Reused by Overview's ad hoc filter
and Manage's View editor.
EOF
)"
```

---

## Task 7: UI — wire the shared filter into Overview (App.tsx + all summary surfaces)

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/OverviewMonth.tsx`
- Modify: `apps/web/src/charts/RunningChart.tsx`
- Modify: `apps/web/src/charts/GroupingDonut.tsx`
- Modify: `apps/web/src/charts/ComparisonBars.tsx`
- Modify: `apps/web/src/charts/TrendsMatrix.tsx`

**Interfaces:**
- Consumes: `CategoryVisibilityChecklist` (Task 6); `TotalOptions.excludedCategoryIds` (Task 1);
  `LedgerData.views` (Task 2/3).
- Produces: every Overview summary surface now takes a `hiddenCategoryIds: Set<number>` prop
  instead of its own local `rent`/`defaultRent` state.

No test step (component wiring, no test suite — see Global Constraints). This task must land as
one unit: `App.tsx` and its five children change their shared prop contract together, so the app
would not typecheck with only some of these files changed.

- [ ] **Step 1: `RunningChart.tsx`** — remove the local rent toggle, accept `hiddenCategoryIds`

Change the top import (line 1) from:
```ts
import { useEffect, useState, type MouseEvent } from 'react';
```
to:
```ts
import { useState, type MouseEvent } from 'react';
```

Remove the `Segmented` import (`import { Segmented } from '../components/ui';` — not present as a
separate line in this file today; `Segmented` is imported at line 11 alongside nothing else, so
delete that whole import line).

Change the function signature and remove the local rent state (lines 45-49):
```ts
export function RunningChart({ data, ym, hiddenCategoryIds }: { data: LedgerData; ym: string; hiddenCategoryIds: Set<number> }) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const points = runningCumulative(data, ym, { excludedCategoryIds: hiddenCategoryIds });
  const target = monthTotal(data, previousMonth(ym), { excludedCategoryIds: hiddenCategoryIds });
```

Remove the `<Segmented ... />` block from the header (lines 114-122), leaving:
```tsx
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-base text-ink">Running total</h3>
        <span className="text-sm text-ink-muted">
          {formatGBP(current)} <span className="text-ink-faint">so far</span>
        </span>
      </div>
```

Update the SVG `aria-label` (line 125) — it referenced `excludeRent`, which no longer exists:
```tsx
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Running total this month${hiddenCategoryIds.size > 0 ? ', filtered' : ''}`}>
```

- [ ] **Step 2: `GroupingDonut.tsx`** — replace `excludeRent: boolean` with `hiddenCategoryIds`

Change the function signature (lines 10-18):
```ts
export function GroupingDonut({
  data,
  ym,
  hiddenCategoryIds,
}: {
  data: LedgerData;
  ym: string;
  hiddenCategoryIds: Set<number>;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  useEffect(() => setExpanded(null), [ym, hiddenCategoryIds]);
  useEffect(() => setHoveredId(null), [expanded]);

  const catTotals = categoryTotals(data, ym);
  const groupValue = (groupId: number) =>
    data.categories
      .filter((c) => c.group_id === groupId && !hiddenCategoryIds.has(c.id))
      .reduce((sum, c) => sum + (catTotals.get(c.id) ?? 0), 0);
```

Change the category-slice filter (line 40, inside `categorySlices`):
```ts
        .filter((c) => c.group_id === expandedGroup.id && !hiddenCategoryIds.has(c.id) && (catTotals.get(c.id) ?? 0) > 0)
```

Change the center label text (line 86) — was `excludeRent ? 'ex-Rent' : 'total'`:
```tsx
          {hoveredSlice
            ? `${hoveredSlice.name} · ${Math.round((hoveredSlice.value / total) * 100)}%`
            : drilled ? `${expandedGroup.name} · ${Math.round((total / allGroupsTotal) * 100)}%` : hiddenCategoryIds.size > 0 ? 'filtered' : 'total'}
```

- [ ] **Step 3: `ComparisonBars.tsx`** — remove the local rent toggle, accept `hiddenCategoryIds`

Change the top import (line 1) from:
```ts
import { useEffect, useState } from 'react';
```
to:
```ts
import { useState } from 'react';
```

Remove the `Segmented` import (line 10: `import { Segmented } from '../components/ui';`).

Change the function signature and remove local rent state (lines 14-22):
```ts
export function ComparisonBars({ data, ym, hiddenCategoryIds }: { data: LedgerData; ym: string; hiddenCategoryIds: Set<number> }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const thisCat = categoryTotals(data, ym);
  const lastCat = categoryTotals(data, previousMonth(ym));
  const visible = (c: Category) => !hiddenCategoryIds.has(c.id);
```

Remove the `<Segmented ... />` block from the header (lines 84-92), so the header (lines 71-93)
becomes:
```tsx
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-base text-ink">Vs last month</h3>
          {hasExpandable && (
            <button
              type="button"
              className="text-xs text-ink-muted transition-colors hover:text-accent"
              onClick={allExpanded ? collapseAll : expandAll}
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
      </div>
```

- [ ] **Step 4: `TrendsMatrix.tsx`** — remove the local rent toggle, accept `hiddenCategoryIds`

Change the top import (line 1) from:
```ts
import { useEffect, useState } from 'react';
```
to:
```ts
import { useState } from 'react';
```

Remove the `Segmented` import (line 10: `import { Segmented } from '../components/ui';`).

Change the function signature and remove the local rent state + `visible` helper (lines 67-102):
```ts
export function TrendsMatrix({ data, hiddenCategoryIds }: { data: LedgerData; hiddenCategoryIds: Set<number> }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [showRange, setShowRange] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const currentYm = todayISO().slice(0, 7);

  let defaultStart = currentYm;
  for (let i = 0; i < 5; i++) defaultStart = previousMonth(defaultStart);

  const displayStart = rangeStart ?? defaultStart;
  const displayEnd = rangeEnd ?? currentYm;
  const months = monthsRange(displayStart, displayEnd, 60);

  let optStart = currentYm;
  for (let i = 0; i < 47; i++) optStart = previousMonth(optStart);
  const monthOptions = monthsRange(optStart, currentYm, 48);

  const isCustomRange = rangeStart !== null || rangeEnd !== null;
  const resetRange = () => { setRangeStart(null); setRangeEnd(null); };

  const totalsByMonth = new Map(months.map((m) => [m, categoryTotals(data, m)]));

  const visibleGroups = data.groups
    .map((g) => {
      const cats = data.categories.filter((c) => c.group_id === g.id && !hiddenCategoryIds.has(c.id));
      const amounts = months.map((m) => cats.reduce((s, c) => s + (totalsByMonth.get(m)?.get(c.id) ?? 0), 0));
      return { g, cats, amounts };
    })
    .filter((x) => x.amounts.some((a) => a > 0));
```

Replace the whole header block (lines 144-174) — which today wraps the title/expand-all/range
toggle in an inner div, alongside a sibling `<Segmented ... />` for incl/excl-Rent — with a single
flat flex row (no more sibling, so no more `justify-between` wrapper):

```tsx
      <div className="mb-4 flex items-center gap-3">
        <h3 className="font-serif text-base text-ink">Category × month</h3>
        {hasExpandable && (
          <button
            type="button"
            className="text-xs text-ink-muted transition-colors hover:text-accent"
            onClick={allExpanded ? collapseAll : expandAll}
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        )}
        <button
          type="button"
          className={`text-xs transition-colors hover:text-accent ${isCustomRange ? 'text-accent' : 'text-ink-muted'}`}
          onClick={() => setShowRange((s) => !s)}
        >
          {isCustomRange ? 'Custom range' : '6 months'} {showRange ? '▴' : '▾'}
        </button>
      </div>
```

- [ ] **Step 5: `OverviewMonth.tsx`** — remove `donutRent`, single This-month total, thread
`hiddenCategoryIds` to all three children

Replace the whole file:

```tsx
import { averageNet, formatGBP, income, monthNet, monthTotal, type LedgerData } from '@budget/core';
import { Kbd, Panel } from '../components/ui';
import { monthLabel, todayISO } from '../lib/dates';
import { RunningChart } from '../charts/RunningChart';
import { GroupingDonut } from '../charts/GroupingDonut';
import { ComparisonBars } from '../charts/ComparisonBars';

export function OverviewMonth({ data, ym, hiddenCategoryIds }: { data: LedgerData; ym: string; hiddenCategoryIds: Set<number> }) {
  const currentYm = todayISO().slice(0, 7);
  const total = monthTotal(data, ym, { excludedCategoryIds: hiddenCategoryIds });
  const net = monthNet(data, ym, currentYm);
  const inc = income(data, ym, currentYm);
  const avg = averageNet(data, currentYm);
  const noData = data.entries.length === 0 && data.lists.length === 0 && data.income.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {noData && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-panel p-5 text-center">
          <p className="font-serif text-lg text-ink">Welcome to your Budget Tool</p>
          <p className="mt-1 text-sm text-ink-muted">
            Record your first spend under <span className="text-ink">+ Add</span> (or press <Kbd>a</Kbd>). Every total,
            chart and comparison below updates live.
          </p>
        </div>
      )}

      {!noData && total === 0 && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-panel p-4 text-center text-sm text-ink-muted">
          No spend recorded for {monthLabel(ym)} yet — the totals and charts below fill in as you add entries.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel>
          <div className="text-xs uppercase tracking-wide text-ink-faint">This month</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-4xl text-ink">{formatGBP(total)}</span>
          </div>
        </Panel>

        <Panel>
          <div className="text-xs uppercase tracking-wide text-ink-faint">Net balance</div>
          <div className="mt-1 font-serif text-4xl">
            <span className={net >= 0 ? 'text-under' : 'text-over'}>{formatGBP(net)}</span>
          </div>
          <div className="mt-1 text-sm text-ink-muted">
            income {formatGBP(inc)} · avg{' '}
            <span className={avg >= 0 ? 'text-under' : 'text-over'}>{formatGBP(avg)}</span>/mo
          </div>
        </Panel>
      </div>

      <Panel>
        <RunningChart data={data} ym={ym} hiddenCategoryIds={hiddenCategoryIds} />
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-base text-ink">By group</h3>
        </div>
        <GroupingDonut data={data} ym={ym} hiddenCategoryIds={hiddenCategoryIds} />
      </Panel>

      <Panel>
        <ComparisonBars data={data} ym={ym} hiddenCategoryIds={hiddenCategoryIds} />
      </Panel>
    </div>
  );
}
```

- [ ] **Step 6: `App.tsx`** — lift `hiddenCategoryIds`, replace the incl/excl-Rent Segmented with
the View button row + "Categories ▾" checklist

Add the import (near the other feature imports, after line 10):
```ts
import { CategoryVisibilityChecklist } from './components/CategoryVisibilityChecklist';
```

Replace `const [globalRent, setGlobalRent] = useState<'incl' | 'excl'>('excl');` (line 28) with:
```ts
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<number>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
```

Replace the whole `overview` header block (lines 116-137) with:
```tsx
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Segmented
                  value={overviewView}
                  onChange={setOverviewView}
                  options={[
                    { id: 'month', label: 'Month' },
                    { id: 'trends', label: 'Trends' },
                  ]}
                />
                {data.views.length > 0 && (
                  <div className="inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-raised p-0.5">
                    <button
                      type="button"
                      onClick={() => setHiddenCategoryIds(new Set())}
                      className={`rounded-md px-3 py-1 text-xs transition-colors ${
                        hiddenCategoryIds.size === 0 ? 'bg-panel font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      All
                    </button>
                    {data.views.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setHiddenCategoryIds(new Set(v.hidden_category_ids))}
                        className="rounded-md px-3 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <button
                    type="button"
                    className={`text-xs transition-colors hover:text-accent ${hiddenCategoryIds.size > 0 ? 'text-accent' : 'text-ink-muted'}`}
                    onClick={() => setShowFilter((s) => !s)}
                  >
                    Categories {showFilter ? '▴' : '▾'}
                  </button>
                  {showFilter && (
                    <div className="absolute left-0 top-full z-10 mt-1 w-64">
                      <CategoryVisibilityChecklist data={data} hiddenCategoryIds={hiddenCategoryIds} onChange={setHiddenCategoryIds} />
                    </div>
                  )}
                </div>
              </div>
              {overviewView === 'month' && <MonthPicker ym={ym} onChange={setYm} />}
            </div>
            {overviewView === 'month' ? (
              <OverviewMonth data={data} ym={ym} hiddenCategoryIds={hiddenCategoryIds} />
            ) : (
              <TrendsMatrix data={data} hiddenCategoryIds={hiddenCategoryIds} />
            )}
```

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck -w @budget/web && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/features/OverviewMonth.tsx apps/web/src/charts/RunningChart.tsx apps/web/src/charts/GroupingDonut.tsx apps/web/src/charts/ComparisonBars.tsx apps/web/src/charts/TrendsMatrix.tsx
git commit -m "$(cat <<'EOF'
feat(web): unify Overview's category filter across all summary surfaces

Replaces four duplicated, Rent-only incl/excl toggles (This-month total,
running chart, donut, comparison bars, trends matrix) with one shared
hiddenCategoryIds set, an All/View-preset button row, and an ad hoc
Categories checklist. Net Balance is untouched — always includes
everything. Default on load is "All" (no automatic Rent exclusion).
EOF
)"
```

---

## Task 8: UI — "Views" section in Manage → Taxonomy

**Files:**
- Modify: `apps/web/src/features/manage/ManageTaxonomy.tsx`

**Interfaces:**
- Consumes: `CategoryVisibilityChecklist` (Task 6); `createView`/`updateView`/`deleteView` (Task
  3, via `apps/web/src/api.ts`); `View` type (Task 2); `data.views` (Task 3).

No test step (component, no test suite — see Global Constraints).

- [ ] **Step 1: Add imports**

In `apps/web/src/features/manage/ManageTaxonomy.tsx`, change the `type` import (line 22) to add
`View`:
```ts
import type { Category, Group, LedgerData, View } from '@budget/core';
```

Add to the `../../api` import (lines 23-32):
```ts
import {
  createCategory,
  createGroup,
  createView,
  deleteCategory,
  deleteGroup,
  deleteView,
  reorderCategories,
  reorderGroups,
  updateCategory,
  updateGroup,
  updateView,
} from '../../api';
```

Add a new import line:
```ts
import { CategoryVisibilityChecklist } from '../../components/CategoryVisibilityChecklist';
```

- [ ] **Step 2: Add the `ViewsSection` component**

Add this new component in the "Small helpers" section, after `AddGroup` (after line 516):

```tsx
// ── Views ────────────────────────────────────────────────────────────────────

const MAX_VIEWS = 4;

function ViewsSection({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftHidden, setDraftHidden] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHidden, setNewHidden] = useState<Set<number>>(new Set());

  const run = async (p: Promise<unknown>) => {
    try {
      await p;
      await refresh();
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const startEdit = (v: View) => {
    setEditingId(v.id);
    setDraftHidden(new Set(v.hidden_category_ids));
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    await run(updateView(editingId, { hidden_category_ids: [...draftHidden] }));
    setEditingId(null);
  };

  const atCap = data.views.length >= MAX_VIEWS;

  return (
    <div className="rounded-lg border border-hairline bg-panel p-4">
      <h3 className="mb-3 font-serif text-base font-medium text-ink">Views</h3>
      {error && <p className="mb-2 text-sm text-over">{error}</p>}
      <ul className="flex flex-col gap-2">
        {data.views.map((v) => (
          <li key={v.id} className="flex items-center gap-2 text-sm">
            <EditableText value={v.name} onCommit={(n) => run(updateView(v.id, { name: n }))} className="flex-1" />
            <button type="button" onClick={() => startEdit(v)} className="text-xs text-ink-faint hover:text-accent">
              edit categories
            </button>
            <button type="button" onClick={() => run(deleteView(v.id))} aria-label="Delete view" className="text-ink-faint hover:text-over">✕</button>
          </li>
        ))}
      </ul>

      {editingId !== null && (
        <div className="mt-3">
          <CategoryVisibilityChecklist data={data} hiddenCategoryIds={draftHidden} onChange={setDraftHidden} />
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setEditingId(null)} className="text-sm text-ink-muted hover:text-ink">Cancel</button>
            <button type="button" onClick={saveEdit} className="rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:opacity-90">Save</button>
          </div>
        </div>
      )}

      {!atCap && (
        showAdd ? (
          <div className="mt-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="View name"
              className="w-full rounded-md border border-hairline bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-ink/40"
            />
            <div className="mt-2">
              <CategoryVisibilityChecklist data={data} hiddenCategoryIds={newHidden} onChange={setNewHidden} />
            </div>
            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewName(''); setNewHidden(new Set()); }}
                className="text-sm text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={newName.trim() === ''}
                onClick={async () => {
                  await run(createView({ name: newName.trim(), hidden_category_ids: [...newHidden] }));
                  setShowAdd(false);
                  setNewName('');
                  setNewHidden(new Set());
                }}
                className="rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add view
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowAdd(true)} className="mt-3 text-sm text-ink-muted hover:text-ink">+ add view</button>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render it**

In the `ManageTaxonomy` component's returned JSX, add `<ViewsSection data={data} />` right after
`<AddGroup onAdd={(name) => run(createGroup({ name, color: '#9a8b6e' }))} />` (after line 432,
still inside the `<div className="flex flex-col gap-5">` and before the `{reassign && (...)}`
block):

```tsx
        <AddGroup onAdd={(name) => run(createGroup({ name, color: '#9a8b6e' }))} />

        <ViewsSection data={data} />

        {reassign && (
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck -w @budget/web && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/manage/ManageTaxonomy.tsx
git commit -m "$(cat <<'EOF'
feat(manage): add a Views section to Manage → Taxonomy

Create/rename/edit-categories/delete saved category-hide presets
(capped at 4), consumed by Overview's All/View button row.
EOF
)"
```

---

## Task 9: Docs — describe the new behaviour, graduate the IDEAS.md entry

**Files:**
- Modify: `docs/BUDGET.md`
- Modify: `docs/IDEAS.md`

- [ ] **Step 1: Update the Overview section**

In `docs/BUDGET.md`, replace lines 30-41 with:

```md
**Month** shows: a headline "This month" total; a Net Balance card (income − total spend — Net
Balance always includes *everything*, regardless of the category filter below); a running-total
chart through the month toward a dashed target at last month's total (`RunningChart`); a grouping
donut that explodes a group into its categories on click (`GroupingDonut`); and "vs last month"
bars — each row (group, expandable to its categories) fills toward 100% of *its own* last-month
total, green under / red over (`ComparisonBars`, `comparison.comparePct`).

Every Overview summary surface (the totals above, the running chart, the donut, the bars, and
Trends below) shares one category/group show-hide filter: an "All" + saved-**View** button row,
plus a "Categories ▾" checklist for ad hoc tweaks (both live in `App.tsx`, threaded down as a
`hiddenCategoryIds` prop). A View is a named, saved preset of that filter — create/rename/edit/
delete them from Manage → Taxonomy → Views (capped at 4). The filter always starts at "All" (no
default exclusion) each session — Net Balance is the one surface it never touches.

**Trends** is a category×month heat matrix (`charts/TrendsMatrix.tsx`, `core/trends.ts`): cell
colour is a **per-row** heatmap (which months were heaviest for that row), with an inline signed
`±%` vs the previous month; near-flat rows are muted; groups expand to categories. Uses the same
shared category filter as Month.
```

- [ ] **Step 2: Update the Manage section**

In `docs/BUDGET.md`, replace the Taxonomy bullet (lines 70-72) with:

```md
- **Taxonomy** (`ManageTaxonomy.tsx`) — add / rename / move / delete categories and groups.
  Deleting a category in use reassigns its rows first (Invariant 3). Changes apply retroactively
  across all history, since entries reference categories by id. Also manages **Views** — named,
  saved show/hide presets (max 4) used by Overview's category filter; a View just stores which
  category ids are hidden, so deleting one is a plain row delete (no reassignment needed).
```

- [ ] **Step 3: Remove the graduated IDEAS.md entry**

In `docs/IDEAS.md`, delete this line from the "Overview / analysis" section (line 21):
```md
- Per-category show/hide toggle on the trends matrix — generalise the existing incl/excl-Rent toggle into show/hide for any row.
```

- [ ] **Step 4: Commit**

```bash
git add docs/BUDGET.md docs/IDEAS.md
git commit -m "$(cat <<'EOF'
docs(budget): describe the unified category filter + Views, graduate the idea

Removes the shipped "per-category show/hide" entry from IDEAS.md.
EOF
)"
```

---

## Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck, test, lint**

Run: `npm run typecheck && npm test && npm run lint`
Expected: PASS across every workspace.

- [ ] **Step 2: Rust test suite**

Run: `cd apps/desktop/src-tauri && cargo test`
Expected: PASS.

- [ ] **Step 3: Manual verification via the `/run` skill**

Start the dev server and open the app in a browser. Walk through:

1. Overview → Month: confirm a single "This month" total (no more incl/excl pair), Net Balance
   card unlabelled by Rent, running chart/donut/bars all render with no header toggle.
2. Click "Categories ▾", hide a category (e.g. Rent) via its checkbox — confirm the This-month
   total, running chart, donut, and bars all update live to exclude it, and Net Balance does
   *not* change.
3. Switch to Overview → Trends: confirm the same hidden category stays hidden (shared state), and
   the matrix's own group-expand/collapse still works independently.
4. Go to Manage → Taxonomy → Views: add a view named "Excl. Rent" with Rent unchecked in its
   checklist, save. Confirm it now appears as a button in Overview's header.
5. Back on Overview: click "All" (confirm everything reappears), then click "Excl. Rent" (confirm
   Rent disappears again across every surface), then tweak further via "Categories ▾" (confirm
   the tweak layers on top without needing to re-click the view button).
6. In Manage → Views, add views up to the cap of 4 and confirm the "+ add view" control disappears
   at 4; delete one and confirm it reappears and the corresponding Overview button vanishes.
7. Reload the page: confirm Overview resets to "All" (no persisted filter across a reload).

Expected: every step behaves as described above, with no console errors.

- [ ] **Step 4: Report completion**

Summarize to the user: what changed, that the golden path was manually verified, and point to the
design spec (`docs/superpowers/specs/2026-07-02-overview-category-views-design.md`) and this plan
file for reference.
