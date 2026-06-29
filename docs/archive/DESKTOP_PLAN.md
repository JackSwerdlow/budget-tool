# Desktop App (Tauri) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing budget-tool React app as an installable, fully-offline Tauri v2 desktop app (Windows `.exe` / macOS `.dmg` / Linux `.AppImage`), reusing `packages/core` and `apps/web` unchanged at the UI layer.

**Architecture:** A data-adapter seam in `apps/web` swaps the HTTP transport (`fetch` → Hono → `node:sqlite`) for a `@tauri-apps/plugin-sql` transport when running inside Tauri, selected at runtime via `window.isTauri`. A new `apps/desktop` workspace holds only the Tauri shell (`src-tauri/`); its frontend *is* `apps/web`'s build. Reads + simple writes run as JS SQL through an **injected executor** (unit-tested against `node:sqlite`); the few transactional writes + DB import run as small Rust commands.

**Tech Stack:** Tauri v2 (Rust), `@tauri-apps/plugin-sql` (sqlite), `@tauri-apps/plugin-dialog`, `rusqlite` (transactional commands), Vite/React 19 (existing), Vitest, GitHub Actions `tauri-action`.

**Design reference:** `docs/DESKTOP_SPEC.md`. Read it before starting.

---

## Environment notes (read first)

- **Dev box is Linux and likely headless** — `tauri dev` opens a native window that may not display here. Do **not** treat "can't open the GUI window" as a failure. Data-layer correctness is proven by Vitest (no GUI). `tauri build` (bundling) does not need a display and can still run; if a GUI smoke is needed locally, wrap with `xvfb-run`.
- **Rust toolchain** is a prerequisite: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y` then `. "$HOME/.cargo/env"`. The user approved installing it.
- Linux Tauri build deps (if building/bundling locally): `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.
- Work happens on branch `desktop-tauri` (already created). Commit after every task.
- `vite.config.ts` already sets `base: './'` for `command === 'build'` — **do not change it**; the Tauri build relies on it.

---

## File structure (created / modified)

**New — adapter seam (`apps/web/src/data/`):**
- `port.ts` — the `DataPort` interface + shared input types (moved from `api.ts`).
- `executor.ts` — `SqlExecutor` interface + the `node:sqlite` test executor + the Tauri plugin executor.
- `queries.ts` — `makeSqlPort(exec, invokeFn)`: every read + simple write as SQL via the executor; transactional writes delegate to `invokeFn` (Rust). Returns a `DataPort`.
- `http.ts` — today's `fetch` implementation (moved verbatim from `api.ts`), as a `DataPort`.
- `index.ts` — runtime selection (`window.isTauri`) + error normalization; exports the active `DataPort`'s functions.

**Modified:**
- `apps/web/src/api.ts` → thin re-export of `./data/index` (keeps existing import sites working).
- `packages/core/src/salary.ts` (or new `salaryYtd.ts`) — gains pure `computeSalaryYTD(...)` lifted verbatim from `repo.ts`.
- `apps/web/src/features/manage/Manage.tsx` — add the "Import database" button (Tauri-only).
- Root `package.json` — add `tauri:dev`, `tauri:build` scripts + dev deps.
- `CLAUDE.md`, `docs/PLAN.md` §9, memory `budget-tool-build-cadence.md` — un-defer desktop (Phase C).

**New — Tauri shell (`apps/desktop/`):**
- `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `src-tauri/src/db.rs` (rusqlite transactional commands + import), `src-tauri/capabilities/default.json`, `src-tauri/build.rs`, icons.
- `apps/desktop/package.json` — workspace member wrapping the Tauri CLI.

**New — CI:**
- `.github/workflows/release.yml`.

---

## Porting rules (apply throughout Phase A)

When translating a function from `apps/api/src/repo.ts` (node:sqlite) into `apps/web/src/data/queries.ts` (executor):

- **R1 — placeholders:** replace each `?` with `$1, $2, …` numbered **sequentially, never reused**. Keep the params array exactly as in `repo.ts` (repeat a value in the array if `repo.ts` passed it twice). Example: `WHERE (year < ?) OR (year = ? AND month <= ?)` with params `(year, year, month)` becomes `WHERE (year < $1) OR (year = $2 AND month <= $3)` with the same `[year, year, month]`.
- **R2 — reads:** `db.prepare(sql).all(...p)` → `await exec.select<Row>(sql, p)`; `.get(...p)` → `(await exec.select<Row>(sql, p))[0]`.
- **R3 — writes:** `db.prepare(sql).run(...p)` → `await exec.execute(sql, p)`; use `.lastInsertId` / `.rowsAffected` from the result in place of `lastInsertRowid` / `changes`.
- **R4 — transactions (`db.exec('BEGIN') … COMMIT`):** do **not** port to JS. Delegate the whole operation to a Rust command via `invokeFn` (Phase B). In Phase A these throw `new Error('requires Tauri')` and are covered only by the Rust/manual path.
- **R5 — booleans:** keep the same int↔bool conversions (`sl_enabled === 1`, `? 1 : 0`).

The `SqlExecutor` abstracts the driver so the **same** `queries.ts` runs against `node:sqlite` in Vitest and against the SQL plugin in production. The test executor rewrites `$N` → `?` positionally (see Task A2).

---

## Phase A — Adapter seam (pure TypeScript, no Tauri yet)

This phase de-risks the largest part first and is fully testable headless.

### Task A1: Extract the `DataPort` contract and move HTTP impl

**Files:**
- Create: `apps/web/src/data/port.ts`
- Create: `apps/web/src/data/http.ts`
- Modify: `apps/web/src/api.ts`

- [ ] **Step 1: Create `port.ts`** — the contract. Move the input types out of `api.ts` and declare the interface every adapter implements:

```ts
import type {
  BudgetList, Category, Entry, Group, LedgerData,
  MonthlyIncome, SalaryConfig, SalaryConfigResponse, SalaryYTD,
} from '@budget/core';

