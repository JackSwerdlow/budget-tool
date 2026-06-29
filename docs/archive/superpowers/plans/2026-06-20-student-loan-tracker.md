# Student Loan Tracker — Implementation Plan (Spec B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stateful student-loan balance tracker — remaining debt as of any month, interest, total paid toward balance, and a payoff projection — threaded through Spec A's shared month-walk.

**Architecture:** A new pure `computeStudentLoan(configs, through)` in `@budget/core` reuses Spec A's `walkMonths` (every calendar month, with `isExplicit`) and threads a running balance: anchor month → declared balance; otherwise `balance = prev + interest − payroll9% − extra`, floored at £0. One new persisted column `extra_payment_pence` crosses both adapters (+ both migration paths) with parity tests. UI: a tracker box on Lifetime, Set-balance + Extra-payment inputs on Config, and the Remaining-student-debt headline on Summary.

**Tech Stack:** TypeScript monorepo · `@budget/core` (vitest) · React + Tailwind (`apps/web`) · Hono + node:sqlite (`apps/api`) · Tauri v2 + rusqlite (`apps/desktop`).

**Source spec:** `docs/superpowers/specs/2026-06-20-student-loan-tracker-design.md`.

**Prerequisite:** Spec A (`2026-06-20-salary-subtabs-and-lifetime.md`) must be implemented first — this plan uses `walkMonths`, the `isExplicit` flag, the sub-tab UI, `getAllSalaryConfigs`, and the Summary `KeyFigures` `studentDebtPence` prop.

