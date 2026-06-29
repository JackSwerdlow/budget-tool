# Salary Sub-tabs + Lifetime Aggregation — Implementation Plan (Spec A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Salary tab into Summary/Lifetime/Config sub-tabs, add a lifetime cumulative-as-of-month aggregation, and make the pension figures a real forecast (employer-pension YTD).

**Architecture:** A new pure `walkMonths` (the shared month-walk, exposes per-month `isExplicit`) and a `computeLifetime` engine in `@budget/core`, both layered on the **untouched, payslip-validated** `calcSalary` + `computeSalaryYTD` kernels (lifetime totals are sourced from per-tax-year *cumulative* slices, never from summed monthly columns). One new `DataPort` method (`getAllSalaryConfigs`) and a widened `getSalaryYTD` cross both adapters with parity tests. The UI splits the 557-line `Salary.tsx` into a sub-tab shell + three tab components.

**Tech Stack:** TypeScript monorepo · `@budget/core` (vitest) · React + Tailwind (`apps/web`) · Hono + node:sqlite (`apps/api`) · Tauri v2 + rusqlite (`apps/desktop`).

**Source spec:** `docs/superpowers/specs/2026-06-20-salary-subtabs-and-lifetime-design.md`.

**Load-bearing constraints (read before starting):**
- **Do NOT modify** `taxOnCumulative` or the monthly cumulative-PAYE block in `packages/core/src/salary.ts`. The redesign layers a view; it never re-derives PAYE.
- **TS2835 ban:** `apps/api/` must not `import` (even `import type`) from `@budget/core`. `repo.ts` keeps its own inline copies of the YTD types + math — change them in lockstep with the core versions.
- **Canonical lifetime definition:** lifetime totals come from **cumulative slices** (`computeSalaryYTD` fields + `calcSalary`'s YTD column), summed across tax years. Income tax telescopes exactly (cumulative differences); the rounded fields (gross/NI/SL/pension) do **not** equal `Σ` of monthly columns — never assert that equality without a ±pence tolerance.
- **Tax-band assumption:** PA / basic-rate band / additional-rate threshold are assumed constant within a tax year (a mid-year *pay* change is captured by the cumulative; a mid-year *band* change would use the last month's bands for that year's cumulative). This is the same assumption the shipped Breakdown already makes — state it, don't fix it.

---

## File Structure

**Create:**
- `packages/core/src/salaryWalk.ts` — `walkMonths(configs, through)` → `WalkMonth[]` (per-month resolved cfg + `isExplicit`).
- `packages/core/src/salaryWalk.test.ts`
- `packages/core/src/salaryLifetime.ts` — `computeLifetime(configs, through)` → `LifetimeTotals`.
- `packages/core/src/salaryLifetime.test.ts`
- `apps/web/src/features/salary/SummaryTab.tsx`, `LifetimeTab.tsx`, `ConfigTab.tsx`, `salaryState.ts` (shared form-state helpers extracted from `Salary.tsx`).

**Modify:**
- `packages/core/src/types.ts` — widen `SalaryYTD`, `SalaryYTDInput`; add `WalkMonth`, `LifetimeTotals`.
- `packages/core/src/salaryYtd.ts` — widen `YTDConfigRow` + `computeSalaryYTD` (employer pension + bonus YTD).
- `packages/core/src/salary.ts` — pension panel: annualise → forecast.
- `packages/core/src/index.ts` — export the two new modules.
- `packages/core/src/salaryYtd.test.ts`, `salary.test.ts` — update widened-shape expectations; add forecast-pension tests.
- `apps/api/src/repo.ts` — widen inline YTD trio; add `getAllSalaryConfigs`.
- `apps/api/src/app.ts` — `GET /salary-configs` route.
- `apps/web/src/data/port.ts`, `http.ts`, `queries.ts` — `getAllSalaryConfigs` + widened YTD select.
- `apps/web/src/data/queries.test.ts` — parity for both.
- `apps/web/src/features/salary/Salary.tsx` — becomes the sub-tab shell.
- `apps/web/src/features/salary/SalaryView.tsx` — add `KeyFigures` + `LifetimeTotalsTable`; export shared `Row` helper.

---

## PHASE 1 — Core engine (pure, fully tested)

### Task 1: Widen `computeSalaryYTD` with employer-pension + bonus YTD

**Files:**
- Modify: `packages/core/src/types.ts` (`SalaryYTD`, `SalaryYTDInput`)
- Modify: `packages/core/src/salaryYtd.ts` (`YTDConfigRow`, `computeSalaryYTD`)
- Test: `packages/core/src/salaryYtd.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `packages/core/src/salaryYtd.test.ts`, add `employer_pension_pct: 28.97` to the `JUNE_2026` fixture (after `employee_pension_pct`), and extend both `toEqual` objects with the two new fields:

```ts
// JUNE_2026 single-month test — add to the expected object:
    employerPensionYTDPence: 143_561, // round(5_946_600 × 28.97/100) / 12, rounded
    bonusYTDPence: 0,
```
```ts
// "no employment start" test — add to the expected object:
    employerPensionYTDPence: 0, bonusYTDPence: 0,
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @budget/core -- salaryYtd`
Expected: FAIL — `employerPensionYTDPence`/`bonusYTDPence` missing from output.

- [ ] **Step 3: Widen the types**

In `packages/core/src/types.ts`, add to `SalaryYTD` (after `slYTDPence`):
```ts
  employerPensionYTDPence: number;
  bonusYTDPence: number;
```
Add to `SalaryYTDInput` (after `employeePensionYTDPence`):
```ts
  employerPensionYTDPence: number;
```

- [ ] **Step 4: Widen `YTDConfigRow` + `computeSalaryYTD`**

In `packages/core/src/salaryYtd.ts`:
- Add `employer_pension_pct: number;` to `YTDConfigRow` (after `employee_pension_pct`).
- In `empty`, add `employerPensionYTDPence: 0, bonusYTDPence: 0,`.
- Add accumulators: `let empPenYTD = 0, bonusYTD = 0;`.
- Inside the `if (cfg)` block, after `const pensionY = ...`:
```ts
      const empPenY = Math.round(grossY * cfg.employer_pension_pct / 100);
```
  and inside the accumulation group add:
```ts
      empPenYTD += empPenY / 12;
      bonusYTD  += bonusY / 12;
```
- In the return object add:
```ts
    employerPensionYTDPence: Math.round(empPenYTD),
    bonusYTDPence:           Math.round(bonusYTD),
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -w @budget/core -- salaryYtd`
Expected: PASS. (If `employerPensionYTDPence` differs by ±1, recompute `round(round(5_946_600×28.97/100)/12)` and use the actual value — the formula, not the literal, is authoritative.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/salaryYtd.ts packages/core/src/salaryYtd.test.ts
git commit -m "feat(core): widen computeSalaryYTD with employer-pension + bonus YTD"
```

---

### Task 2: Shared month-walk `walkMonths`

**Files:**
- Modify: `packages/core/src/types.ts` (add `WalkMonth`)
- Create: `packages/core/src/salaryWalk.ts`
- Create: `packages/core/src/salaryWalk.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the `WalkMonth` type**

In `packages/core/src/types.ts`:
```ts
// One calendar month in the lifetime walk. `cfg` is the resolved (inherited) config with
// its year/month set to THIS month; `isExplicit` = this month has its own saved row.
export type WalkMonth = {
  year: number;
  month: number;
  isExplicit: boolean;
  cfg: SalaryConfig;
};
```

- [ ] **Step 2: Write the failing test**

Create `packages/core/src/salaryWalk.test.ts`:
```ts
import { test, expect } from 'vitest';
import { walkMonths } from './salaryWalk';
import type { SalaryConfig } from './types';

const cfg = (year: number, month: number, gross: number): SalaryConfig => ({
  year, month, gross_yearly_pence: gross, note: null,
  hours_per_week: 37, work_weeks_per_year: 52, work_days_per_week: 5,
  employee_pension_pct: 5, employer_pension_pct: 10,
  personal_allowance_pence: 1_257_000, basic_rate_band_pence: 3_770_100,
  additional_rate_threshold_pence: 12_514_000,
  basic_rate_pct: 20, higher_rate_pct: 40, additional_rate_pct: 45,
  ni_lower_monthly_pence: 104_750, ni_upper_monthly_pence: 418_917, ni_primary_pct: 8, ni_upper_pct: 2,
  sl_enabled: false, sl_threshold_yearly_pence: 2_847_000, sl_rate_pct: 9,
  sl_balance_pence: null, sl_interest_rate_pct: null, bonus_pence: 0,
});

test('walks first→through inclusive, resolving inheritance and flagging explicit months', () => {
  const configs = [cfg(2025, 11, 4_200_000), cfg(2026, 2, 5_000_000)];
  const w = walkMonths(configs, { year: 2026, month: 3 });
  expect(w.map((m) => `${m.year}-${m.month}`)).toEqual([
    '2025-11', '2025-12', '2026-1', '2026-2', '2026-3',
  ]);
  expect(w[0].isExplicit).toBe(true);          // Nov saved
  expect(w[1].isExplicit).toBe(false);         // Dec inherits Nov
  expect(w[1].cfg.gross_yearly_pence).toBe(4_200_000);
  expect(w[3].isExplicit).toBe(true);          // Feb saved
  expect(w[4].cfg.gross_yearly_pence).toBe(5_000_000); // Mar inherits Feb
  expect(w[4].cfg.month).toBe(3);              // cfg month set to the walked month
});

test('empty configs → empty walk; through before first config → empty walk', () => {
  expect(walkMonths([], { year: 2026, month: 3 })).toEqual([]);
  expect(walkMonths([cfg(2026, 5, 4_200_000)], { year: 2026, month: 1 })).toEqual([]);
});
```

- [ ] **Step 2b: Run to verify it fails**

Run: `npm test -w @budget/core -- salaryWalk`
Expected: FAIL — `walkMonths` not defined.

- [ ] **Step 3: Implement `walkMonths`**

Create `packages/core/src/salaryWalk.ts`:
```ts
import type { SalaryConfig, WalkMonth } from './types';

const idx = (y: number, m: number) => y * 12 + (m - 1);

// Iterate every calendar month from the earliest saved config through `through` (inclusive),
// resolving config inheritance (latest saved config at or before the month) and flagging
// whether the month has its own saved row. Returns [] when there are no configs or `through`
// precedes the first one.
export function walkMonths(
  configs: SalaryConfig[],
  through: { year: number; month: number },
): WalkMonth[] {
  if (configs.length === 0) return [];
  const sorted = [...configs].sort((a, b) => idx(a.year, a.month) - idx(b.year, b.month));
  const first = sorted[0];
  const endIdx = idx(through.year, through.month);
  if (endIdx < idx(first.year, first.month)) return [];

  const out: WalkMonth[] = [];
  let y = first.year, m = first.month;
  while (idx(y, m) <= endIdx) {
    // latest config at or before (y, m)
    let resolved = sorted[0];
    for (const c of sorted) {
      if (idx(c.year, c.month) <= idx(y, m)) resolved = c; else break;
    }
    const isExplicit = sorted.some((c) => c.year === y && c.month === m);
    out.push({ year: y, month: m, isExplicit, cfg: { ...resolved, year: y, month: m } });
    if (m === 12) { y += 1; m = 1; } else { m += 1; }
  }
  return out;
}
```

- [ ] **Step 4: Export + run**

Add `export * from './salaryWalk';` to `packages/core/src/index.ts` (after the `salaryYtd` line).
Run: `npm test -w @budget/core -- salaryWalk`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/salaryWalk.ts packages/core/src/salaryWalk.test.ts packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): shared month-walk (walkMonths) with per-month isExplicit"
```

---

### Task 3: Lifetime aggregation engine `computeLifetime`

**Files:**
- Modify: `packages/core/src/types.ts` (add `LifetimeTotals`)
- Create: `packages/core/src/salaryLifetime.ts`
- Create: `packages/core/src/salaryLifetime.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the `LifetimeTotals` type**

In `packages/core/src/types.ts`:
```ts
// Cumulative actuals from the first recorded month through the selected month. All positive
// magnitudes (pence) except netTakeHomePence. Sourced from per-tax-year cumulative slices.
export type LifetimeTotals = {
  monthsCount: number;
  grossPence: number;
  basePayPence: number;
  bonusPence: number;
  employeePensionPence: number;
  incomeTaxPence: number;
  allowanceUsedPence: number;
  basicPence: number;
  higherPence: number;
  additionalPence: number;
  niPence: number;
  studentLoanPaidPence: number;   // Σ payroll deductions (payslip fact)
  netTakeHomePence: number;
  employerPensionPence: number;
  pensionPotPence: number;        // employer + employee
};
```

- [ ] **Step 2: Write the failing tests** (reconciliation + load-bearing PAYE-reset)

Create `packages/core/src/salaryLifetime.test.ts`:
```ts
import { test, expect } from 'vitest';
import { computeLifetime } from './salaryLifetime';
import { calcSalary } from './salary';
import { computeSalaryYTD } from './salaryYtd';
import type { SalaryConfig } from './types';

const base = (year: number, month: number, gross: number): SalaryConfig => ({
  year, month, gross_yearly_pence: gross, note: null,
  hours_per_week: 37, work_weeks_per_year: 52, work_days_per_week: 5,
  employee_pension_pct: 5.45, employer_pension_pct: 28.97,
  personal_allowance_pence: 1_257_000, basic_rate_band_pence: 3_770_100,
  additional_rate_threshold_pence: 12_514_000,
  basic_rate_pct: 20, higher_rate_pct: 40, additional_rate_pct: 45,
  ni_lower_monthly_pence: 104_750, ni_upper_monthly_pence: 418_917, ni_primary_pct: 8, ni_upper_pct: 2,
  sl_enabled: true, sl_threshold_yearly_pence: 2_847_000, sl_rate_pct: 9,
  sl_balance_pence: null, sl_interest_rate_pct: null, bonus_pence: 0,
});

// RECONCILIATION (wiring): a single tax year → lifetime totals equal calcSalary's YTD column
// for the selected month (both are the same cumulative slice).
test('single-tax-year lifetime equals the Breakdown YTD column', () => {
  const configs = [base(2026, 4, 5_946_600)]; // employed from Apr 2026 (start of tax year)
  const through = { year: 2026, month: 9 };    // 6 months into TY2026
  const life = computeLifetime(configs, through);

  const ytd = computeSalaryYTD(
    configs.map((c) => ({ ...c, sl_enabled: c.sl_enabled ? 1 : 0 })) as never,
    { year: 2026, month: 4 }, 2026, 9,
  );
  const bd = calcSalary(base(2026, 9, 5_946_600), { year: 2026, month: 4 }, {
    adjustedNetYTDPence: ytd.adjustedNetYTDPence, priorAdjNetYTDPence: ytd.priorAdjNetYTDPence,
    grossYTDPence: ytd.grossYTDPence, employeePensionYTDPence: ytd.employeePensionYTDPence,
    employerPensionYTDPence: ytd.employerPensionYTDPence,
    niYTDPence: ytd.niYTDPence, slYTDPence: ytd.slYTDPence,
  }).view;
  const find = (k: string) => {
    const walk = (ls: typeof bd.breakdown): typeof bd.breakdown[number] | undefined => {
      for (const l of ls) { if (l.key === k) return l; const c = l.children && walk(l.children); if (c) return c; }
    };
    return walk(bd.breakdown)!;
  };
  expect(life.grossPence).toBe(ytd.grossYTDPence);
  expect(life.incomeTaxPence).toBe(-find('incomeTax').cell.ytd!);
  expect(life.netTakeHomePence).toBe(find('netIncome').cell.ytd);
  expect(life.employerPensionPence).toBe(ytd.employerPensionYTDPence);
});

// LOAD-BEARING: two tax years with a mid-year pay change; income tax is the SUM of each
// tax year's own actual PAYE (April reset). Expected tax is hand-derived, NOT generated by
// calcSalary. (Salary chosen to stay entirely in the basic-rate band so the arithmetic is
// hand-checkable: tax = 20% of (gross − pension − personal allowance) per tax year.)
test('lifetime income tax = Σ per-tax-year actual PAYE (April reset)', () => {
  // TY2025: 12 months @ £30,000 (Apr 2025 – Mar 2026). Pension 5.45%. PA £12,570. BRB ample.
  // adjusted net = 30000 − 1635 = 28,365 → taxable = 28,365 − 12,570 = 15,795 → 20% = 3,159.00
  // TY2026: 6 months Apr–Sep 2026 @ £42,000. adjusted net for 6/12 yr = 21,000 − 1,144.50 = 19,855.50
  //   cumulative taxable at period 6 = floor(1_985_550 − 6×104_750? ...) — see note below.
  const a = base(2025, 4, 3_000_000);
  const b = base(2026, 4, 4_200_000);
  const through = { year: 2026, month: 9 };
  const life = computeLifetime([a, b], through);

  // Per-tax-year actual PAYE, summed independently (hand-anchored; recompute with the
  // payslip formula if the engine's exact-band rounding shifts a few pence and lock the
  // observed value — the POINT of this test is that the two years are summed with a reset,
  // never spanned by one cumulative call).
  const tyA = computeSalaryYTD([{ ...a, sl_enabled: 1 } as never], { year: 2025, month: 4 }, 2026, 3);
  const tyAtax = -calcSalaryTaxYTD(a, { year: 2025, month: 4 }, tyA, 2026, 3);
  const tyB = computeSalaryYTD([{ ...b, sl_enabled: 1 } as never], { year: 2026, month: 4 }, 2026, 9);
  const tyBtax = -calcSalaryTaxYTD(b, { year: 2026, month: 4 }, tyB, 2026, 9);
  expect(life.incomeTaxPence).toBe(tyAtax + tyBtax);
  // And it must NOT equal a single cumulative spanning both years:
  const spanning = computeSalaryYTD(
    [{ ...a, sl_enabled: 1 } as never, { ...b, sl_enabled: 1 } as never],
    { year: 2025, month: 4 }, 2026, 9,
  );
  const spanningTax = -calcSalaryTaxYTD(b, { year: 2025, month: 4 }, spanning, 2026, 9);
  expect(life.incomeTaxPence).not.toBe(spanningTax);
});

// helper: income-tax YTD column from calcSalary for a given (cfg, employmentStart, ytd, y, m)
function calcSalaryTaxYTD(
  cfg: SalaryConfig, start: { year: number; month: number },
  ytd: ReturnType<typeof computeSalaryYTD>, y: number, m: number,
): number {
  const v = calcSalary({ ...cfg, year: y, month: m }, start, {
    adjustedNetYTDPence: ytd.adjustedNetYTDPence, priorAdjNetYTDPence: ytd.priorAdjNetYTDPence,
    grossYTDPence: ytd.grossYTDPence, employeePensionYTDPence: ytd.employeePensionYTDPence,
    employerPensionYTDPence: ytd.employerPensionYTDPence,
    niYTDPence: ytd.niYTDPence, slYTDPence: ytd.slYTDPence,
  }).view;
  const find = (k: string) => {
    const walk = (ls: typeof v.breakdown): typeof v.breakdown[number] | undefined => {
      for (const l of ls) { if (l.key === k) return l; const c = l.children && walk(l.children); if (c) return c; }
    };
    return walk(v.breakdown)!;
  };
  return find('incomeTax').cell.ytd!;
}
```

> **Implementer note:** the second test asserts the engine equals "sum of per-TY slices" and is **not equal** to a single spanning cumulative — that inequality is the real proof of the April reset. Keep `calcSalaryTaxYTD` as the only tax source so you never hand-transcribe band arithmetic; the structural `toBe`/`not.toBe` is what matters.

- [ ] **Step 2b: Run to verify it fails**

Run: `npm test -w @budget/core -- salaryLifetime`
Expected: FAIL — `computeLifetime` not defined.

- [ ] **Step 3: Implement `computeLifetime`**

Create `packages/core/src/salaryLifetime.ts`:
```ts
import type { LifetimeTotals, SalaryConfig, SalaryView } from './types';
import { calcSalary } from './salary';
import { computeSalaryYTD, type YTDConfigRow } from './salaryYtd';

const idx = (y: number, m: number) => y * 12 + (m - 1);
const taxYearOf = (y: number, m: number) => (m >= 4 ? y : y - 1);
const toYtdRow = (c: SalaryConfig): YTDConfigRow => ({
  year: c.year, month: c.month, gross_yearly_pence: c.gross_yearly_pence,
  bonus_pence: c.bonus_pence ?? 0, employee_pension_pct: c.employee_pension_pct,
  employer_pension_pct: c.employer_pension_pct,
  ni_lower_monthly_pence: c.ni_lower_monthly_pence, ni_upper_monthly_pence: c.ni_upper_monthly_pence,
  ni_primary_pct: c.ni_primary_pct, ni_upper_pct: c.ni_upper_pct,
  sl_enabled: c.sl_enabled ? 1 : 0, sl_threshold_yearly_pence: c.sl_threshold_yearly_pence,
  sl_rate_pct: c.sl_rate_pct,
});

const zero: LifetimeTotals = {
  monthsCount: 0, grossPence: 0, basePayPence: 0, bonusPence: 0, employeePensionPence: 0,
  incomeTaxPence: 0, allowanceUsedPence: 0, basicPence: 0, higherPence: 0, additionalPence: 0,
  niPence: 0, studentLoanPaidPence: 0, netTakeHomePence: 0, employerPensionPence: 0, pensionPotPence: 0,
};

function findCell(view: SalaryView, key: string) {
  const walk = (ls: SalaryView['breakdown']): SalaryView['breakdown'][number] | undefined => {
    for (const l of ls) { if (l.key === key) return l; const c = l.children && walk(l.children); if (c) return c; }
  };
  return walk(view.breakdown);
}

// Cumulative actuals first→through. Sums per-tax-year cumulative slices (each via the
// validated computeSalaryYTD + calcSalary YTD column) so PAYE resets every April. Months in a
// tax year with no saved config in that tax year contribute nothing (mirrors getSalaryYTD's
// getFirstConfigInTaxYear contract).
export function computeLifetime(
  configs: SalaryConfig[],
  through: { year: number; month: number },
): LifetimeTotals {
  if (configs.length === 0) return { ...zero };
  const sorted = [...configs].sort((a, b) => idx(a.year, a.month) - idx(b.year, b.month));
  if (idx(through.year, through.month) < idx(sorted[0].year, sorted[0].month)) return { ...zero };

  const firstTY = taxYearOf(sorted[0].year, sorted[0].month);
  const throughTY = taxYearOf(through.year, through.month);
  const out: LifetimeTotals = { ...zero };

  for (let ty = firstTY; ty <= throughTY; ty++) {
    const inTY = sorted.filter((c) => taxYearOf(c.year, c.month) === ty);
    if (inTY.length === 0) continue;
    const start = { year: inTY[0].year, month: inTY[0].month };
    // slice end: full year (March) for a completed TY, else `through`.
    const end = ty < throughTY ? { year: ty + 1, month: 3 } : through;
    if (idx(start.year, start.month) > idx(end.year, end.month)) continue;

    const ytd = computeSalaryYTD(inTY.map(toYtdRow), start, end.year, end.month);
    // last saved config at or before `end` (drives this TY's bands)
    let lastCfg = inTY[0];
    for (const c of inTY) { if (idx(c.year, c.month) <= idx(end.year, end.month)) lastCfg = c; }
    const view = calcSalary({ ...lastCfg, year: end.year, month: end.month }, start, {
      adjustedNetYTDPence: ytd.adjustedNetYTDPence, priorAdjNetYTDPence: ytd.priorAdjNetYTDPence,
      grossYTDPence: ytd.grossYTDPence, employeePensionYTDPence: ytd.employeePensionYTDPence,
      employerPensionYTDPence: ytd.employerPensionYTDPence,
      niYTDPence: ytd.niYTDPence, slYTDPence: ytd.slYTDPence,
    }).view;

    const ytdOf = (k: string) => findCell(view, k)?.cell.ytd ?? 0;
    // months actually counted this TY:
    const months = idx(end.year, end.month) - idx(start.year, start.month) + 1;

    out.monthsCount          += months;
    out.grossPence           += ytd.grossYTDPence;
    out.bonusPence           += ytd.bonusYTDPence;
    out.basePayPence         += ytd.grossYTDPence - ytd.bonusYTDPence;
    out.employeePensionPence += ytd.employeePensionYTDPence;
    out.employerPensionPence += ytd.employerPensionYTDPence;
    out.pensionPotPence      += ytd.employeePensionYTDPence + ytd.employerPensionYTDPence;
    out.niPence              += ytd.niYTDPence;
    out.studentLoanPaidPence += ytd.slYTDPence;
    out.incomeTaxPence       += -ytdOf('incomeTax');
    out.basicPence           += -ytdOf('taxBasic');
    out.higherPence          += -ytdOf('taxHigher');
    out.additionalPence      += -ytdOf('taxAddl');
    out.allowanceUsedPence   += ytdOf('allowanceUsed');
    out.netTakeHomePence     += ytdOf('netIncome');
  }
  return out;
}
```

- [ ] **Step 4: Export + run**

Add `export * from './salaryLifetime';` to `packages/core/src/index.ts`.
Run: `npm test -w @budget/core -- salaryLifetime`
Expected: PASS. (If the load-bearing test's exact tax shifts by pennies, the `toBe(tyAtax + tyBtax)` and `not.toBe(spanningTax)` still hold — they're computed from the same engine, by design.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/salaryLifetime.ts packages/core/src/salaryLifetime.test.ts packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): lifetime aggregation engine (per-tax-year cumulative slices, April reset)"
```

---

### Task 4: Pension panel — annualise → real forecast

**Files:**
- Modify: `packages/core/src/salary.ts` (forecast block + pension rows)
- Test: `packages/core/src/salary.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/salary.test.ts`:
- Update the existing widened-YTD-input test object (the `describe('calcSalary — widened YTD input is backward compatible')` block) to include the now-required field:
```ts
      employerPensionYTDPence: 10 * 143_561,
```
- Add a new describe block:
```ts
describe('calcSalary — view: pension forecast', () => {
  it('steady-state employer/employee forecast equals annualise (full-year span)', () => {
    const r = calcSalary(BASE);
    const employer = r.view.pension.find((x) => x.key === 'employer')!;
    const employee = r.view.pension.find((x) => x.key === 'employee')!;
    expect(employer.yearlyForecast).toBe(employer.month * 12);
    expect(employee.yearlyForecast).toBe(employee.month * 12);
  });

  it('mid-year (Nov start) employer pension forecast is the partial-year figure', () => {
    const cfg = { ...BASE, year: 2025, month: 11 };
    const r = calcSalary(cfg, { year: 2025, month: 11 });
    const employer = r.view.pension.find((x) => x.key === 'employer')!;
    // 5 months employed this TY → forecast = 5 actual + 7 remaining at current rate = 12 × month
    expect(employer.yearlyForecast).toBe(employer.month * 12);
    // total row = employer + employee on the SAME (forecast) basis
    const total = r.view.pension.find((x) => x.key === 'total')!;
    expect(total.yearlyForecast).toBe(
      employer.yearlyForecast + r.view.pension.find((x) => x.key === 'employee')!.yearlyForecast,
    );
  });
});
```

> Note: with no `ytdInput` the forecast falls back to `monthsEmployed × rate + remaining × rate = 12 × rate`, so steady-state and the no-YTD mid-year case both equal annualise; the real divergence appears only when actual `ytdInput` is supplied (covered end-to-end after Phase 2). These tests lock the wiring + the consistent basis.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @budget/core -- salary.test`
Expected: FAIL on the widened-input object (missing field) and the new pension block referencing forecast wiring.

- [ ] **Step 3: Implement the employer-pension forecast**

In `packages/core/src/salary.ts`, in the forecast block (near `empPenFC`, ~line 233), add:
```ts
  const employerPenYTDmag = ytdInput ? ytdInput.employerPensionYTDPence : monthsEmployed * employerPensionM;
  const employerPenFC = employerPenYTDmag + remaining * employerPensionM;
```
Then replace the Phase-1 pension rows (the `employerMonthly`/`employeeMonthly` annualise block, ~lines 359-365) with forecast-based rows:
```ts
  const employerMonthly = employerPensionM;          // positive contribution this month
  const employeeMonthly = -employeePensionMonthly;   // positive contribution this month
  const pension: PensionRow[] = [
    { key: 'employer', label: 'Employer', month: employerMonthly, yearlyForecast: employerPenFC, allTime: null },
    { key: 'employee', label: 'Employee', month: employeeMonthly, yearlyForecast: empPenFC, allTime: null },
    { key: 'total', label: 'Into pot', month: employerMonthly + employeeMonthly, yearlyForecast: employerPenFC + empPenFC, allTime: null },
  ];
```

- [ ] **Step 4: Run the full core suite**

Run: `npm test -w @budget/core`
Expected: PASS (all existing payslip numbers unchanged; new pension tests pass).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/salary.ts packages/core/src/salary.test.ts
git commit -m "feat(core): pension panel forecast (employer-pension YTD) replaces interim annualise"
```

---

## PHASE 2 — Cross-adapter data (the "one rule" + parity)

### Task 5: Widen `getSalaryYTD` (employer pension + bonus) across both adapters

**Files:**
- Modify: `apps/api/src/repo.ts` (inline `YTDConfigRow`, `SalaryYTD`, `getSalaryYTD`)
- Modify: `apps/web/src/data/queries.ts` (`YTDConfigRow` type + the YTD SELECT)
- Test: `apps/web/src/data/queries.test.ts`

- [ ] **Step 1: Update the failing parity test**

In `apps/web/src/data/queries.test.ts`, extend the `getSalaryYTD` `toEqual` object (the `'salary: getSalaryYTD matches the core engine'` test) with:
```ts
    employerPensionYTDPence: 143_561, bonusYTDPence: 0,
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @budget/web -- queries`
Expected: FAIL — missing fields in the returned YTD.

- [ ] **Step 3: Widen the API inline copy (`repo.ts`)**

In `apps/api/src/repo.ts`:
- Add `employer_pension_pct: number;` to the inline `YTDConfigRow` (after `employee_pension_pct`).
- Add `employerPensionYTDPence: number; bonusYTDPence: number;` to the inline `SalaryYTD`.
- In `getSalaryYTD`'s `empty`, add `employerPensionYTDPence: 0, bonusYTDPence: 0,`.
- Add `employer_pension_pct` to the `taxYearConfigs` SELECT column list (after `employee_pension_pct`).
- Add accumulators `let empPenYTD = 0, bonusYTD = 0;` and inside the loop:
```ts
      const empPenY = Math.round(grossY * cfg.employer_pension_pct / 100);
      empPenYTD += empPenY / 12;
      bonusYTD  += bonusY / 12;
```
- Add to the return object:
```ts
    employerPensionYTDPence: Math.round(empPenYTD),
    bonusYTDPence:           Math.round(bonusYTD),
```

- [ ] **Step 4: Widen the Tauri SELECT (`queries.ts`)**

In `apps/web/src/data/queries.ts`:
- Add `employer_pension_pct: number;` to the local `YTDConfigRow` type (if declared there; otherwise it imports from `@budget/core` — confirm and update the right one).
- Add `employer_pension_pct` to the `getSalaryYTD` SELECT column list (after `employee_pension_pct`). The Tauri path delegates to the core `computeSalaryYTD`, which now emits the new fields automatically.

- [ ] **Step 5: Run parity + API tests**

Run: `npm test -w @budget/web -- queries` and `npm test -w @budget/api`
Expected: PASS. (Update the API's own `app.test.ts` YTD expectation too if it asserts the full object — search for `slYTDPence` there and add the two fields.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repo.ts apps/web/src/data/queries.ts apps/web/src/data/queries.test.ts apps/api/src/app.test.ts
git commit -m "feat(data): widen getSalaryYTD with employer-pension + bonus YTD (both adapters)"
```

---

### Task 6: `getAllSalaryConfigs` DataPort method

**Files:**
- Modify: `apps/web/src/data/port.ts`
- Modify: `apps/api/src/repo.ts`, `apps/api/src/app.ts`
- Modify: `apps/web/src/data/http.ts`, `apps/web/src/data/queries.ts`
- Test: `apps/web/src/data/queries.test.ts`

- [ ] **Step 1: Write the failing parity test**

In `apps/web/src/data/queries.test.ts`, add:
```ts
test('salary: getAllSalaryConfigs returns every saved row ascending', async () => {
  const { port } = freshPort();
  await port.saveSalaryConfig({ ...SALARY_CFG, year: 2026, month: 6 }, 335_995);
  await port.saveSalaryConfig({ ...SALARY_CFG, year: 2026, month: 4, gross_yearly_pence: 4_200_000 }, 280_000);
  const all = await port.getAllSalaryConfigs();
  expect(all.map((c) => `${c.year}-${c.month}`)).toEqual(['2026-4', '2026-6']);
  expect(all[0].gross_yearly_pence).toBe(4_200_000);
  expect(all[1].sl_enabled).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @budget/web -- queries`
Expected: FAIL — `getAllSalaryConfigs` not on the port.

- [ ] **Step 3: Add to the `DataPort` interface**

In `apps/web/src/data/port.ts`, add to the interface (near the other salary methods):
```ts
  getAllSalaryConfigs(): Promise<SalaryConfig[]>;
```

- [ ] **Step 4: Implement the API side**

In `apps/api/src/repo.ts`, add:
```ts
export function getAllSalaryConfigs(db: DatabaseSync): SalaryConfig[] {
  const rows = db.prepare('SELECT * FROM salary_config ORDER BY year ASC, month ASC').all() as SalaryConfigRow[];
  return rows.map(rowToConfig);
}
```
In `apps/api/src/app.ts`, add a route (next to the other salary routes) and import `getAllSalaryConfigs`:
```ts
  api.get('/salary-configs', (c) => c.json(getAllSalaryConfigs(db)));
```

- [ ] **Step 5: Implement the HTTP adapter**

In `apps/web/src/data/http.ts`, add (and include in the exported object at the bottom):
```ts
export async function getAllSalaryConfigs(): Promise<SalaryConfig[]> {
  const res = await fetch(`${API}salary-configs`);
  if (!res.ok) throw new Error(`getAllSalaryConfigs failed: ${res.status}`);
  return res.json() as Promise<SalaryConfig[]>;
}
```

- [ ] **Step 6: Implement the Tauri adapter**

In `apps/web/src/data/queries.ts`, add to the returned port object:
```ts
    async getAllSalaryConfigs() {
      const rows = await exec.select<SalaryConfigRow>(
        'SELECT * FROM salary_config ORDER BY year ASC, month ASC',
      );
      return rows.map(rowToConfig);
    },
```

- [ ] **Step 7: Run parity + API**

Run: `npm test -w @budget/web -- queries` and `npm test -w @budget/api`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/data/port.ts apps/api/src/repo.ts apps/api/src/app.ts apps/web/src/data/http.ts apps/web/src/data/queries.ts apps/web/src/data/queries.test.ts
git commit -m "feat(data): getAllSalaryConfigs across HTTP + Tauri adapters (+ parity)"
```

---

## PHASE 3 — UI (sub-tabs, Summary reorg, Lifetime, Config)

> Styling: reuse existing Tailwind classes (`rounded-lg border border-hairline bg-panel p-5`, `labelClass`, `poundInputClass`, the `th`/`td` constants in `SalaryView.tsx`). The `Segmented` control lives in `apps/web/src/components/ui` — signature `Segmented<T extends string>({ value, onChange, options: {id,label}[], size? })`.

### Task 7: Extract shared salary state + sub-tab shell

**Files:**
- Create: `apps/web/src/features/salary/salaryState.ts`
- Modify: `apps/web/src/features/salary/Salary.tsx`
- Create: `apps/web/src/features/salary/SummaryTab.tsx`, `ConfigTab.tsx`, `LifetimeTab.tsx`

- [ ] **Step 1: Extract pure helpers**

Move these pure helpers out of `Salary.tsx` into `apps/web/src/features/salary/salaryState.ts` and export them (verbatim — no behavior change): `ymToYearMonth`, `poundsToDisplay`, `parsePounds`, `deriveFromYearly`, `toYearlyPounds`, `EMPTY_CONFIG_FIELDS`, `configToFields`, `fieldsToConfig`, `ConfigFields` type, `GROSS_FIELDS`, `GrossField`, `GROSS_LABELS`, `currentYm`. Import them back into `Salary.tsx`.

- [ ] **Step 2: Add the sub-tab state + shell in `Salary.tsx`**

Keep all existing data/form state in `Salary.tsx` (it stays the stateful parent). Add:
```ts
const [subtab, setSubtab] = useState<'summary' | 'lifetime' | 'config'>('summary');
```
Replace the single render body with: month-picker row (+ inherited indicator) shown always, the `Segmented` sub-tab control, and a switch that renders `<SummaryTab .../>`, `<LifetimeTab .../>`, or `<ConfigTab .../>`. Pass down the shared state + handlers each tab needs (gross, note, configFields, setConfigFields, breakdown, onSave, saving, error, saveSuccess, onClear, clearArmed, hasSavedConfig, inheritedFrom, employmentStart, ym). The **Save / Clear block renders inside Summary and Config only** (not Lifetime).

```tsx
<div className="flex flex-wrap items-center gap-4">
  <MonthPicker ym={ym} onChange={onYmChange} />
  {inheritedFrom && (
    <span className="text-xs text-ink-muted">
      Showing values inherited from {monthLabel(`${inheritedFrom.year}-${String(inheritedFrom.month).padStart(2, '0')}`)}
    </span>
  )}
</div>
<Segmented value={subtab} onChange={setSubtab} options={[
  { id: 'summary', label: 'Summary' },
  { id: 'lifetime', label: 'Lifetime' },
  { id: 'config', label: 'Config' },
]} />
```

- [ ] **Step 3: Create the three tab components as thin views**

`SummaryTab.tsx`, `ConfigTab.tsx`, `LifetimeTab.tsx` each accept the props they need (typed explicitly). For this task they may start by rendering the **existing** sections moved verbatim (Summary: Gross Pay + Rate + Breakdown + Stats/Pension + Save; Config: the Tax & Deduction Parameters; Lifetime: a placeholder `<Panel>`), so the app compiles and behaves as before but is now tab-organised. Tasks 8–10 refine each.

- [ ] **Step 4: Verify**

Run: `npm run -w @budget/web typecheck && npm run -w @budget/web lint`
Manual: `npm run dev`, open the Salary tab via `http://192.168.14.102:5001` — three sub-tabs switch, month picker on all three, edits persist across tab switches, Save on Summary/Config only.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/salary/
git commit -m "feat(salary-ui): sub-tab shell (Summary/Lifetime/Config) + shared state extraction"
```

---

### Task 8: Summary tab — bonus surfacing, Key figures box, accurate pension

**Files:**
- Modify: `apps/web/src/features/salary/SummaryTab.tsx`
- Modify: `apps/web/src/features/salary/SalaryView.tsx` (add `KeyFigures`)

- [ ] **Step 1: Surface Bonus + Note, remove Pay Details**

In `SummaryTab.tsx`, keep the 5-field Gross grid. Below it, render a row with **Bonus** as a single field the **same width as a gross field, aligned under "Yearly"**, and **Note spanning the remaining four columns**:
```tsx
<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
  <PoundInput label="Bonus (monthly)" value={configFields.bonus_pence}
    onChange={(v) => setConfigFields((p) => ({ ...p, bonus_pence: v }))} />
  <div className="sm:col-span-4">
    <label className={labelClass}>Note</label>
    <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)}
      placeholder="e.g. April pay rise + 2026/27 tax year" />
  </div>
</div>
```
Delete the entire **Pay Details** disclosure (`timeOpen` button + panel). The hours/weeks/days inputs move to Config (Task 9); `timeOpen` state is removed.

- [ ] **Step 2: Add the `KeyFigures` component**

In `SalaryView.tsx`, add (replaces the standalone Stats + Pension panels on Summary):
```tsx
export function KeyFigures({ stats, pensionFundPence, studentDebtPence, ymLabel }: {
  stats: SalaryView['stats'];
  pensionFundPence: number | null;
  studentDebtPence: number | null;
  ymLabel: string;
}) {
  const row = (label: React.ReactNode, value: string) => (
    <div className="flex justify-between border-b border-hairline py-1">
      <dt className="text-ink-muted">{label}</dt><dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
  return (
    <section className="rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">
        Key figures <span className="font-normal text-ink-faint text-sm">— as of {ymLabel}</span>
      </h2>
      <dl className="space-y-1 text-sm">
        <div className="text-xs uppercase tracking-wide text-ink-faint pt-1">Effective rates</div>
        {row(<>Income tax <span className="text-ink-faint">· of gross</span></>, pct(stats.incomeTaxRateGross))}
        {row(<>Income tax <span className="text-ink-faint">· of taxable</span></>, pct(stats.incomeTaxRateTaxable))}
        {row(<>Total deductions <span className="text-ink-faint">· of gross</span></>, pct(stats.totalRate))}
        {row(<>… incl. employer pension</>, pct(stats.totalRateInclPension))}
        <div className="text-xs uppercase tracking-wide text-ink-faint pt-2">Position (cumulative to date)</div>
        {row('Total pension fund', pensionFundPence == null ? '—' : formatGBP(pensionFundPence))}
        {row('Remaining student debt', studentDebtPence == null ? '—' : formatGBP(studentDebtPence))}
      </dl>
    </section>
  );
}
```

- [ ] **Step 3: Wire lifetime position figures into Summary**

`SummaryTab.tsx` needs `pensionFundPence` and `studentDebtPence` as of the selected month. Fetch all configs once in `Salary.tsx` (`getAllSalaryConfigs`, stored in state, refreshed on save) and compute `const lifetime = useMemo(() => computeLifetime(allConfigs, ymToYearMonth(ym)), [allConfigs, ym])`. Pass `lifetime.pensionPotPence` as `pensionFundPence`. Pass `studentDebtPence={null}` for now (Spec B wires it). Render `<KeyFigures stats={breakdown.view.stats} pensionFundPence={lifetime.pensionPotPence} studentDebtPence={null} ymLabel={monthLabel(ym)} />` in place of the old `<StatsPanel/> + <PensionPanel/>` pair on Summary.

> Pension accuracy is now end-to-end: `breakdown.view.pension.yearlyForecast` uses real employer-pension YTD (Task 4 + Task 5), and `lifetime.pensionPotPence` is the cumulative pot.

- [ ] **Step 4: Verify**

Run: `npm run -w @budget/web typecheck && npm run -w @budget/web lint && npm test -w @budget/web`
Manual: Summary shows Gross Pay (Bonus under Yearly, Note wide), Rate, Breakdown, Key figures (pension fund populated, student debt "—"); Save works.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/salary/
git commit -m "feat(salary-ui): Summary tab — bonus surfacing, Key figures box, lifetime pension fund"
```

---

### Task 9: Config tab — always editable + hours/weeks/days moved in

**Files:**
- Modify: `apps/web/src/features/salary/ConfigTab.tsx`
- Modify: `apps/web/src/features/salary/Salary.tsx` (drop the edit/draft indirection)

- [ ] **Step 1: Make parameters always-editable**

In `ConfigTab.tsx`, render the Tax & Deduction Parameters as **inputs by default** — drop the `configEditing`/`configDraft`/`startEdit`/`saveEdit`/`cancelEdit` machinery and the read-only summary grid. Bind every `PctInput`/`PoundInput` directly to `configFields` via `setConfigFields((p) => ({ ...p, key: v }))` (same pattern the gross fields already use). Keep the four sections (Pension, Income Tax, National Insurance, Student Loan) and the SL-enabled checkbox gate.

- [ ] **Step 2: Move hours/weeks/days into Config**

Add a **Time & hours** subsection in `ConfigTab.tsx` with the three inputs (`hours_per_week`, `work_weeks_per_year`, `work_days_per_week`) bound to `configFields`. Remove them from anywhere else.

- [ ] **Step 3: Keep the inherited indicator**

The "Showing values inherited from {month}" indicator already renders in the shell (Task 7) on all tabs — confirm it shows on Config so the user knows when they're forking an inherited month.

- [ ] **Step 4: Save on Config**

Render the Save / Clear block on Config too (same `onSave`/`onClear` from the shell).

- [ ] **Step 5: Verify**

Run: `npm run -w @budget/web typecheck && npm run -w @budget/web lint`
Manual: Config fields are editable immediately (no Edit button); changing a param updates Summary's Breakdown after switching tabs; Save persists; inherited indicator shows on an inherited month.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/salary/
git commit -m "feat(salary-ui): Config tab — always-editable params + hours/weeks/days moved in"
```

---

### Task 10: Lifetime tab — cumulative hierarchy

**Files:**
- Modify: `apps/web/src/features/salary/LifetimeTab.tsx`
- Modify: `apps/web/src/features/salary/SalaryView.tsx` (add `LifetimeTotalsTable`)

- [ ] **Step 1: Build the lifetime line tree + table**

In `SalaryView.tsx`, add a `LifetimeTotalsTable` that renders the single "to-date" column with the expandable hierarchy (reuse the existing expand/collapse `Row` pattern, or a simpler local expandable list — single value column). Hierarchy and signs (deductions negative/muted, net accented):
- ▾ Gross earned → Base pay · Bonus (muted when 0)
- ▾ Deductions (negative) → Employee pension · ▾ Income tax (→ Allowance used [muted, positive] · Basic rate · Higher rate · Additional rate*) · National insurance · Student loan paid
- Net take-home (accent, top border)
- ▾ Pension pot → Employer contributed · Employee contributed

\* Additional rate row only when `additionalPence > 0`.

Build the tree from `LifetimeTotals` in a small pure helper (e.g. `lifetimeLines(t: LifetimeTotals): {key,label,value,depth,tone}[]`), so it is unit-testable.

- [ ] **Step 2: Render in `LifetimeTab.tsx`**

```tsx
const lifetime = computeLifetime(allConfigs, ymToYearMonth(ym)); // passed down or computed here
return (
  <section className="rounded-lg border border-hairline bg-panel p-5">
    <h2 className="mb-4 font-serif text-base font-medium text-ink">
      Lifetime totals <span className="font-normal text-ink-faint text-sm">
        — through {monthLabel(ym)} ({lifetime.monthsCount} months)</span>
    </h2>
    <LifetimeTotalsTable totals={lifetime} />
  </section>
);
```
Lifetime is **read-only** — no Save/Clear here. The Student Loan tracker box is added by Spec B; leave a clearly-marked placeholder comment where it will go.

- [ ] **Step 3: Verify**

Run: `npm run -w @budget/web typecheck && npm run -w @budget/web lint && npm test -w @budget/web`
Manual (with demo DB seeded Nov 2025–Apr 2026): viewing April 2026 shows ~6 months cumulative; viewing an earlier month shows fewer (running series). Expand/collapse works; deductions muted; net accented; pension pot = employer + employee.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/salary/
git commit -m "feat(salary-ui): Lifetime tab — cumulative-to-date hierarchy"
```

---

## Final verification

- [ ] Run the whole suite: `npm test` (all workspaces) + `npm run -w @budget/web typecheck && npm run -w @budget/web lint`.
- [ ] Desktop parity sanity: `cd apps/desktop/src-tauri && cargo test` (the Rust `db.rs` tests must still pass — no Rust change in Spec A, but confirm the schema include still compiles).
- [ ] Manual smoke on `http://192.168.14.102:5001`: sub-tabs, shared edits, Save on Summary/Config, Lifetime running series, pension forecast figures look right.
- [ ] Use **superpowers:finishing-a-development-branch** to complete.

---

## Self-review notes (coverage vs spec)

- Spec §2 IA (sub-tabs, shared state, Save placement, Lifetime read-only) → Tasks 7–10.
- Spec §2.1 Summary (bonus same-width under Yearly + Note 4-col; Key figures) → Task 8.
- Spec §2.2 Lifetime (single to-date column, hierarchy) → Task 10.
- Spec §2.3 Config (always-editable, hours/weeks/days, inherited indicator) → Task 9.
- Spec §3 lifetime engine (per-TY cumulative, April reset) → Task 3. §3.1 walk + `isExplicit` → Task 2.
- Spec §4 pension accuracy → Tasks 1, 4, 5 (+ wired in Task 8).
- Spec §5 data layer (all-configs + widened YTD, both adapters, parity) → Tasks 5, 6.
- Spec §6 tests (reconciliation + PAYE-reset; parity) → Tasks 3, 5, 6.
- Spec §8 preserve (`taxOnCumulative` untouched; TS2835) → stated at top; honoured throughout.