export type NewEntryInput = { amount_pence: number; category_id: number; date: string; note: string | null };
export type EntryPatchInput = Partial<NewEntryInput>;
export type NewListItemInput = { name: string; price_pence: number; quantity: number; share_pct: number; category_id: number };
export type NewListInput = { date: string; note: string | null; delivery_fee_pence: number; delivery_share_pct: number; delivery_category_id: number; items: NewListItemInput[] };

export interface DataPort {
  fetchBootstrap(): Promise<LedgerData>;
  createEntry(input: NewEntryInput): Promise<Entry>;
  updateEntry(id: number, patch: EntryPatchInput): Promise<Entry>;
  deleteEntry(id: number): Promise<void>;
  createList(input: NewListInput): Promise<BudgetList>;
  deleteList(id: number): Promise<void>;
  createCategory(input: { name: string; group_id: number; color: string }): Promise<Category>;
  updateCategory(id: number, patch: { name?: string; group_id?: number; color?: string }): Promise<Category>;
  deleteCategory(id: number, reassignTo?: number): Promise<{ deleted: boolean; inUse?: boolean }>;
  createGroup(input: { name: string; color: string }): Promise<Group>;
  updateGroup(id: number, patch: { name?: string; color?: string }): Promise<Group>;
  deleteGroup(id: number): Promise<{ deleted: boolean; nonEmpty?: boolean }>;
  reorderGroups(ids: number[]): Promise<{ ok: boolean }>;
  reorderCategories(items: { id: number; group_id: number }[]): Promise<{ ok: boolean }>;
  setIncome(year: number, month: number, amountPence: number): Promise<MonthlyIncome>;
  deleteIncome(year: number, month: number): Promise<void>;
  setDefaultIncome(amountPence: number): Promise<{ defaultIncomePence: number }>;
  clearDefaultIncome(): Promise<void>;
  getSalaryConfig(year: number, month: number): Promise<SalaryConfigResponse>;
  getSalaryYTD(year: number, month: number): Promise<SalaryYTD>;
  saveSalaryConfig(cfg: SalaryConfig, netMonthlyPence: number): Promise<SalaryConfigResponse>;
  deleteSalaryConfig(year: number, month: number): Promise<void>;
}
```

- [ ] **Step 2: Create `http.ts`** — move the **entire current body** of `apps/web/src/api.ts` here verbatim (the `API = new URL('api/', document.baseURI)` constant, all `fetch` functions, the `send` helper). Change the type imports to come from `./port` for the input types and keep `@budget/core` for entities. Export a `const httpPort: DataPort = { fetchBootstrap, createEntry, … }` aggregating all the functions.

- [ ] **Step 3: Replace `api.ts`** with a thin re-export so existing imports keep working:

```ts
export * from './data/port';
export * from './data/index';
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w @budget/web`
Expected: PASS (no errors).

- [ ] **Step 5: Run the app to confirm nothing broke**

Run: `npm run dev` (then load via the network IP). Add an entry; confirm the overview updates.
Expected: identical behaviour to before.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/data/port.ts apps/web/src/data/http.ts apps/web/src/api.ts
git commit -m "refactor(web): extract DataPort contract and move HTTP adapter"
```

> Note: Step 3 imports `./data/index` which is created in Task A5. Until then, temporarily make `api.ts` re-export `./data/http`'s `httpPort` members directly, then switch to `./data/index` in A5. Keep the app compiling at every commit.

### Task A2: The `SqlExecutor` + node:sqlite test executor

**Files:**
- Create: `apps/web/src/data/executor.ts`
- Test: `apps/web/src/data/executor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { nodeSqliteExecutor } from './executor';

test('node executor: numbered params, select and execute', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
  const exec = nodeSqliteExecutor(db);

  const ins = await exec.execute('INSERT INTO t (name) VALUES ($1)', ['a']);
  expect(ins.lastInsertId).toBe(1);
  expect(ins.rowsAffected).toBe(1);

  const rows = await exec.select<{ id: number; name: string }>('SELECT id, name FROM t WHERE id = $1', [1]);
  expect(rows).toEqual([{ id: 1, name: 'a' }]);
});
```

- [ ] **Step 2: Run it; verify it fails** — Run: `npx vitest run apps/web/src/data/executor.test.ts` → FAIL (`nodeSqliteExecutor` not exported).

- [ ] **Step 3: Implement `executor.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';

export interface SqlExecutor {
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
}

// node:sqlite uses `?` positional params; rewrite the `$N` used by the SQL plugin.
const toPositional = (sql: string) => sql.replace(/\$\d+/g, '?');

export function nodeSqliteExecutor(db: DatabaseSync): SqlExecutor {
  return {
    async select<T>(sql: string, params: unknown[] = []) {
      return db.prepare(toPositional(sql)).all(...(params as never[])) as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const r = db.prepare(toPositional(sql)).run(...(params as never[]));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
  };
}

// Production executor — wraps @tauri-apps/plugin-sql. Imported lazily so the test/web
// build never pulls in the Tauri module. Implemented in Task B3.
export async function tauriExecutor(): Promise<SqlExecutor> {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  const db = await Database.load('sqlite:budget.db');
  return {
    select: (sql, params = []) => db.select(sql, params as unknown[]) as Promise<never>,
    execute: async (sql, params = []) => {
      const r = await db.execute(sql, params as unknown[]);
      return { rowsAffected: r.rowsAffected, lastInsertId: r.lastInsertId };
    },
  };
}
```