**Load-bearing constraints:**
- **Do NOT change** `calcSalary`'s student-loan **payroll** math (9% above threshold). The tracker consumes that figure; it doesn't replace it.
- **Anchor guard:** a month is an anchor **iff** `isExplicit && sl_balance_pence != null`. Inherited months are never anchors; their `sl_balance_pence`/`extra_payment_pence` are treated as null/0.
- **Two paid figures are intentionally different** (don't "fix" the mismatch): Lifetime "Student loan paid" = Σ payroll (Spec A); tracker "paid toward balance" = Σ (payroll + extra), capped at payoff.
- **Interest rate `sl_interest_rate_pct` is ANNUAL nominal** (redefine; no migration — it's currently unused). Relabel the Config input "Annual interest rate (%)".

---

## File Structure

**Create:**
- `packages/core/src/studentLoan.ts` — `computeStudentLoan(configs, through)` → `StudentLoanResult`.
- `packages/core/src/studentLoan.test.ts`

**Modify:**
- `apps/api/src/db/schema.sql` — add `extra_payment_pence`.
- `apps/api/src/migrate.ts` — idempotent ALTER (node:sqlite).
- `apps/desktop/src-tauri/src/db.rs` — idempotent ALTER (rusqlite) + a column-presence test.
- `packages/core/src/types.ts` — `SalaryConfig` + `extra_payment_pence?`; add `StudentLoanResult`.
- `packages/core/src/index.ts` — export `studentLoan`.
- `apps/api/src/repo.ts` — `SalaryConfigRow` + upsert (extra_payment_pence).
- `apps/web/src/data/queries.ts` — `SalaryConfigRow` type + upsert.
- `apps/web/src/data/queries.test.ts` — parity for the new column.
- `apps/api/src/seed-demo.ts` — seed an anchor balance.
- `apps/web/src/features/salary/salaryState.ts` — fields ↔ config for the event fields + form-fork reset.
- `apps/web/src/features/salary/ConfigTab.tsx` — Set balance + Extra payment + annual-rate label.
- `apps/web/src/features/salary/LifetimeTab.tsx`, `SalaryView.tsx` — tracker box.
- `apps/web/src/features/salary/Salary.tsx` / `SummaryTab.tsx` — wire `studentDebtPence`.

---

## PHASE 1 — Data column `extra_payment_pence` (schema + both migrations + adapters + parity)

### Task 1: Add the column to schema + both migration paths

**Files:**
- Modify: `apps/api/src/db/schema.sql`, `apps/api/src/migrate.ts`, `apps/desktop/src-tauri/src/db.rs`

- [ ] **Step 1: Schema (fresh installs)**

In `apps/api/src/db/schema.sql`, in the `salary_config` table, add after `bonus_pence`:
```sql
  extra_payment_pence              INTEGER NOT NULL DEFAULT 0,
```

- [ ] **Step 2: API migration (existing node:sqlite DBs)**

In `apps/api/src/migrate.ts`, after the `bonus_pence` ALTER line:
```ts
  try { db.exec('ALTER TABLE salary_config ADD COLUMN extra_payment_pence INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
```

- [ ] **Step 3: Rust migration (existing rusqlite DBs)**

In `apps/desktop/src-tauri/src/db.rs`, in `migrate()`, after `conn.execute_batch(SCHEMA)?;` and before `conn.execute_batch(SEED)?;`:
```rust
    // Column additions for DBs created before a later schema change (CREATE TABLE IF NOT
    // EXISTS won't add columns to an existing table). Ignore the "duplicate column" error.
    let _ = conn.execute(
        "ALTER TABLE salary_config ADD COLUMN extra_payment_pence INTEGER NOT NULL DEFAULT 0",
        [],
    );
```

- [ ] **Step 4: Rust column-presence test**

In `apps/desktop/src-tauri/src/db.rs` tests, add:
```rust
    #[test]
    fn migrate_adds_extra_payment_column_to_older_db() {
        let c = Connection::open_in_memory().unwrap();
        // Simulate an older DB: a salary_config table missing the new column.
        c.execute_batch(
            "CREATE TABLE salary_config (year INTEGER, month INTEGER, gross_yearly_pence INTEGER, PRIMARY KEY(year,month));",
        ).unwrap();
        migrate(&c).unwrap();
        let cols: Vec<String> = c
            .prepare("PRAGMA table_info(salary_config)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .map(|x| x.unwrap()).collect();
        assert!(cols.iter().any(|c| c == "extra_payment_pence"));
    }
```

- [ ] **Step 5: Verify**

Run: `npm test -w @budget/api` and `cd apps/desktop/src-tauri && cargo test`
Expected: PASS (migrate idempotent; older-DB column added).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema.sql apps/api/src/migrate.ts apps/desktop/src-tauri/src/db.rs
git commit -m "feat(data): add extra_payment_pence column (schema + node:sqlite + rusqlite migrations)"
```

---

### Task 2: Thread `extra_payment_pence` through types + both adapters (+ parity)

**Files:**
- Modify: `packages/core/src/types.ts`, `apps/api/src/repo.ts`, `apps/web/src/data/queries.ts`
- Test: `apps/web/src/data/queries.test.ts`

- [ ] **Step 1: Write the failing parity test**

In `apps/web/src/data/queries.test.ts`, add:
```ts
test('salary: extra_payment_pence round-trips', async () => {
  const { port } = freshPort();
  await port.saveSalaryConfig({ ...SALARY_CFG, extra_payment_pence: 50_000 }, 335_995);
  const got = await port.getSalaryConfig(2026, 6);
  expect(got.config?.extra_payment_pence).toBe(50_000);
  const def = await port.getSalaryConfig(2026, 8); // inherits — carries the saved row's value
  expect(def.config?.extra_payment_pence).toBe(50_000);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @budget/web -- queries`
Expected: FAIL — `extra_payment_pence` undefined / not persisted.

- [ ] **Step 3: Core type**

In `packages/core/src/types.ts`, add to `SalaryConfig` (after `sl_interest_rate_pct`):
```ts
  extra_payment_pence?: number;
```

- [ ] **Step 4: API adapter (`repo.ts`)**

In `apps/api/src/repo.ts`:
- Add `extra_payment_pence: number;` to `SalaryConfigRow` (after `bonus_pence`).
- In `upsertSalaryConfig`: add `extra_payment_pence` to the INSERT column list, add one more `?` to the VALUES tuple, add `extra_payment_pence=excluded.extra_payment_pence` to the `DO UPDATE SET`, and add `cfg.extra_payment_pence ?? 0,` to the `.run(...)` bind list (after `cfg.bonus_pence ?? 0,`).
- (`getSalaryConfig`/`getAllSalaryConfigs` use `SELECT *` → the column flows through automatically.)

- [ ] **Step 5: Tauri adapter (`queries.ts`)**

In `apps/web/src/data/queries.ts`:
- Add `extra_payment_pence: number` to the local `SalaryConfigRow` type (it already extends `Omit<SalaryConfig,'sl_enabled'> & { sl_enabled: number; bonus_pence: number }` — add `& { extra_payment_pence: number }` or include in the intersection).
- In `saveSalaryConfig`: add `extra_payment_pence` to the INSERT columns, add `$26` to VALUES, add `extra_payment_pence=excluded.extra_payment_pence` to `DO UPDATE SET`, and `cfg.extra_payment_pence ?? 0,` to the params array.

- [ ] **Step 6: Run parity + API**

Run: `npm test -w @budget/web -- queries` and `npm test -w @budget/api`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts apps/api/src/repo.ts apps/web/src/data/queries.ts apps/web/src/data/queries.test.ts
git commit -m "feat(data): persist extra_payment_pence across HTTP + Tauri adapters (+ parity)"
```

---

## PHASE 2 — Core engine `computeStudentLoan`

### Task 3: The balance recurrence + payoff projection

**Files:**
- Modify: `packages/core/src/types.ts` (add `StudentLoanResult`)
- Create: `packages/core/src/studentLoan.ts`
- Create: `packages/core/src/studentLoan.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the result type**

In `packages/core/src/types.ts`:
```ts
export type StudentLoanResult = {
  remainingBalancePence: number;        // as of `through`
  totalInterestPence: number;           // Σ interest accrued through `through`
  totalPaidTowardBalancePence: number;  // Σ (payroll + extra) applied to the balance (capped at payoff)
  series: { year: number; month: number; balancePence: number }[];
  payoff: { year: number; month: number; remainingInterestPence: number } | null; // null = never / no balance
};
```

- [ ] **Step 2: Write the failing tests**

Create `packages/core/src/studentLoan.test.ts`:
```ts
import { test, expect } from 'vitest';
import { computeStudentLoan } from './studentLoan';
import type { SalaryConfig } from './types';

const cfg = (year: number, month: number, over: Partial<SalaryConfig> = {}): SalaryConfig => ({
  year, month, gross_yearly_pence: 4_200_000, note: null,
  hours_per_week: 37, work_weeks_per_year: 52, work_days_per_week: 5,
  employee_pension_pct: 0, employer_pension_pct: 0,
  personal_allowance_pence: 1_257_000, basic_rate_band_pence: 3_770_100, additional_rate_threshold_pence: 12_514_000,
  basic_rate_pct: 20, higher_rate_pct: 40, additional_rate_pct: 45,
  ni_lower_monthly_pence: 104_750, ni_upper_monthly_pence: 418_917, ni_primary_pct: 8, ni_upper_pct: 2,
  sl_enabled: true, sl_threshold_yearly_pence: 2_847_000, sl_rate_pct: 9,
  sl_balance_pence: null, sl_interest_rate_pct: 0, bonus_pence: 0, extra_payment_pence: 0,
  ...over,
});

// payroll repayment for £42,000 @ 9% above £28,470 = floor((42000-28470)*0.09/12 /1)*... :
// monthly = floor(((4_200_000 - 2_847_000) * 9/100) / 12 / 100) * 100 = floor(121770/12/100)*100
//         = floor(101.475)*100 = 10_100 pence  (£101.00)
const PAYROLL = 10_100;

test('anchor seeds the balance for that month (no interest/payment applied to it)', () => {
  const r = computeStudentLoan([cfg(2026, 4, { sl_balance_pence: 4_500_000 })], { year: 2026, month: 4 });
  expect(r.remainingBalancePence).toBe(4_500_000);
  expect(r.totalInterestPence).toBe(0);
  expect(r.totalPaidTowardBalancePence).toBe(0);
});

test('non-anchor month applies interest − payroll − extra, compounding from prior balance', () => {
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 }),
    cfg(2026, 5, { sl_interest_rate_pct: 0, extra_payment_pence: 20_000 }),
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 5 });
  // May: opening 4_500_000, interest 0, pay = 10_100 + 20_000 = 30_100 → 4_469_900
  expect(r.remainingBalancePence).toBe(4_469_900);
  expect(r.totalPaidTowardBalancePence).toBe(30_100);
});