> `@tauri-apps/plugin-sql` is added as a dep in Task B1; until then the dynamic `import()` won't resolve, but it is never reached in the web/test build. If typecheck complains, add the dep first (B1 Step 1) or `// @ts-expect-error` the import line and remove it in B3.

- [ ] **Step 4: Run the test; verify PASS** — Run: `npx vitest run apps/web/src/data/executor.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/data/executor.ts apps/web/src/data/executor.test.ts
git commit -m "feat(web): add SqlExecutor with node:sqlite test executor"
```

### Task A3: Lift payslip-validated `computeSalaryYTD` into core (verbatim)

**Files:**
- Create: `packages/core/src/salaryYtd.ts`
- Modify: `packages/core/src/index.ts` (export it)
- Test: `packages/core/src/salaryYtd.test.ts`

**Discipline (from SPEC §7.2):** move the inline math from `repo.ts:getSalaryYTD` (lines ~489–528) **verbatim** — do NOT rewire it to the existing per-month salary engine. Write the characterization test FIRST against current outputs.

> **Important reality check:** `getSalaryYTD` has **no existing exact-number test**. `app.test.ts`
> only covers salary-config save/inheritance; the payslip ground-truth (commit `25d8466`) lives
> in `packages/core` and validates the *per-month engine*, not the YTD loop. So this test
> *establishes* the lock on current YTD behaviour — it is a **characterization test**: its
> expected values are the **captured current output**, NOT hand-computed numbers. Hand-computing
> the expected is the exact mistake that silently corrupts a "verbatim" port (a wrong expected
> tempts you to tweak the copied math to match it).

- [ ] **Step 1: Write the characterization test** using the real payslip config from
  `app.test.ts:SALARY_BODY` (single month, June 2026, employment starting that month):

```ts
import { test, expect } from 'vitest';
import { computeSalaryYTD, type YTDConfigRow } from './salaryYtd';

// Exact values from apps/api/src/app.test.ts SALARY_BODY (the real payslip config).
const JUNE_2026: YTDConfigRow = {
  year: 2026, month: 6,
  gross_yearly_pence: 5_946_600, bonus_pence: 0, employee_pension_pct: 5.45,
  ni_lower_monthly_pence: 104_750, ni_upper_monthly_pence: 418_917,
  ni_primary_pct: 8, ni_upper_pct: 2,
  sl_enabled: 1, sl_threshold_yearly_pence: 2_847_000, sl_rate_pct: 9,
};

test('computeSalaryYTD — characterization lock (June 2026 single month)', () => {
  const out = computeSalaryYTD([JUNE_2026], { year: 2026, month: 6 }, 2026, 6);
  // CAPTURE these by running the function once and pasting its exact output. Do NOT hand-write.
  // Sanity anchor (safe to verify by hand): slYTDPence === 23200 for this config
  //   floor(((5_946_600 - 2_847_000) * 9/100) / 12 / 100) * 100 = 23200.
  expect(out).toEqual({
    taxYear: 2026, employmentStart: { year: 2026, month: 6 },
    grossYTDPence: /* capture */ 0, employeePensionYTDPence: /* capture */ 0,
    adjustedNetYTDPence: /* capture */ 0, priorAdjNetYTDPence: 0,
    niYTDPence: /* capture */ 0, slYTDPence: 23200,
  });
});
```

> To capture: implement Step 3 first, `console.log(out)` once, paste the real object, then
> confirm `slYTDPence === 23200` and that `grossYTDPence` equals `5_946_600 / 12 = 495550`
> (the two values cheap to verify by hand). Those two anchors catch a botched port; the rest
> are locked by capture.

- [ ] **Step 2: Run it; verify it fails** — Run: `npx vitest run packages/core/src/salaryYtd.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `salaryYtd.ts`** — copy the `YTDConfigRow` and `SalaryYTD` types and the **pure loop body** from `repo.ts:getSalaryYTD` (everything from `const ty = …` through the `return { … }`), but take the already-fetched `taxYearConfigs` rows and `employmentStart` as parameters instead of querying:

```ts
export type YTDConfigRow = {
  year: number; month: number;
  gross_yearly_pence: number; bonus_pence: number; employee_pension_pct: number;
  ni_lower_monthly_pence: number; ni_upper_monthly_pence: number;
  ni_primary_pct: number; ni_upper_pct: number;
  sl_enabled: number; sl_threshold_yearly_pence: number; sl_rate_pct: number;
};
export type SalaryYTD = {
  taxYear: number; employmentStart: { year: number; month: number } | null;
  grossYTDPence: number; employeePensionYTDPence: number; adjustedNetYTDPence: number;
  priorAdjNetYTDPence: number; niYTDPence: number; slYTDPence: number;
};

export function computeSalaryYTD(
  taxYearConfigs: YTDConfigRow[],
  employmentStart: { year: number; month: number } | null,
  year: number, month: number,
): SalaryYTD {
  const ty = month >= 4 ? year : year - 1;
  const empty: SalaryYTD = { taxYear: ty, employmentStart: null, grossYTDPence: 0, employeePensionYTDPence: 0, adjustedNetYTDPence: 0, priorAdjNetYTDPence: 0, niYTDPence: 0, slYTDPence: 0 };
  if (!employmentStart) return empty;
  // … paste the while-loop verbatim from repo.ts (niPrimary/niUpper/slMonthly/mAdjNet math unchanged) …
  return { taxYear: ty, employmentStart, grossYTDPence: Math.round(grossYTD), employeePensionYTDPence: Math.round(pensionYTD), adjustedNetYTDPence: Math.round(adjNetYTD), priorAdjNetYTDPence: Math.round(priorAdjNetYTD), niYTDPence: Math.round(niYTD), slYTDPence: Math.round(slYTD) };
}
```

Export from `packages/core/src/index.ts`: `export * from './salaryYtd';` (check the existing barrel file's style first).

- [ ] **Step 4: Run the test; verify PASS** — Run: `npx vitest run packages/core/src/salaryYtd.test.ts` → PASS. Then `npm test` → all core tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/salaryYtd.ts packages/core/src/salaryYtd.test.ts packages/core/src/index.ts
git commit -m "feat(core): lift computeSalaryYTD from API repo (payslip-validated, verbatim)"
```

### Task A4: Build `queries.ts` (the SQL DataPort) + parity tests

**Files:**
- Create: `apps/web/src/data/queries.ts`
- Test: `apps/web/src/data/queries.test.ts`
- Read for reference: `apps/api/src/repo.ts`, `apps/api/src/db/schema.sql`, `apps/api/src/seed.ts`

This is the bulk of the work: port every `repo.ts` function per the **Porting rules** above. `makeSqlPort` takes the executor and an `invokeFn` (for transactional ops) and returns a `DataPort`.

- [ ] **Step 1: Write the parity test harness + first assertions (failing)**

```ts
import { test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { nodeSqliteExecutor } from './executor';
import { makeSqlPort } from './queries';

function freshPort() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync('apps/api/src/db/schema.sql', 'utf8'));
  // seed taxonomy (paste the 5 groups / 15 categories inserts from apps/api/src/seed.ts)
  seedTaxonomy(db);
  const invokeFn = async () => { throw new Error('transactional op not available in node test'); };
  return makeSqlPort(nodeSqliteExecutor(db), invokeFn);
}

test('bootstrap: seeded taxonomy, empty ledger', async () => {
  const port = freshPort();
  const boot = await port.fetchBootstrap();
  expect(boot.groups).toHaveLength(5);
  expect(boot.categories).toHaveLength(15);
  expect(boot.entries).toEqual([]);
  expect(boot.defaultIncomePence).toBeNull();
});

test('createEntry then bootstrap reflects it', async () => {
  const port = freshPort();
  const groceries = (await port.fetchBootstrap()).categories.find(c => c.name === 'Groceries')!;
  const e = await port.createEntry({ amount_pence: 1234, category_id: groceries.id, date: '2026-01-15', note: null });
  expect(e.amount_pence).toBe(1234);
  const boot = await port.fetchBootstrap();
  expect(boot.entries).toHaveLength(1);
});

test('updateEntry patches only provided fields', async () => {
  const port = freshPort();
  const cat = (await port.fetchBootstrap()).categories[1];
  const e = await port.createEntry({ amount_pence: 500, category_id: cat.id, date: '2026-02-01', note: 'x' });
  const u = await port.updateEntry(e.id, { amount_pence: 700 });
  expect(u.amount_pence).toBe(700);
  expect(u.note).toBe('x');
});

test('setIncome / default income round-trip', async () => {
  const port = freshPort();
  await port.setIncome(2026, 1, 250000);
  await port.setDefaultIncome(300000);
  const boot = await port.fetchBootstrap();
  expect(boot.income).toContainEqual({ year: 2026, month: 1, amount_pence: 250000 });
  expect(boot.defaultIncomePence).toBe(300000);
});

test('salary config save + inheritance + YTD', async () => {
  const port = freshPort();
  // build a valid SalaryConfig (copy the shape from app.test.ts), save it, then:
  // expect getSalaryConfig(next month) to inherit it; expect getSalaryYTD to return computeSalaryYTD output.
});
```

- [ ] **Step 2: Run it; verify it fails** — Run: `npx vitest run apps/web/src/data/queries.test.ts` → FAIL (`makeSqlPort` missing).

- [ ] **Step 3: Implement `makeSqlPort`** — port each `repo.ts` function. Representative examples (apply R1–R3 to the rest):