test('interest uses 365/366 days-in-year and days-in-month, compounding month-to-month', () => {
  // May 2026 (31 days, 2026 not leap): interest = round(4_500_000 × 7.3/100 × 31/365)
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 }),
    cfg(2026, 5, { sl_interest_rate_pct: 7.3 }),
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 5 });
  const interest = Math.round(4_500_000 * 7.3 / 100 * 31 / 365); // 27_887
  expect(r.totalInterestPence).toBe(interest);
  expect(r.remainingBalancePence).toBe(4_500_000 + interest - PAYROLL);
});

test('balance floors at £0 and the final payment caps at the outstanding amount', () => {
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 15_000, sl_interest_rate_pct: 0 }),
    cfg(2026, 5, { sl_interest_rate_pct: 0 }), // payroll 10_100, opening 15_000 → 4_900
    cfg(2026, 6, { sl_interest_rate_pct: 0 }), // payroll 10_100 capped to 4_900 → 0
    cfg(2026, 7, { sl_interest_rate_pct: 0 }), // already 0 → stays 0, no negative
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 7 });
  expect(r.remainingBalancePence).toBe(0);
  // paid toward balance = 10_100 + 4_900 + 0 = 15_000 (never more than was owed)
  expect(r.totalPaidTowardBalancePence).toBe(15_000);
});