```ts
import type { SqlExecutor } from './executor';
import type { DataPort, NewEntryInput, EntryPatchInput, NewListInput } from './port';
import { computeSalaryYTD, type YTDConfigRow } from '@budget/core';

export type InvokeFn = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

export function makeSqlPort(exec: SqlExecutor, invoke: InvokeFn): DataPort {
  const getEntry = async (id: number) =>
    (await exec.select('SELECT id, amount_pence, category_id, date, note, created_at FROM entries WHERE id = $1', [id]))[0];

  return {
    async fetchBootstrap() {
      const groups = await exec.select('SELECT id, name, sort_order, color FROM groups ORDER BY sort_order, id');
      const categories = await exec.select('SELECT id, name, group_id, sort_order, color, exclude_from_discretionary FROM categories ORDER BY sort_order, id');
      const entries = await exec.select('SELECT id, amount_pence, category_id, date, note, created_at FROM entries ORDER BY date, created_at, id');
      const lists = await exec.select<{ id: number }>('SELECT id, date, note, delivery_fee_pence, delivery_share_pct, delivery_category_id, created_at FROM lists ORDER BY date, created_at, id');
      const listsWithItems = [];
      for (const l of lists) {
        const items = await exec.select('SELECT id, list_id, name, price_pence, quantity, share_pct, category_id, sort_order FROM list_items WHERE list_id = $1 ORDER BY sort_order, id', [l.id]);
        listsWithItems.push({ ...l, items });
      }
      const income = await exec.select('SELECT year, month, amount_pence FROM monthly_income ORDER BY year, month');
      const def = await exec.select<{ value: string }>("SELECT value FROM settings WHERE key = 'default_income_pence'");
      const n = def[0] ? Number(def[0].value) : null;
      return { groups, categories, entries, lists: listsWithItems, income, defaultIncomePence: Number.isSafeInteger(n as number) ? n : null } as never;
    },

    async createEntry(input: NewEntryInput) {
      const createdAt = new Date().toISOString();
      const r = await exec.execute('INSERT INTO entries (amount_pence, category_id, date, note, created_at) VALUES ($1, $2, $3, $4, $5)', [input.amount_pence, input.category_id, input.date, input.note, createdAt]);
      return (await getEntry(r.lastInsertId)) as never;
    },

    async updateEntry(id: number, patch: EntryPatchInput) {
      const ex = await getEntry(id) as never as { amount_pence: number; category_id: number; date: string; note: string | null };
      await exec.execute('UPDATE entries SET amount_pence = $1, category_id = $2, date = $3, note = $4 WHERE id = $5',
        [patch.amount_pence ?? ex.amount_pence, patch.category_id ?? ex.category_id, patch.date ?? ex.date, patch.note !== undefined ? patch.note : ex.note, id]);
      return (await getEntry(id)) as never;
    },

    async getSalaryYTD(year: number, month: number) {
      const ty = month >= 4 ? year : year - 1;
      const employmentStart = (await exec.select<{ year: number; month: number }>(
        `SELECT year, month FROM salary_config WHERE (year > $1 OR (year = $2 AND month >= 4)) AND (year < $3 OR (year = $4 AND month <= 3)) ORDER BY year ASC, month ASC LIMIT 1`,
        [ty, ty, ty + 1, ty + 1]))[0] ?? null;
      const rows = await exec.select<YTDConfigRow>(
        `SELECT year, month, gross_yearly_pence, bonus_pence, employee_pension_pct, ni_lower_monthly_pence, ni_upper_monthly_pence, ni_primary_pct, ni_upper_pct, sl_enabled, sl_threshold_yearly_pence, sl_rate_pct FROM salary_config WHERE (year > $1 OR (year = $2 AND month >= 4)) AND (year < $3 OR (year = $4 AND month <= 3)) ORDER BY year ASC, month ASC`,
        [ty, ty, ty + 1, ty + 1]);
      return computeSalaryYTD(rows, employmentStart, year, month) as never;
    },

    // R4 — transactional: delegate to Rust (Phase B). Throws in node tests.
    async createList(input: NewListInput) { return (await invoke('create_list', { input })) as never; },
    async deleteCategory(id: number, reassignTo?: number) { return (await invoke('delete_category', { id, reassignTo: reassignTo ?? null })) as never; },
    async reorderGroups(ids: number[]) { return (await invoke('reorder_groups', { ids })) as never; },
    async reorderCategories(items) { return (await invoke('reorder_categories', { items })) as never; },

    // … port the remaining functions from repo.ts with R1–R3:
    //   deleteEntry, deleteList, createCategory, updateCategory, createGroup, updateGroup,
    //   deleteGroup, setIncome, deleteIncome, setDefaultIncome, clearDefaultIncome,
    //   getSalaryConfig (backward-then-forward LIMIT 1 queries), saveSalaryConfig (the big
    //   upsert in repo.ts:upsertSalaryConfig + monthly_income write-through), deleteSalaryConfig.
    //   updateList is transactional → invoke('update_list', { id, input }).
  } as DataPort;
}
```

> The full source for every listed function is in `apps/api/src/repo.ts` (read it open beside this task). The only mechanical changes are R1 (`?`→`$N`) and R2/R3 (driver calls). For `saveSalaryConfig`, also replicate the route behaviour in `apps/api/src/app.ts` that writes `monthly_income` from `net_monthly_pence` (the "MonthlyIncome write-through" — grep `salary-config` in `app.ts`).

- [ ] **Step 4: Flesh out the remaining tests** for each non-transactional function (delete entry/list, category & group CRUD, income, full salary config save/inherit/delete) so every ported function has at least one assertion. Run: `npx vitest run apps/web/src/data/queries.test.ts` → PASS.

- [ ] **Step 5: Full suite** — Run: `npm test` → PASS. Run: `npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/data/queries.ts apps/web/src/data/queries.test.ts
git commit -m "feat(web): port repo SQL to executor-based DataPort with parity tests"
```

### Task A5: Runtime adapter selection + error normalization

**Files:**
- Create: `apps/web/src/data/index.ts`
- Modify: `apps/web/src/api.ts` (point at `./data/index`)
- Test: `apps/web/src/data/index.test.ts`

- [ ] **Step 1: Write the failing test** (error normalization is the testable bit):

```ts
import { test, expect } from 'vitest';
import { normalizeError } from './index';

test('normalizeError yields a single shape', () => {
  expect(normalizeError(new Error('boom')).message).toBe('boom');
  expect(normalizeError('db locked').message).toBe('db locked');
  expect(normalizeError({ message: 'x' }).message).toBe('x');
});
```

- [ ] **Step 2: Run it; verify it fails** — Run: `npx vitest run apps/web/src/data/index.test.ts` → FAIL.

- [ ] **Step 3: Implement `index.ts`**

```ts
import type { DataPort } from './port';
import { httpPort } from './http';
import { makeSqlPort } from './queries';

export function normalizeError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return new Error(e);
  if (e && typeof e === 'object' && 'message' in e) return new Error(String((e as { message: unknown }).message));
  return new Error('Unknown data error');
}

function wrap(port: DataPort): DataPort {
  return new Proxy(port, {
    get(target, key) {
      const fn = (target as never)[key];
      if (typeof fn !== 'function') return fn;
      return async (...args: unknown[]) => {
        try { return await fn.apply(target, args); }
        catch (e) { throw normalizeError(e); }
      };
    },
  });
}

const isTauri = typeof window !== 'undefined' && (window as { isTauri?: boolean }).isTauri === true;

let active: DataPort;
if (isTauri) {
  // lazy: tauriExecutor + tauri invoke, only inside the Tauri webview
  const { tauriExecutor } = await import('./executor');
  const { invoke } = await import('@tauri-apps/api/core');
  active = makeSqlPort(await tauriExecutor(), invoke as never);
} else {
  active = httpPort;
}

export const dataPort = wrap(active);
export const {
  fetchBootstrap, createEntry, updateEntry, deleteEntry, createList, deleteList,
  createCategory, updateCategory, deleteCategory, createGroup, updateGroup, deleteGroup,
  reorderGroups, reorderCategories, setIncome, deleteIncome, setDefaultIncome,
  clearDefaultIncome, getSalaryConfig, getSalaryYTD, saveSalaryConfig, deleteSalaryConfig,
} = dataPort;
```

> Top-level `await` is fine here (ESM; Vite supports it). The `@tauri-apps/api` / `@tauri-apps/plugin-sql` imports are added in B1; they sit behind `isTauri` so the web build never executes them. If the web/test build fails to resolve them statically, keep them as dynamic `import()` (already are) — dynamic specifiers aren't resolved unless reached.

- [ ] **Step 4: Point `api.ts` at index** — set `apps/web/src/api.ts` to `export * from './data/port'; export * from './data/index';`.

- [ ] **Step 5: Run tests + typecheck + app** — Run: `npm test` → PASS; `npm run typecheck` → PASS; `npm run dev` → app works as before (still HTTP, since not in Tauri).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/data/index.ts apps/web/src/data/index.test.ts apps/web/src/api.ts
git commit -m "feat(web): runtime adapter selection (window.isTauri) + error normalization"
```

---

## Phase B — Tauri shell

After this phase the offline app runs (where a display exists) and uses the rusqlite data layer.

> **PIVOT (as built): rusqlite-only, no `@tauri-apps/plugin-sql`.** The plugin (sqlx →
> `libsqlite3-sys`) conflicts with `rusqlite` (also `libsqlite3-sys`) — they cannot coexist in
> one binary, so the original "plugin + rusqlite" split never compiles. The whole desktop data
> layer is `rusqlite` behind Tauri commands. This changes the Rust tasks below:
> - **B2 →** Cargo deps are `rusqlite` (features `bundled`) + `tauri-plugin-dialog` (no
>   `tauri-plugin-sql`). Schema+seed run at **startup** via `execute_batch` (idempotent:
>   `IF NOT EXISTS` schema + guarded `INSERT … WHERE NOT EXISTS` seed), not plugin migrations.
>   Open one `rusqlite::Connection` in a `Mutex`, store in managed state.
> - **B3 →** `tauriExecutor` calls `invoke('sql_select' | 'sql_execute')` (already done) rather
>   than `Database.load`. Capabilities need only `dialog:default`.
> - **Generic bridge (new, in B2):** `sql_select(sql, params)` / `sql_execute(sql, params)`
>   commands. Structure as plain `fn select(conn, sql, params)` / `execute(...)` + thin
>   `#[tauri::command]` wrappers. **Convert `$N`→positional `?` and bind in order** (identical
>   to `testdb.ts`), so the existing 11 parity tests cover the real binding contract. Marshal
>   JSON params → rusqlite values and rows → JSON (integers stay integers, REAL pcts stay
>   numbers, null stays null).
> - **B4 →** transactional commands (`create_list`, `delete_category`, `reorder_groups`,
>   `reorder_categories`) lock the `Mutex<Connection>` and use a real `rusqlite` transaction.
>   (No `update_list` — the DataPort has none.)
> - **Required Rust test (advisor):** one `#[test]` round-trips a `salary_config` row through
>   `select`/`execute` asserting type fidelity (pct ≈ 5.45 as a number, pence as integer, null
>   preserved). This is the **only** coverage of the real bridge until CI/Windows exist. It
>   compiles the tauri crate, so it runs in the post-`apt` (webkit) verification batch with
>   `cargo test`.

### Task B1: Scaffold `apps/desktop` + dependencies

**Files:**
- Create: `apps/desktop/` (via Tauri CLI), `apps/desktop/package.json`
- Modify: root `package.json` (scripts + dev deps), `apps/web/package.json` (tauri JS deps)

- [ ] **Step 1: Add JS dependencies**

```bash
npm i -w @budget/web @tauri-apps/api @tauri-apps/plugin-sql @tauri-apps/plugin-dialog
npm i -D -w budget-tool @tauri-apps/cli
```

- [ ] **Step 2: Initialise the Tauri project under `apps/desktop`** (non-interactive flags):

```bash
cd apps/desktop && npx tauri init \
  --app-name "Budget Tool" \
  --window-title "Budget Tool" \
  --frontend-dist ../web/dist \
  --dev-url http://localhost:5001 \
  --before-dev-command "npm -w @budget/web run dev" \
  --before-build-command "npm -w @budget/web run build"
```

(If `tauri init` writes paths relative to `apps/desktop`, confirm `frontendDist` resolves to `apps/web/dist` and fix in `tauri.conf.json` if not.)

- [ ] **Step 3: Set the identifier** in `apps/desktop/src-tauri/tauri.conf.json` → `"identifier": "com.budgettool.desktop"`. Confirm `build.devUrl`, `build.frontendDist`, `build.beforeDevCommand`, `build.beforeBuildCommand` match Step 2. Add `apps/desktop/package.json` as a private workspace member named `@budget/desktop` with a `tauri` script: `"tauri": "tauri"`.

- [ ] **Step 4: Add root scripts** to `package.json`:

```json
"tauri:dev": "npm -w @budget/desktop run tauri dev",
"tauri:build": "npm -w @budget/desktop run tauri build"
```