test('inherited months never re-anchor; recurrence runs through them', () => {
  // Anchor in April; May/June inherit April's row (isExplicit false). They must NOT reset to
  // 4_500_000 — they must pay down.
  const configs = [cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 })];
  const r = computeStudentLoan(configs, { year: 2026, month: 6 });
  // May: 4_500_000 − 10_100 = 4_489_900 ; June: − 10_100 = 4_479_800
  expect(r.remainingBalancePence).toBe(4_479_800);
});

test('payoff projection reaches £0 with latest rate/payment held constant', () => {
  const configs = [cfg(2026, 4, { sl_balance_pence: 30_000, sl_interest_rate_pct: 0 })];
  const r = computeStudentLoan(configs, { year: 2026, month: 4 });
  // From £300.00, paying £101/mo, 0% interest → May 198.99? (300−101=199), June 98, July 0 → payoff Jul 2026
  expect(r.payoff).toEqual({ year: 2026, month: 7, remainingInterestPence: 0 });
});

test('no balance ever set → zero result, payoff null', () => {
  const r = computeStudentLoan([cfg(2026, 4)], { year: 2026, month: 6 });
  expect(r.remainingBalancePence).toBe(0);
  expect(r.payoff).toBeNull();
});
```

> Recompute `PAYROLL` and the interest literal if the floor/round lands a pound off — the formulas in the comments are authoritative.

- [ ] **Step 2b: Run to verify failure**

Run: `npm test -w @budget/core -- studentLoan`
Expected: FAIL — `computeStudentLoan` not defined.

- [ ] **Step 3: Implement `computeStudentLoan`**

Create `packages/core/src/studentLoan.ts`:
```ts
import type { SalaryConfig, StudentLoanResult } from './types';
import { walkMonths } from './salaryWalk';

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const daysInYear = (y: number) => (isLeap(y) ? 366 : 365);