- [ ] **Step 5: Verify it compiles** (headless OK — this builds Rust, doesn't open a window):

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: compiles (may take a while on first run).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop package.json package-lock.json apps/web/package.json
git commit -m "feat(desktop): scaffold Tauri v2 app wrapping apps/web"
```

### Task B2: SQL plugin + dialog + schema/seed migrations

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add Rust deps**

```bash
cd apps/desktop/src-tauri && cargo add tauri-plugin-sql --features sqlite && cargo add tauri-plugin-dialog && cargo add rusqlite --features bundled
```

- [ ] **Step 2: Register plugins + migrations in `lib.rs`.** Define two migrations: v1 = the **full contents of `apps/api/src/db/schema.sql`** (already `CREATE TABLE IF NOT EXISTS …`, so idempotent); v2 = the taxonomy seed as **guarded inserts** (idempotent for imported DBs):

```rust
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

const SCHEMA: &str = include_str!("../../../api/src/db/schema.sql");

const SEED: &str = "\
INSERT INTO groups (name, sort_order, color) SELECT 'Essentials',1,'#6b7d5e' WHERE NOT EXISTS (SELECT 1 FROM groups);\
-- … all 5 groups + 15 categories as guarded inserts mirroring apps/api/src/seed.ts (exact names, order, hexes, Rent.exclude_from_discretionary=1) …";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration { version: 1, description: "schema", sql: SCHEMA, kind: MigrationKind::Up },
        Migration { version: 2, description: "seed_taxonomy", sql: SEED, kind: MigrationKind::Up },
    ];
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(SqlBuilder::default().add_migrations("sqlite:budget.db", migrations).build())
        // .invoke_handler(...) added in B4/B5
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

> The `include_str!` path is relative to `lib.rs`; from `apps/desktop/src-tauri/src/` to `apps/api/src/db/schema.sql` is `../../../api/src/db/schema.sql`. Verify the depth and adjust. This keeps schema single-sourced from the API.

- [ ] **Step 3: Capabilities** — `src-tauri/capabilities/default.json` `permissions`: add `"sql:default"`, `"sql:allow-execute"`, `"dialog:default"` (and the custom commands' permissions once added in B4/B5).

- [ ] **Step 4: Compile** — Run: `cargo check` (in `src-tauri`) → compiles.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri
git commit -m "feat(desktop): register sql+dialog plugins, schema & seed migrations"
```

### Task B3: Wire the Tauri executor end-to-end

**Files:**
- Modify: `apps/web/src/data/executor.ts` (remove any temporary ts-ignore; confirm `tauriExecutor`)

- [ ] **Step 1:** Confirm `tauriExecutor()` (written in A2) resolves now that `@tauri-apps/plugin-sql` is installed. Remove any temporary `@ts-expect-error`.
- [ ] **Step 2: Typecheck** — Run: `npm run typecheck -w @budget/web` → PASS.
- [ ] **Step 3: GUI smoke (only if a display/xvfb is available)** — Run: `npm run tauri:dev` (or `xvfb-run -a npm run tauri:dev`). Expected: window opens, app loads, adding a single entry persists and the overview updates. If headless with no xvfb, **skip** and rely on CI smoke (Phase C) + the user's machine.
- [ ] **Step 4: Commit**

```bash
git add apps/web/src/data/executor.ts
git commit -m "feat(desktop): wire @tauri-apps/plugin-sql executor"
```

### Task B4: Transactional writes as Rust commands

**Files:**
- Create: `apps/desktop/src-tauri/src/db.rs`
- Modify: `src-tauri/src/lib.rs` (module + `invoke_handler`), `capabilities/default.json`

- [ ] **Step 1: Implement the commands in `db.rs`** using `rusqlite` with a real transaction, opening the same app-config DB file. Resolve the path via the app handle and apply `PRAGMA foreign_keys = ON`:

```rust
use rusqlite::Connection;
use serde::Deserialize;
use tauri::Manager;

fn open(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("budget.db")).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;
    Ok(conn)
}

#[derive(Deserialize)] pub struct NewListItem { name: String, price_pence: i64, quantity: i64, share_pct: i64, category_id: i64 }
#[derive(Deserialize)] pub struct NewList { date: String, note: Option<String>, delivery_fee_pence: i64, delivery_share_pct: i64, delivery_category_id: i64, items: Vec<NewListItem> }

#[tauri::command]
pub fn create_list(app: tauri::AppHandle, input: NewList) -> Result<serde_json::Value, String> {
    let mut conn = open(&app)?;
    let created_at = chrono::Utc::now().to_rfc3339(); // or pass from JS
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO lists (date, note, delivery_fee_pence, delivery_share_pct, delivery_category_id, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![input.date, input.note, input.delivery_fee_pence, input.delivery_share_pct, input.delivery_category_id, created_at]).map_err(|e| e.to_string())?;
    let list_id = tx.last_insert_rowid();
    for (i, it) in input.items.iter().enumerate() {
        tx.execute("INSERT INTO list_items (list_id, name, price_pence, quantity, share_pct, category_id, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![list_id, it.name, it.price_pence, it.quantity, it.share_pct, it.category_id, (i as i64)+1]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    // return the created list shape (id + items) to match repo.getList
    Ok(serde_json::json!({ "id": list_id }))
}
// Implement likewise: update_list, delete_category (reassign-then-delete from repo.ts:deleteCategory),
// reorder_groups, reorder_categories — porting each transaction body from repo.ts.
```

> Add `chrono` (`cargo add chrono`) only if generating `created_at` in Rust; alternatively pass `createdAt` from `queries.ts` as an arg to keep timestamps identical to the HTTP path. **Prefer passing it from JS** for parity. Return shapes must match `repo.ts` (`createList`→full list with items; `deleteCategory`→`{deleted, inUse?}`; reorders→`{ok:true}`). Adjust `queries.ts` invoke calls to read these back (e.g. re-`select` the list to assemble items, mirroring `repo.getList`).

- [ ] **Step 2: Register** in `lib.rs`: `mod db;` and `.invoke_handler(tauri::generate_handler![db::create_list, db::update_list, db::delete_category, db::reorder_groups, db::reorder_categories])`.
- [ ] **Step 3: Capabilities** — these commands are app-local (not a plugin); confirm they don't need capability entries (custom commands are allowed by default) — verify by build.
- [ ] **Step 4: Compile** — Run: `cargo check` → compiles.
- [ ] **Step 5: GUI smoke (if display available)** — add an itemised list; delete a category with reassign; reorder groups. Else defer to manual test on the user's machine.
- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri apps/web/src/data/queries.ts
git commit -m "feat(desktop): transactional writes as rusqlite commands"
```

### Task B5: Import-database feature

**Files:**
- Create command in `src-tauri/src/db.rs`; Modify `lib.rs` handler; Modify `apps/web/src/features/manage/Manage.tsx`

- [ ] **Step 1: Rust command** `import_database(app, src_path: String)`: copy `src_path` over `app_config_dir/budget.db`, then run the same migrations on the result (re-open via rusqlite and `execute_batch(SCHEMA)`; the seed is guarded so it's safe). Return `Ok(())`.
- [ ] **Step 2: Register** the command in the `generate_handler!` list.
- [ ] **Step 3: UI action** in `Manage.tsx` — render an "Import database" button **only when `window.isTauri`**. On click: `const path = await open({ filters: [{ name: 'SQLite DB', extensions: ['db'] }] })` (from `@tauri-apps/plugin-dialog`); confirm with the user (replaces current data); `await invoke('import_database', { srcPath: path })`; then re-run bootstrap (reload the data context). Reuse the existing data-refresh path (`data.tsx`).
- [ ] **Step 4: Compile + typecheck** — `cargo check`; `npm run typecheck`.
- [ ] **Step 5: GUI smoke (if display)** — import a copy of `data/budget-demo.db`; confirm entries appear. Else defer to user machine.
- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri apps/web/src/features/manage/Manage.tsx
git commit -m "feat(desktop): import existing database (dialog + rusqlite copy + migrate)"
```

---

## Phase C — CI release + doc cleanup

### Task C1: Cross-platform release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow** (matrix per Tauri docs; tag-triggered):

```yaml
name: release
on:
  push:
    tags: ['desktop-v*']
  workflow_dispatch:
jobs:
  publish-tauri:
    permissions: { contents: write }
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'
            args: '--target aarch64-apple-darwin'
          - platform: 'macos-latest'
            args: '--target x86_64-apple-darwin'
          - platform: 'ubuntu-22.04'
            args: ''
          - platform: 'windows-latest'
            args: ''
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - name: install dependencies (ubuntu only)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: 'npm' }
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}
      - uses: swatinem/rust-cache@v2
        with: { workspaces: './apps/desktop/src-tauri -> target' }
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
        with:
          projectPath: apps/desktop
          tagName: desktop-v__VERSION__
          releaseName: 'Budget Tool Desktop v__VERSION__'
          releaseBody: 'Download the installer for your OS below. Unsigned — Windows SmartScreen/macOS Gatekeeper will warn on first run.'
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

> `projectPath: apps/desktop` points `tauri-action` at the workspace. `__VERSION__` is replaced from `tauri.conf.json` `version`. Bump that version, then push a `desktop-v0.1.0` tag to trigger.

- [ ] **Step 2: Validate YAML** — Run: `npx --yes yaml-lint .github/workflows/release.yml` (or `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"`).
- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(desktop): cross-platform Tauri release workflow"
```

### Task C2: Un-defer desktop in the docs + memory

**Files:**
- Modify: `CLAUDE.md`, `docs/PLAN.md` (§9), memory `budget-tool-build-cadence.md` + `MEMORY.md`

- [ ] **Step 1: `CLAUDE.md`** "Future platform targets" — change the desktop line from deferred to: built on branch `desktop-tauri`; point to `docs/DESKTOP_SPEC.md` / `docs/DESKTOP_PLAN.md`. Keep mobile deferred.
- [ ] **Step 2: `docs/PLAN.md` §9** — move the "desktop wrapper (Tauri)" item out of "DO NOT BUILD" with a note that it's now realised (see DESKTOP_SPEC). Leave mobile under deferred.
- [ ] **Step 3: Memory** — update `budget-tool-build-cadence.md` so it no longer says "don't build §9 desktop" (desktop is now in progress); update its `MEMORY.md` one-liner. Add a new `project` memory noting the desktop app exists with its data-adapter seam, if useful for future sessions.
- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/PLAN.md
git commit -m "docs(desktop): un-defer desktop target; point to DESKTOP_SPEC/PLAN"
```

- [ ] **Step 5: Final verification** — Run: `npm test` → PASS; `npm run typecheck` → PASS; `npm run lint` → clean; `npm run dev` → web app unaffected.

---

## Self-review notes

- **Spec coverage:** §2 reuse → A1/B1; §3 adapter seam → A1/A2/A4/A5; §3 duplication accepted → A4; §4.1 DB location → B2/B4 (`app_config_dir`); §4.2 schema+seed migrations → B2; §4.3 import (with migrate-on-incoming) → B5; §4.4 capabilities → B2/B4; §5.1 scripts → B1; §5.2 CI → C1; §6 executor tests → A2/A4 + GUI/CI smoke → B3/B5/C1; §7.1 transactions via Rust → B4; §7.2 verbatim salary lift → A3; §8 doc cleanup → C2; §9 gotchas: Vite base (already set), error shape → A5, `window.isTauri` → A5, import migrate → B5, transactions → B4.
- **No transactional logic is shared-code-tested** (Rust + manual only) — accepted per SPEC §6/§7.1; reads + simple writes are fully covered via the node:sqlite executor.
- **Headless risk** is isolated to the GUI smoke steps (B3/B5), which are explicitly skippable in favour of CI + the user's machine.