// Payroll 9% repayment for a config's month (mirrors calcSalary's slMonthly magnitude exactly).
function payrollRepayment(cfg: SalaryConfig): number {
  const earnings = cfg.gross_yearly_pence + (cfg.bonus_pence ?? 0);
  if (!cfg.sl_enabled || earnings <= cfg.sl_threshold_yearly_pence) return 0;
  return Math.floor(((earnings - cfg.sl_threshold_yearly_pence) * cfg.sl_rate_pct / 100) / 12 / 100) * 100;
}

function monthInterest(balance: number, annualRatePct: number, y: number, m: number): number {
  if (balance <= 0 || annualRatePct <= 0) return 0;
  return Math.round(balance * (annualRatePct / 100) * daysInMonth(y, m) / daysInYear(y));
}

export function computeStudentLoan(
  configs: SalaryConfig[],
  through: { year: number; month: number },
): StudentLoanResult {
  const empty: StudentLoanResult = {
    remainingBalancePence: 0, totalInterestPence: 0, totalPaidTowardBalancePence: 0,
    series: [], payoff: null,
  };
  const walk = walkMonths(configs, through);
  if (walk.length === 0) return empty;

  let balance = 0, totalInterest = 0, totalPaid = 0, anchored = false;
  const series: StudentLoanResult['series'] = [];

  for (const w of walk) {
    const isAnchor = w.isExplicit && w.cfg.sl_balance_pence != null;
    if (isAnchor) {
      balance = w.cfg.sl_balance_pence as number;
      anchored = true;
    } else if (anchored) {
      const interest = monthInterest(balance, w.cfg.sl_interest_rate_pct ?? 0, w.year, w.month);
      const opening = balance + interest;
      const extra = w.isExplicit ? Math.max(0, w.cfg.extra_payment_pence ?? 0) : 0;
      const payment = Math.min(opening, payrollRepayment(w.cfg) + extra);
      balance = opening - payment;
      totalInterest += interest;
      totalPaid += payment;
    }
    series.push({ year: w.year, month: w.month, balancePence: balance });
  }

  // Payoff projection: forward-walk from `through` with the latest config's rate + payroll,
  // no further extra payments, until the balance hits £0.
  let payoff: StudentLoanResult['payoff'] = null;
  if (!anchored || balance <= 0) {
    payoff = balance <= 0 && anchored ? { year: through.year, month: through.month, remainingInterestPence: 0 } : null;
  } else {
    const last = walk[walk.length - 1].cfg;
    const rate = last.sl_interest_rate_pct ?? 0;
    const pay = payrollRepayment(last);
    let bal = balance, y = through.year, m = through.month, interestRem = 0;
    if (pay <= 0 && monthInterest(bal, rate, y, m) > 0) {
      payoff = null; // grows forever
    } else {
      for (let i = 0; i < 1200 && bal > 0; i++) {
        if (m === 12) { y += 1; m = 1; } else { m += 1; }
        const interest = monthInterest(bal, rate, y, m);
        const payment = Math.min(bal + interest, pay);
        bal = bal + interest - payment;
        interestRem += interest;
        if (bal <= 0) { payoff = { year: y, month: m, remainingInterestPence: interestRem }; break; }
      }
    }
  }

  return {
    remainingBalancePence: balance,
    totalInterestPence: totalInterest,
    totalPaidTowardBalancePence: totalPaid,
    series,
    payoff,
  };
}
```

- [ ] **Step 4: Export + run**

Add `export * from './studentLoan';` to `packages/core/src/index.ts`.
Run: `npm test -w @budget/core -- studentLoan`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/studentLoan.ts packages/core/src/studentLoan.test.ts packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): student-loan balance tracker (anchor + interest + payoff projection)"
```

---

## PHASE 3 — UI (Config inputs, tracker box, Summary headline)

### Task 4: Config tab — Set balance, Extra payment, annual-rate label + form-fork reset

**Files:**
- Modify: `apps/web/src/features/salary/salaryState.ts`
- Modify: `apps/web/src/features/salary/ConfigTab.tsx`
- Modify: `apps/web/src/features/salary/Salary.tsx`

- [ ] **Step 1: Fields ↔ config for the event fields**

In `salaryState.ts`:
- Add `extra_payment_pence: ''` to `EMPTY_CONFIG_FIELDS`.
- In `configToFields`: `extra_payment_pence: cfg.extra_payment_pence && cfg.extra_payment_pence > 0 ? poundsToDisplay(cfg.extra_payment_pence) : ''`. (`sl_balance_pence` already maps.)
- In `fieldsToConfig`: `extra_payment_pence: fields.extra_payment_pence ? Math.max(0, Math.round(parseFloat(String(fields.extra_payment_pence)) * 100)) : 0` (clamp ≥ 0). (`sl_balance_pence` already maps: present-of-value = anchor.)

- [ ] **Step 2: Form-fork reset (inherited months don't carry event fields)**

In `Salary.tsx` `load()`, after building `fields = configToFields(resp.config)` for the **inherited** case (`resp.inheritedFrom != null`), reset the two event fields so an inherited month never starts as a false anchor / repeated extra:
```ts
if (resp.inheritedFrom) {
  fields.sl_balance_pence = '';
  fields.extra_payment_pence = '';
}
```
(Keep the existing behavior for exact/explicit months.)

- [ ] **Step 3: Config inputs**

In `ConfigTab.tsx`, in the Student Loan section:
- Relabel the interest input **"Annual interest rate (%)"**.
- Add a **"Set balance (new loan terms)"** checkbox; when ticked, show the balance amount `PoundInput` bound to `sl_balance_pence`; when unticked, set `sl_balance_pence` to `''`. (Tick state = `configFields.sl_balance_pence !== ''`.)
- Add an **"Extra payment this month"** `PoundInput` bound to `extra_payment_pence` (≥0; the clamp in `fieldsToConfig` enforces it).

- [ ] **Step 4: Verify**

Run: `npm run -w @budget/web typecheck && npm run -w @budget/web lint`
Manual: ticking Set balance reveals the amount; saving an explicit month persists it; navigating to an inherited month shows Set-balance unticked and Extra payment blank; editing+saving that month does not create a stale anchor.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/salary/
git commit -m "feat(salary-ui): Config — set-balance anchor, extra payment, annual-rate label, form-fork reset"
```

---

### Task 5: Lifetime tracker box + Summary "Remaining student debt"

**Files:**
- Modify: `apps/web/src/features/salary/SalaryView.tsx` (add `StudentLoanTracker`)
- Modify: `apps/web/src/features/salary/LifetimeTab.tsx`, `Salary.tsx` / `SummaryTab.tsx`

- [ ] **Step 1: Tracker component**

In `SalaryView.tsx`, add:
```tsx
export function StudentLoanTracker({ result, ymLabel }: {
  result: import('@budget/core').StudentLoanResult; ymLabel: string;
}) {
  const row = (label: string, value: string) => (
    <div className="flex justify-between border-b border-hairline py-1">
      <span className="text-ink-muted">{label}</span><span className="tabular-nums text-ink">{value}</span>
    </div>
  );
  const payoff = result.payoff
    ? `${result.payoff.year}-${String(result.payoff.month).padStart(2, '0')} · ${formatGBP(result.payoff.remainingInterestPence)} interest left`
    : '—';
  return (
    <section className="rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">
        Student Loan tracker <span className="font-normal text-ink-faint text-sm">— as of {ymLabel}</span>
      </h2>
      <dl className="space-y-1 text-sm">
        {row('Remaining balance', formatGBP(result.remainingBalancePence))}
        {row('Total interest accrued', formatGBP(result.totalInterestPence))}
        {row('Total paid toward balance', formatGBP(result.totalPaidTowardBalancePence))}
        {row('Projected payoff', payoff)}
      </dl>
    </section>
  );
}
```

- [ ] **Step 2: Render on Lifetime**

In `LifetimeTab.tsx`, compute `const sl = computeStudentLoan(allConfigs, ymToYearMonth(ym))` (or accept it as a prop alongside `lifetime`) and render `<StudentLoanTracker result={sl} ymLabel={monthLabel(ym)} />` below the Lifetime totals box (replacing the Spec A placeholder comment).

- [ ] **Step 3: Wire Summary headline**

In `Salary.tsx`, compute `const sl = useMemo(() => computeStudentLoan(allConfigs, ymToYearMonth(ym)), [allConfigs, ym])` and pass `studentDebtPence={sl.remainingBalancePence}` into the Summary `KeyFigures` (replacing the Spec A `null`).

- [ ] **Step 4: Verify**

Run: `npm run -w @budget/web typecheck && npm run -w @budget/web lint && npm test -w @budget/web`
Manual: set a balance in an early month; Lifetime tracker shows balance falling month-over-month, interest accruing, payoff projected; Summary "Remaining student debt" matches the tracker's remaining balance for the selected month.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/salary/
git commit -m "feat(salary-ui): student-loan tracker box (Lifetime) + Remaining student debt (Summary)"
```

---

### Task 6: Demo seed anchor

**Files:**
- Modify: `apps/api/src/seed-demo.ts`

- [ ] **Step 1: Seed a starting balance**

In `apps/api/src/seed-demo.ts`, on the **first** seeded salary-config month, set `sl_balance_pence` to a realistic figure (e.g. `4_500_000`) and a plausible `sl_interest_rate_pct` (the existing `4.3`, now interpreted as annual). Leave `extra_payment_pence: 0` on all months. Later months keep `sl_balance_pence: null` (so the recurrence runs; only the first month anchors).

- [ ] **Step 2: Verify**

Run: `npm run seed:demo` (or the project's demo-seed command), then `npm run dev` → Salary → Lifetime shows a populated tracker with a falling balance.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/seed-demo.ts
git commit -m "chore(demo): seed a student-loan starting balance for the tracker"
```

---

## Final verification

- [ ] `npm test` (all workspaces) + `npm run -w @budget/web typecheck && npm run -w @budget/web lint`.
- [ ] `cd apps/desktop/src-tauri && cargo test` (migration + column-presence test pass).
- [ ] Manual smoke on `http://192.168.14.102:5001`: set balance → Lifetime tracker + Summary headline reconcile; extra payment reduces balance faster than payroll alone; payoff date moves with extra payments; inherited months don't re-anchor.
- [ ] Confirm the **two paid figures** differ once an extra payment exists: Lifetime "Student loan paid" (Σ payroll) vs tracker "Total paid toward balance" (payroll + extra) — this is expected, not a bug.
- [ ] Use **superpowers:finishing-a-development-branch** to complete.

---

## Self-review notes (coverage vs spec)

- Spec §2.1 inputs (anchor non-inheriting, extra ≥0, annual rate) → Tasks 2, 4.
- Spec §2.2 recurrence (anchor declared-closing, interest 365/366, floor/cap) → Task 3.
- Spec §2.3 anchor-vs-inheritance guard (`isExplicit`) → Task 3 (+ form-fork reset Task 4).
- Spec §3 outputs (remaining, interest, paid, series) + §3.1 payoff projection → Task 3.
- Spec §4 UI placement (Config inputs, Lifetime box, Summary headline) → Tasks 4, 5.
- Spec §5 data layer (extra_payment column both adapters + both migrations + parity) → Tasks 1, 2.
- Spec §6 two paid figures → preserved (Lifetime "paid" untouched; tracker "paid" separate) + final-check assertion.
- Spec §7 interest-rate redefine (annual, relabel) → Task 4.
- Spec §8 tests → Tasks 1–3; §10 preserve (payroll math untouched) → stated at top.
