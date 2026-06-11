# Salary Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level Salary tab that computes a full UK salary breakdown and writes net monthly pay into the existing `MonthlyIncome` layer.

**Architecture:** A new `salary_config` table stores all salary parameters per calendar month. A pure calculation engine in `@budget/core` derives the full breakdown. The API exposes GET/PUT endpoints with backwards/forwards inheritance. The web Salary tab replaces the old Manage → Income section.

**Tech Stack:** Node `node:sqlite` (DatabaseSync), Hono, Vitest, React 19, Tailwind CSS 4, `@budget/core` workspace package.

---

## File Map

**Create:**
- `packages/core/src/salary.ts` — pure salary calculation engine
- `packages/core/src/salary.test.ts` — TDD tests
- `apps/web/src/features/salary/Salary.tsx` — Salary tab UI component

**Modify:**
- `packages/core/src/types.ts` — add `SalaryConfig`, `SalaryRow`, `SalaryBreakdown`, `SalaryConfigResponse`
- `packages/core/src/index.ts` — export `calcSalary`
- `apps/api/src/db/schema.sql` — add `salary_config` table + index
- `apps/api/src/repo.ts` — add `getSalaryConfig`, `upsertSalaryConfig`
- `apps/api/src/app.ts` — add GET/PUT `/salary-config/:year/:month` routes
- `apps/api/src/app.test.ts` — add salary config tests
- `apps/api/package.json` — already has `@budget/core: "*"` added (for `import type` in repo.ts)
- `apps/web/src/api.ts` — add `getSalaryConfig`, `saveSalaryConfig`
- `apps/web/src/App.tsx` — add Salary tab to nav
- `apps/web/src/features/manage/Manage.tsx` — remove Income tab

**Delete:**
- `apps/web/src/features/manage/ManageIncome.tsx`

---

## Task 1: Add shared types to @budget/core

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Add SalaryConfig and related types to types.ts**

Append to the end of `packages/core/src/types.ts`:

```typescript
export type SalaryConfig = {
  year: number;
  month: number;
  gross_yearly_pence: number;
  note: string | null;
  hours_per_week: number;
  work_weeks_per_year: number;
  work_days_per_week: number;
  employee_pension_pct: number;
  employer_pension_pct: number;
  personal_allowance_pence: number;
  basic_rate_band_pence: number;
  additional_rate_threshold_pence: number;
  basic_rate_pct: number;
  higher_rate_pct: number;
  additional_rate_pct: number;
  ni_lower_monthly_pence: number;
  ni_upper_monthly_pence: number;
  ni_primary_pct: number;
  ni_upper_pct: number;
  sl_enabled: boolean;
  sl_threshold_yearly_pence: number;
  sl_rate_pct: number;
  sl_balance_pence: number | null;
  sl_interest_rate_pct: number | null;
};

export type SalaryFigures = {
  yearly: number;
  monthly: number;
  weekly: number;
  daily: number;
  hourly: number;
};

export type SalaryRow = {
  key: string;
  label: string;
  isDeduction: boolean;
  isSummary: boolean;
  isPercentage: boolean;
  figures: SalaryFigures;
};

export type SalaryBreakdown = {
  rows: SalaryRow[];
  netMonthlyPence: number;
};

export type SalaryConfigResponse = {
  config: SalaryConfig | null;
  inheritedFrom: { year: number; month: number } | null;
};
```

- [ ] **Step 2: Run typechecks to confirm types are valid**

```bash
cd /path/to/budget-tool && npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add SalaryConfig and SalaryBreakdown types"
```

---

## Task 2: Salary calculation engine (TDD)

**Files:**
- Create: `packages/core/src/salary.test.ts`
- Create: `packages/core/src/salary.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/salary.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { calcSalary } from './salary';
import type { SalaryConfig } from './types';

// Baseline config matching the original Excel (Jack's salary, 2025/26 UK tax year)
const BASE: SalaryConfig = {
  year: 2026,
  month: 1,
  gross_yearly_pence: 5_946_600, // £59,466
  note: null,
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
};

describe('calcSalary — baseline (matches Excel)', () => {
  const result = calcSalary(BASE);
  const get = (key: string) => result.rows.find((r) => r.key === key)!;

  it('employer pension = gross × employer%', () => {
    expect(get('employerPension').figures.yearly).toBe(1_722_730);
    // 5_946_600 × 28.97% = 1_722_729.72 → Math.round = 1_722_730
  });

  it('total compensation = gross + employer pension', () => {
    expect(get('totalComp').figures.yearly).toBe(7_669_330);
  });

  it('employee pension deduction is negative', () => {
    expect(get('employeePension').figures.yearly).toBe(-324_090);
    // 5_946_600 × 5.45% = 324_089.7 → Math.round = 324_090
  });

  it('adjusted net income = gross − employee pension', () => {
    expect(get('adjustedNet').figures.yearly).toBe(5_622_510);
  });

  it('income tax = £9,921.84 (matches Excel row 10)', () => {
    // basic: 3_770_100 × 20% = 754_020
    // higher: (4_365_510 − 3_770_100) × 40% = 595_410 × 40% = 238_164
    // total: 754_020 + 238_164 = 992_184
    expect(get('incomeTax').figures.yearly).toBe(-992_184);
  });

  it('NI = £3,199.92/year (matches Excel row 12)', () => {
    // monthly gross = 5_946_600 / 12 = 495_550
    // primary: (min(495_550, 418_917) − 104_750) × 8% = 314_167 × 8% = 25_133.36
    // upper:   (495_550 − 418_917) × 2%             = 76_633 × 2%  =  1_532.66
    // monthly total: 26_666.02 → × 12 = 319_992.24 → Math.round = 319_992
    expect(get('ni').figures.yearly).toBe(-319_992);
  });

  it('SLC = £2,784/year (matches Excel row 13)', () => {
    // monthly raw pence: (5_946_600 − 2_847_000) × 9% / 12 = 23_247
    // ROUNDDOWN to whole £: Math.floor(23_247 / 100) × 100 = 23_200
    // annual: 23_200 × 12 = 278_400
    expect(get('sl').figures.yearly).toBe(-278_400);
  });

  it('net pay ≈ £40,319.34/year (matches Excel row 16)', () => {
    // 5_622_510 − 992_184 − 319_992 − 278_400 = 4_031_934
    expect(get('netPay').figures.yearly).toBe(4_031_934);
  });

  it('net monthly pence is yearly net ÷ 12 rounded', () => {
    expect(result.netMonthlyPence).toBe(Math.round(4_031_934 / 12));
  });

  it('effective tax rate row: same value in all columns', () => {
    const r = get('effectiveTaxRate');
    expect(r.isPercentage).toBe(true);
    expect(r.figures.yearly).toBeCloseTo(r.figures.monthly, 10);
    expect(r.figures.yearly).toBeCloseTo(r.figures.weekly, 10);
  });

  it('SLC row is absent when sl_enabled is false', () => {
    const r = calcSalary({ ...BASE, sl_enabled: false });
    expect(r.rows.find((row) => row.key === 'sl')).toBeUndefined();
  });

  it('no tax when income is below personal allowance', () => {
    const r = calcSalary({ ...BASE, gross_yearly_pence: 1_000_000 }); // £10,000
    expect(r.rows.find((row) => row.key === 'incomeTax')!.figures.yearly).toBe(0);
  });

  it('additional rate band kicks in above threshold', () => {
    // Gross £200,000 → taxable = 200_000_00 - 1_257_000 = 18_743_000 (above add threshold 11_257_000)
    const r = calcSalary({
      ...BASE,
      gross_yearly_pence: 20_000_000,
      employee_pension_pct: 0,
      employer_pension_pct: 0,
      sl_enabled: false,
    });
    const tax = r.rows.find((row) => row.key === 'incomeTax')!.figures.yearly;
    // taxable = 20_000_000 - 1_257_000 = 18_743_000
    // basic: 3_770_100 × 20% = 754_020
    // higher: (11_257_000 − 3_770_100) × 40% = 7_486_900 × 40% = 2_994_760
    // additional: (18_743_000 − 11_257_000) × 45% = 7_486_000 × 45% = 3_368_700
    expect(tax).toBe(-(754_020 + 2_994_760 + 3_368_700));
  });

  it('weekly figure = yearly ÷ work_weeks_per_year', () => {
    const r = get('gross');
    expect(r.figures.weekly).toBe(Math.round(5_946_600 / 52));
  });

  it('daily figure = weekly ÷ work_days_per_week', () => {
    const r = get('gross');
    expect(r.figures.daily).toBe(Math.round(Math.round(5_946_600 / 52) / 5));
  });
});
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
npm test 2>&1 | grep -E "FAIL|salary|✓|×" | head -30
```

Expected: all salary tests fail with "Cannot find module './salary'".

- [ ] **Step 3: Implement calcSalary**

Create `packages/core/src/salary.ts`:

```typescript
import type { SalaryConfig, SalaryBreakdown, SalaryFigures, SalaryRow } from './types';

function figures(yearly: number, cfg: SalaryConfig): SalaryFigures {
  const weekly = Math.round(yearly / cfg.work_weeks_per_year);
  return {
    yearly,
    monthly: Math.round(yearly / 12),
    weekly,
    daily: Math.round(weekly / cfg.work_days_per_week),
    hourly: Math.round(weekly / cfg.hours_per_week),
  };
}

function flatFigures(value: number): SalaryFigures {
  return { yearly: value, monthly: value, weekly: value, daily: value, hourly: value };
}

function row(key: string, label: string, yearly: number, cfg: SalaryConfig, opts: { deduction?: boolean; summary?: boolean } = {}): SalaryRow {
  return {
    key,
    label,
    isDeduction: opts.deduction ?? false,
    isSummary: opts.summary ?? false,
    isPercentage: false,
    figures: figures(yearly, cfg),
  };
}

function pctRow(key: string, label: string, value: number): SalaryRow {
  return {
    key,
    label,
    isDeduction: false,
    isSummary: false,
    isPercentage: true,
    figures: flatFigures(value),
  };
}

export function calcSalary(cfg: SalaryConfig): SalaryBreakdown {
  const grossY = cfg.gross_yearly_pence;

  // Employer pension
  const employerPensionY = Math.round(grossY * cfg.employer_pension_pct / 100);
  const totalCompY = grossY + employerPensionY;

  // Employee pension (deduction — negative)
  const employeePensionY = -Math.round(grossY * cfg.employee_pension_pct / 100);
  const adjustedNetY = grossY + employeePensionY;

  // Taxable income (floored at 0)
  const taxableY = Math.max(0, adjustedNetY - cfg.personal_allowance_pence);

  // Additional rate threshold as a taxable income boundary
  const addRateTaxableY = Math.max(0, cfg.additional_rate_threshold_pence - cfg.personal_allowance_pence);

  // Income tax across three bands
  const basicTax = Math.min(taxableY, cfg.basic_rate_band_pence) * cfg.basic_rate_pct / 100;
  const higherTax = Math.max(0, Math.min(taxableY, addRateTaxableY) - cfg.basic_rate_band_pence) * cfg.higher_rate_pct / 100;
  const additionalTax = Math.max(0, taxableY - addRateTaxableY) * cfg.additional_rate_pct / 100;
  const incomeTaxY = -Math.round(basicTax + higherTax + additionalTax);

  // NI — calculated monthly then annualised
  const monthlyGross = grossY / 12;
  const niPrimary = Math.max(0, Math.min(monthlyGross, cfg.ni_upper_monthly_pence) - cfg.ni_lower_monthly_pence) * cfg.ni_primary_pct / 100;
  const niUpper = Math.max(0, monthlyGross - cfg.ni_upper_monthly_pence) * cfg.ni_upper_pct / 100;
  const niY = -Math.round((niPrimary + niUpper) * 12);

  // Student Loan — ROUNDDOWN to nearest whole £ per month, then annualise
  let slY = 0;
  if (cfg.sl_enabled && grossY > cfg.sl_threshold_yearly_pence) {
    const slMonthlyRaw = (grossY - cfg.sl_threshold_yearly_pence) * cfg.sl_rate_pct / 100 / 12;
    const slMonthly = -(Math.floor(slMonthlyRaw / 100) * 100); // ROUNDDOWN to whole £
    slY = slMonthly * 12;
  }

  const totalDeductionsY = employeePensionY + incomeTaxY + niY + slY;
  const netPayY = adjustedNetY + incomeTaxY + niY + slY;
  const inclCompY = totalCompY + totalDeductionsY;

  const effectiveTaxRate = grossY > 0 ? -totalDeductionsY / grossY : 0;
  const netPayPct = grossY > 0 ? netPayY / grossY : 0;

  const rows: SalaryRow[] = [
    row('gross', 'Gross Income', grossY, cfg),
    row('employerPension', 'Employer Pension', employerPensionY, cfg),
    row('totalComp', 'Total Compensation', totalCompY, cfg, { summary: true }),
    row('employeePension', 'Employee Pension', employeePensionY, cfg, { deduction: true }),
    row('adjustedNet', 'Adjusted Net Income', adjustedNetY, cfg),
    row('taxableIncome', 'Taxable Income', taxableY, cfg),
    row('incomeTax', 'Income Tax', incomeTaxY, cfg, { deduction: true }),
    row('ni', 'National Insurance', niY, cfg, { deduction: true }),
    ...(cfg.sl_enabled ? [row('sl', 'Student Loan (Plan 2)', slY, cfg, { deduction: true })] : []),
    row('totalDeductions', 'Total Deductions', totalDeductionsY, cfg, { deduction: true, summary: true }),
    row('netPay', 'Net Pay', netPayY, cfg, { summary: true }),
    pctRow('effectiveTaxRate', 'Effective Tax Rate', effectiveTaxRate),
    pctRow('netPayPct', 'Net Pay % of Gross', netPayPct),
    row('inclComp', 'incl. Compensation', inclCompY, cfg, { summary: true }),
  ];

  return { rows, netMonthlyPence: Math.round(netPayY / 12) };
}
```

- [ ] **Step 4: Export from index.ts**

Add to `packages/core/src/index.ts`:

```typescript
export * from './salary';
```

- [ ] **Step 5: Run tests — confirm all pass**

```bash
npm test 2>&1 | grep -E "salary|PASS|FAIL|✓|×" | head -30
```

Expected: all salary tests pass.

- [ ] **Step 6: Run typechecks**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/salary.ts packages/core/src/salary.test.ts packages/core/src/index.ts
git commit -m "feat(core): add salary calculation engine with tests"
```

---

## Task 3: DB schema — salary_config table

**Files:**
- Modify: `apps/api/src/db/schema.sql`

- [ ] **Step 1: Add salary_config table to schema.sql**

Append to the end of `apps/api/src/db/schema.sql` (before the closing comments):

```sql
-- Salary configuration per calendar month (SALARY.md §2).
-- Stores all parameters needed for the UK salary breakdown.
-- Missing months inherit from the nearest saved config (backward then forward).
CREATE TABLE IF NOT EXISTS salary_config (
  year                             INTEGER NOT NULL,
  month                            INTEGER NOT NULL,
  gross_yearly_pence               INTEGER NOT NULL,
  note                             TEXT,
  hours_per_week                   REAL    NOT NULL,
  work_weeks_per_year              REAL    NOT NULL,
  work_days_per_week               REAL    NOT NULL,
  employee_pension_pct             REAL    NOT NULL,
  employer_pension_pct             REAL    NOT NULL,
  personal_allowance_pence         INTEGER NOT NULL,
  basic_rate_band_pence            INTEGER NOT NULL,
  additional_rate_threshold_pence  INTEGER NOT NULL,
  basic_rate_pct                   REAL    NOT NULL,
  higher_rate_pct                  REAL    NOT NULL,
  additional_rate_pct              REAL    NOT NULL,
  ni_lower_monthly_pence           INTEGER NOT NULL,
  ni_upper_monthly_pence           INTEGER NOT NULL,
  ni_primary_pct                   REAL    NOT NULL,
  ni_upper_pct                     REAL    NOT NULL,
  sl_enabled                       INTEGER NOT NULL DEFAULT 0,
  sl_threshold_yearly_pence        INTEGER NOT NULL DEFAULT 2847000,
  sl_rate_pct                      REAL    NOT NULL DEFAULT 9,
  sl_balance_pence                 INTEGER,
  sl_interest_rate_pct             REAL,
  PRIMARY KEY (year, month)
);

CREATE INDEX IF NOT EXISTS idx_salary_config_ym ON salary_config(year, month);
```

- [ ] **Step 2: Verify the migration runs cleanly on an in-memory DB**

```bash
cd apps/api && node --input-type=module <<'EOF'
import { openDatabase } from './src/db.ts';
import { migrate } from './src/migrate.ts';
const db = openDatabase(':memory:');
migrate(db);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables.map(t => t.name).join(', '));
EOF
```

Expected output includes `salary_config`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/schema.sql
git commit -m "feat(api): add salary_config table to schema"
```

---

## Task 4: Repo functions for salary_config

**Files:**
- Modify: `apps/api/src/repo.ts`

- [ ] **Step 1: Add the @budget/core import to the TOP of `apps/api/src/repo.ts`**

The existing first line is `import type { DatabaseSync } from 'node:sqlite';`. Add the new import on the very next line:

```typescript
import type { DatabaseSync } from 'node:sqlite';
import type { SalaryConfig, SalaryConfigResponse } from '@budget/core';
```

(ESM imports must be at the top of the file. `import type` is erased at runtime by Node 24's type-stripper, so it does not cause a module-load failure even though the core package exports TypeScript source.)

- [ ] **Step 2: Append getSalaryConfig and upsertSalaryConfig to repo.ts**

Append to the END of `apps/api/src/repo.ts` (no import line needed — that was added in step 1):

```typescript
// ── Salary config ─────────────────────────────────────────────────────────────

type SalaryConfigRow = {
  year: number; month: number;
  gross_yearly_pence: number; note: string | null;
  hours_per_week: number; work_weeks_per_year: number; work_days_per_week: number;
  employee_pension_pct: number; employer_pension_pct: number;
  personal_allowance_pence: number; basic_rate_band_pence: number;
  additional_rate_threshold_pence: number;
  basic_rate_pct: number; higher_rate_pct: number; additional_rate_pct: number;
  ni_lower_monthly_pence: number; ni_upper_monthly_pence: number;
  ni_primary_pct: number; ni_upper_pct: number;
  sl_enabled: number; sl_threshold_yearly_pence: number; sl_rate_pct: number;
  sl_balance_pence: number | null; sl_interest_rate_pct: number | null;
};

function rowToConfig(row: SalaryConfigRow): SalaryConfig {
  return { ...row, sl_enabled: row.sl_enabled === 1 };
}

export function getSalaryConfig(db: DatabaseSync, year: number, month: number): SalaryConfigResponse {
  const backward = db.prepare(
    `SELECT * FROM salary_config
     WHERE (year < ?) OR (year = ? AND month <= ?)
     ORDER BY year DESC, month DESC LIMIT 1`,
  ).get(year, year, month) as SalaryConfigRow | undefined;

  if (backward) {
    const isExact = backward.year === year && backward.month === month;
    return {
      config: rowToConfig(backward),
      inheritedFrom: isExact ? null : { year: backward.year, month: backward.month },
    };
  }

  const forward = db.prepare(
    `SELECT * FROM salary_config
     WHERE (year > ?) OR (year = ? AND month >= ?)
     ORDER BY year ASC, month ASC LIMIT 1`,
  ).get(year, year, month) as SalaryConfigRow | undefined;

  if (forward) {
    return {
      config: rowToConfig(forward),
      inheritedFrom: { year: forward.year, month: forward.month },
    };
  }

  return { config: null, inheritedFrom: null };
}

export function upsertSalaryConfig(db: DatabaseSync, cfg: SalaryConfig): SalaryConfig {
  db.prepare(
    `INSERT INTO salary_config (
       year, month, gross_yearly_pence, note,
       hours_per_week, work_weeks_per_year, work_days_per_week,
       employee_pension_pct, employer_pension_pct,
       personal_allowance_pence, basic_rate_band_pence, additional_rate_threshold_pence,
       basic_rate_pct, higher_rate_pct, additional_rate_pct,
       ni_lower_monthly_pence, ni_upper_monthly_pence, ni_primary_pct, ni_upper_pct,
       sl_enabled, sl_threshold_yearly_pence, sl_rate_pct,
       sl_balance_pence, sl_interest_rate_pct
     ) VALUES (
       ?,?,?,?,  ?,?,?,  ?,?,  ?,?,?,  ?,?,?,  ?,?,?,?,  ?,?,?,  ?,?
     )
     ON CONFLICT(year, month) DO UPDATE SET
       gross_yearly_pence=excluded.gross_yearly_pence, note=excluded.note,
       hours_per_week=excluded.hours_per_week,
       work_weeks_per_year=excluded.work_weeks_per_year,
       work_days_per_week=excluded.work_days_per_week,
       employee_pension_pct=excluded.employee_pension_pct,
       employer_pension_pct=excluded.employer_pension_pct,
       personal_allowance_pence=excluded.personal_allowance_pence,
       basic_rate_band_pence=excluded.basic_rate_band_pence,
       additional_rate_threshold_pence=excluded.additional_rate_threshold_pence,
       basic_rate_pct=excluded.basic_rate_pct, higher_rate_pct=excluded.higher_rate_pct,
       additional_rate_pct=excluded.additional_rate_pct,
       ni_lower_monthly_pence=excluded.ni_lower_monthly_pence,
       ni_upper_monthly_pence=excluded.ni_upper_monthly_pence,
       ni_primary_pct=excluded.ni_primary_pct, ni_upper_pct=excluded.ni_upper_pct,
       sl_enabled=excluded.sl_enabled,
       sl_threshold_yearly_pence=excluded.sl_threshold_yearly_pence,
       sl_rate_pct=excluded.sl_rate_pct,
       sl_balance_pence=excluded.sl_balance_pence,
       sl_interest_rate_pct=excluded.sl_interest_rate_pct`,
  ).run(
    cfg.year, cfg.month, cfg.gross_yearly_pence, cfg.note,
    cfg.hours_per_week, cfg.work_weeks_per_year, cfg.work_days_per_week,
    cfg.employee_pension_pct, cfg.employer_pension_pct,
    cfg.personal_allowance_pence, cfg.basic_rate_band_pence, cfg.additional_rate_threshold_pence,
    cfg.basic_rate_pct, cfg.higher_rate_pct, cfg.additional_rate_pct,
    cfg.ni_lower_monthly_pence, cfg.ni_upper_monthly_pence, cfg.ni_primary_pct, cfg.ni_upper_pct,
    cfg.sl_enabled ? 1 : 0, cfg.sl_threshold_yearly_pence, cfg.sl_rate_pct,
    cfg.sl_balance_pence ?? null, cfg.sl_interest_rate_pct ?? null,
  );
  const row = db.prepare('SELECT * FROM salary_config WHERE year = ? AND month = ?').get(cfg.year, cfg.month) as SalaryConfigRow;
  return rowToConfig(row);
}
```

- [ ] **Step 2: Run typechecks**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/repo.ts
git commit -m "feat(api): add getSalaryConfig and upsertSalaryConfig repo functions"
```

---

## Task 5: Add @budget/core dependency to API, then add routes + tests

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`

- [ ] **Step 1: Verify @budget/core is in API package.json**

`apps/api/package.json` dependencies should contain `"@budget/core": "*"`. This allows `import type` from `@budget/core` in `repo.ts` (type-only imports are erased at runtime by Node 24's type-stripper, so they work fine despite the core package exporting TypeScript source with extensionless imports). Run `npm install` if the dep was just added.

- [ ] **Step 2: Add salary-config routes to app.ts**

**Important:** Do NOT import `calcSalary` from `@budget/core` in the API. Node 24's type-stripping resolves value imports at runtime and the core package uses extensionless imports that fail under Node's ESM resolver. The web client already runs `calcSalary` to render the breakdown and sends `net_monthly_pence` in the PUT body. The API stores it directly.

Add to the existing imports from `./repo.ts`:

```typescript
import {
  // ...existing imports...
  getSalaryConfig,
  upsertSalaryConfig,
} from './repo.ts';
```

Add two new validators just above `export function createApp`:

```typescript
const isRealPct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
const isPositive = (n: number) => Number.isFinite(n) && n > 0;
```

Add these routes inside `createApp`, before `app.route('/api', api)`:

```typescript
  // ── Salary config ───────────────────────────────────────────────────────────
  api.get('/salary-config/:year/:month', (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return c.json({ error: 'invalid month' }, 400);
    }
    return c.json(getSalaryConfig(db, year, month));
  });

  api.put('/salary-config/:year/:month', async (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return c.json({ error: 'invalid month' }, 400);
    }
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);

    const gross = Number(body.gross_yearly_pence);
    const netMonthlyPence = Number(body.net_monthly_pence);
    const hoursPerWeek = Number(body.hours_per_week);
    const workWeeks = Number(body.work_weeks_per_year);
    const workDays = Number(body.work_days_per_week);
    const empPct = Number(body.employee_pension_pct);
    const erPct = Number(body.employer_pension_pct);
    const personalAllowance = Number(body.personal_allowance_pence);
    const basicBand = Number(body.basic_rate_band_pence);
    const addThreshold = Number(body.additional_rate_threshold_pence);
    const basicRate = Number(body.basic_rate_pct);
    const higherRate = Number(body.higher_rate_pct);
    const additionalRate = Number(body.additional_rate_pct);
    const niLower = Number(body.ni_lower_monthly_pence);
    const niUpper = Number(body.ni_upper_monthly_pence);
    const niPrimary = Number(body.ni_primary_pct);
    const niUpperRate = Number(body.ni_upper_pct);
    const slThreshold = Number(body.sl_threshold_yearly_pence);
    const slRate = Number(body.sl_rate_pct);

    if (
      !isPence(gross) || gross === 0 ||
      !isPence(netMonthlyPence) || netMonthlyPence === 0 ||
      !isPositive(hoursPerWeek) || !isPositive(workWeeks) || !isPositive(workDays) ||
      !isRealPct(empPct) || !isRealPct(erPct) ||
      !isPence(personalAllowance) || !isPence(basicBand) || !isPence(addThreshold) ||
      !isRealPct(basicRate) || !isRealPct(higherRate) || !isRealPct(additionalRate) ||
      !isPence(niLower) || !isPence(niUpper) ||
      !isRealPct(niPrimary) || !isRealPct(niUpperRate) ||
      !isPence(slThreshold) || !isRealPct(slRate)
    ) {
      return c.json({ error: 'invalid salary config' }, 400);
    }

    const slBalance = body.sl_balance_pence == null ? null : Number(body.sl_balance_pence);
    const slInterest = body.sl_interest_rate_pct == null ? null : Number(body.sl_interest_rate_pct);
    if (slBalance !== null && !isPence(slBalance)) return c.json({ error: 'invalid sl_balance_pence' }, 400);
    if (slInterest !== null && !isRealPct(slInterest)) return c.json({ error: 'invalid sl_interest_rate_pct' }, 400);

    const cfg = {
      year, month,
      gross_yearly_pence: gross,
      note: body.note == null ? null : String(body.note),
      hours_per_week: hoursPerWeek, work_weeks_per_year: workWeeks, work_days_per_week: workDays,
      employee_pension_pct: empPct, employer_pension_pct: erPct,
      personal_allowance_pence: personalAllowance, basic_rate_band_pence: basicBand,
      additional_rate_threshold_pence: addThreshold,
      basic_rate_pct: basicRate, higher_rate_pct: higherRate, additional_rate_pct: additionalRate,
      ni_lower_monthly_pence: niLower, ni_upper_monthly_pence: niUpper,
      ni_primary_pct: niPrimary, ni_upper_pct: niUpperRate,
      sl_enabled: Boolean(body.sl_enabled),
      sl_threshold_yearly_pence: slThreshold, sl_rate_pct: slRate,
      sl_balance_pence: slBalance, sl_interest_rate_pct: slInterest,
    };

    const saved = upsertSalaryConfig(db, cfg);

    // net_monthly_pence is computed by the web client (calcSalary) and passed in the body.
    // The API is a thin store — it does not import @budget/core for value computation.
    setIncome(db, year, month, netMonthlyPence);

    // Update default income only if this month >= current calendar month
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    if (year > curYear || (year === curYear && month >= curMonth)) {
      setDefaultIncome(db, netMonthlyPence);
    }

    return c.json({ config: saved, inheritedFrom: null });
  });
```

- [ ] **Step 3: Write API tests for salary config**

Append to `apps/api/src/app.test.ts`:

```typescript
const SALARY_BODY = {
  gross_yearly_pence: 5_946_600,
  net_monthly_pence: 335_995, // Math.round(4_031_934 / 12) — pre-computed by web client
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
    const put = await app.request('/api/salary-config/2026/6', json(SALARY_BODY));
    expect(put.status).toBe(200);

    const get = await app.request('/api/salary-config/2026/6');
    const data = await body<{ config: { year: number; month: number; gross_yearly_pence: number }; inheritedFrom: null }>(get);
    expect(data.config.year).toBe(2026);
    expect(data.config.month).toBe(6);
    expect(data.config.gross_yearly_pence).toBe(5_946_600);
    expect(data.inheritedFrom).toBeNull();
  });

  it('GET for later month inherits from saved earlier month', async () => {
    const app = freshApp();
    await app.request('/api/salary-config/2026/6', json(SALARY_BODY));

    const get = await app.request('/api/salary-config/2026/8');
    const data = await body<{ config: { gross_yearly_pence: number }; inheritedFrom: { year: number; month: number } }>(get);
    expect(data.config.gross_yearly_pence).toBe(5_946_600);
    expect(data.inheritedFrom).toEqual({ year: 2026, month: 6 });
  });

  it('GET for earlier month falls forward to saved later month', async () => {
    const app = freshApp();
    await app.request('/api/salary-config/2026/6', json(SALARY_BODY));

    const get = await app.request('/api/salary-config/2026/3');
    const data = await body<{ config: { gross_yearly_pence: number }; inheritedFrom: { year: number; month: number } }>(get);
    expect(data.config.gross_yearly_pence).toBe(5_946_600);
    expect(data.inheritedFrom).toEqual({ year: 2026, month: 6 });
  });

  it('PUT writes net monthly pay to bootstrap income', async () => {
    const app = freshApp();
    await app.request('/api/salary-config/2026/6', json(SALARY_BODY));

    const boot = await body<{ income: Array<{ year: number; month: number; amount_pence: number }> }>(
      await app.request('/api/bootstrap'),
    );
    const incomeRow = boot.income.find((r) => r.year === 2026 && r.month === 6);
    expect(incomeRow).toBeDefined();
    expect(incomeRow!.amount_pence).toBeGreaterThan(0);
  });

  it('PUT rejects invalid gross', async () => {
    const app = freshApp();
    const res = await app.request('/api/salary-config/2026/6', json({ ...SALARY_BODY, gross_yearly_pence: -1 }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run all tests — confirm pass**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Run typechecks**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/src/app.ts apps/api/src/app.test.ts
git commit -m "feat(api): add salary-config GET/PUT routes with MonthlyIncome write-through"
```

---

## Task 6: Web API client functions

**Files:**
- Modify: `apps/web/src/api.ts`

- [ ] **Step 1: Add getSalaryConfig and saveSalaryConfig to api.ts**

Import `SalaryConfigResponse` at the top of `apps/web/src/api.ts` (add to the existing import line):

```typescript
import type { BudgetList, Category, Entry, Group, LedgerData, MonthlyIncome, SalaryConfig, SalaryConfigResponse } from '@budget/core';
```

Append to the end of `apps/web/src/api.ts`:

```typescript
// ── Salary config ─────────────────────────────────────────────────────────────
export async function getSalaryConfig(year: number, month: number): Promise<SalaryConfigResponse> {
  const res = await fetch(`${API}salary-config/${year}/${month}`);
  if (!res.ok) throw new Error(`getSalaryConfig failed: ${res.status}`);
  return res.json() as Promise<SalaryConfigResponse>;
}

export async function saveSalaryConfig(cfg: SalaryConfig, netMonthlyPence: number): Promise<SalaryConfigResponse> {
  return send<SalaryConfigResponse>(`salary-config/${cfg.year}/${cfg.month}`, 'PUT', { ...cfg, net_monthly_pence: netMonthlyPence });
}
```

- [ ] **Step 2: Run typechecks**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api.ts
git commit -m "feat(web): add getSalaryConfig and saveSalaryConfig API client functions"
```

---

## Task 7: Salary tab UI component

**Files:**
- Create: `apps/web/src/features/salary/Salary.tsx`

- [ ] **Step 1: Create the Salary tab component**

Create `apps/web/src/features/salary/Salary.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { calcSalary, formatGBP, type SalaryConfig } from '@budget/core';
import { getSalaryConfig, saveSalaryConfig } from '../../api';
import { MonthPicker, Panel } from '../../components/ui';
import { useData } from '../../data';
import { monthLabel, todayISO } from '../../lib/dates';

// ── helpers ──────────────────────────────────────────────────────────────────

const currentYm = () => todayISO().slice(0, 7);

function ymToYearMonth(ym: string): { year: number; month: number } {
  return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) };
}

function poundsToDisplay(pence: number): string {
  return (pence / 100).toFixed(2);
}

function parsePounds(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function deriveFromYearly(
  yearlyPounds: number,
  workWeeks: number,
  workDays: number,
  hoursPerWeek: number,
): Record<'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly', string> {
  const weekly = yearlyPounds / workWeeks;
  return {
    yearly: yearlyPounds.toFixed(2),
    monthly: (yearlyPounds / 12).toFixed(2),
    weekly: weekly.toFixed(2),
    daily: (weekly / workDays).toFixed(2),
    hourly: (weekly / hoursPerWeek).toFixed(2),
  };
}

function toYearlyPounds(
  field: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly',
  pounds: number,
  workWeeks: number,
  workDays: number,
  hoursPerWeek: number,
): number {
  switch (field) {
    case 'yearly': return pounds;
    case 'monthly': return pounds * 12;
    case 'weekly': return pounds * workWeeks;
    case 'daily': return pounds * workWeeks * workDays;
    case 'hourly': return pounds * workWeeks * hoursPerWeek;
  }
}

// ── default config values (for empty fields) ─────────────────────────────────

const EMPTY_CONFIG_FIELDS = {
  hours_per_week: '37',
  work_weeks_per_year: '52',
  work_days_per_week: '5',
  employee_pension_pct: '',
  employer_pension_pct: '',
  personal_allowance_pence: '',
  basic_rate_band_pence: '',
  additional_rate_threshold_pence: '',
  basic_rate_pct: '',
  higher_rate_pct: '',
  additional_rate_pct: '',
  ni_lower_monthly_pence: '',
  ni_upper_monthly_pence: '',
  ni_primary_pct: '',
  ni_upper_pct: '',
  sl_enabled: false,
  sl_threshold_yearly_pence: '',
  sl_rate_pct: '',
  sl_balance_pence: '',
  sl_interest_rate_pct: '',
};

function configToFields(cfg: SalaryConfig) {
  return {
    hours_per_week: String(cfg.hours_per_week),
    work_weeks_per_year: String(cfg.work_weeks_per_year),
    work_days_per_week: String(cfg.work_days_per_week),
    employee_pension_pct: String(cfg.employee_pension_pct),
    employer_pension_pct: String(cfg.employer_pension_pct),
    personal_allowance_pence: poundsToDisplay(cfg.personal_allowance_pence),
    basic_rate_band_pence: poundsToDisplay(cfg.basic_rate_band_pence),
    additional_rate_threshold_pence: poundsToDisplay(cfg.additional_rate_threshold_pence),
    basic_rate_pct: String(cfg.basic_rate_pct),
    higher_rate_pct: String(cfg.higher_rate_pct),
    additional_rate_pct: String(cfg.additional_rate_pct),
    ni_lower_monthly_pence: poundsToDisplay(cfg.ni_lower_monthly_pence),
    ni_upper_monthly_pence: poundsToDisplay(cfg.ni_upper_monthly_pence),
    ni_primary_pct: String(cfg.ni_primary_pct),
    ni_upper_pct: String(cfg.ni_upper_pct),
    sl_enabled: cfg.sl_enabled,
    sl_threshold_yearly_pence: cfg.sl_threshold_yearly_pence > 0 ? poundsToDisplay(cfg.sl_threshold_yearly_pence) : '',
    sl_rate_pct: String(cfg.sl_rate_pct),
    sl_balance_pence: cfg.sl_balance_pence != null ? poundsToDisplay(cfg.sl_balance_pence) : '',
    sl_interest_rate_pct: cfg.sl_interest_rate_pct != null ? String(cfg.sl_interest_rate_pct) : '',
  };
}

type ConfigFields = typeof EMPTY_CONFIG_FIELDS;

function fieldsToConfig(year: number, month: number, grossPounds: number, note: string, fields: ConfigFields): SalaryConfig | null {
  const p = (key: keyof ConfigFields) => parseFloat(String(fields[key]));
  const pence = (key: keyof ConfigFields) => Math.round(p(key) * 100);

  const cfg: SalaryConfig = {
    year, month,
    gross_yearly_pence: Math.round(grossPounds * 100),
    note: note.trim() || null,
    hours_per_week: p('hours_per_week'),
    work_weeks_per_year: p('work_weeks_per_year'),
    work_days_per_week: p('work_days_per_week'),
    employee_pension_pct: p('employee_pension_pct'),
    employer_pension_pct: p('employer_pension_pct'),
    personal_allowance_pence: pence('personal_allowance_pence'),
    basic_rate_band_pence: pence('basic_rate_band_pence'),
    additional_rate_threshold_pence: pence('additional_rate_threshold_pence'),
    basic_rate_pct: p('basic_rate_pct'),
    higher_rate_pct: p('higher_rate_pct'),
    additional_rate_pct: p('additional_rate_pct'),
    ni_lower_monthly_pence: pence('ni_lower_monthly_pence'),
    ni_upper_monthly_pence: pence('ni_upper_monthly_pence'),
    ni_primary_pct: p('ni_primary_pct'),
    ni_upper_pct: p('ni_upper_pct'),
    sl_enabled: Boolean(fields.sl_enabled),
    sl_threshold_yearly_pence: pence('sl_threshold_yearly_pence'),
    sl_rate_pct: p('sl_rate_pct'),
    sl_balance_pence: fields.sl_balance_pence ? Math.round(parseFloat(String(fields.sl_balance_pence)) * 100) : null,
    sl_interest_rate_pct: fields.sl_interest_rate_pct ? parseFloat(String(fields.sl_interest_rate_pct)) : null,
  };

  // Validate required numerics are finite
  const required: (keyof SalaryConfig)[] = [
    'hours_per_week', 'work_weeks_per_year', 'work_days_per_week',
    'employee_pension_pct', 'employer_pension_pct',
    'personal_allowance_pence', 'basic_rate_band_pence', 'additional_rate_threshold_pence',
    'basic_rate_pct', 'higher_rate_pct', 'additional_rate_pct',
    'ni_lower_monthly_pence', 'ni_upper_monthly_pence', 'ni_primary_pct', 'ni_upper_pct',
    'sl_threshold_yearly_pence', 'sl_rate_pct',
  ];
  for (const k of required) {
    if (!Number.isFinite(cfg[k] as number)) return null;
  }
  return cfg;
}

// ── sub-components (module scope — NOT inside Salary() to keep stable identity across re-renders) ─

const labelClass = 'block text-xs uppercase tracking-wide text-ink-faint mb-1';
const poundInputClass = 'w-full rounded-md border border-hairline bg-paper py-2 pl-7 pr-3 text-sm text-ink outline-none focus:border-ink/40';

function PoundInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">£</span>
        <input className={poundInputClass} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0.00" />
      </div>
    </div>
  );
}

function PctInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input className="w-full rounded-md border border-hairline bg-paper py-2 pl-3 pr-7 text-sm text-ink outline-none focus:border-ink/40" value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">%</span>
      </div>
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

const GROSS_FIELDS = ['yearly', 'monthly', 'weekly', 'daily', 'hourly'] as const;
type GrossField = (typeof GROSS_FIELDS)[number];

const GROSS_LABELS: Record<GrossField, string> = {
  yearly: 'Yearly', monthly: 'Monthly', weekly: 'Weekly', daily: 'Daily', hourly: 'Hourly',
};

export function Salary() {
  const { refresh } = useData();
  const [ym, setYm] = useState(currentYm());
  const [inheritedFrom, setInheritedFrom] = useState<{ year: number; month: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Gross input fields
  const [gross, setGross] = useState<Record<GrossField, string>>({ yearly: '', monthly: '', weekly: '', daily: '', hourly: '' });
  const [note, setNote] = useState('');

  // Time & hours disclosure
  const [timeOpen, setTimeOpen] = useState(false);

  // Config state (strings for input binding)
  const [configFields, setConfigFields] = useState<ConfigFields>(EMPTY_CONFIG_FIELDS);
  const [configEditing, setConfigEditing] = useState(false);
  const [configDraft, setConfigDraft] = useState<ConfigFields>(EMPTY_CONFIG_FIELDS);

  // Save state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load config when month changes
  const load = useCallback(async (ymStr: string) => {
    setLoading(true);
    setError(null);
    setSaveSuccess(false);
    const { year, month } = ymToYearMonth(ymStr);
    try {
      const resp = await getSalaryConfig(year, month);
      setInheritedFrom(resp.inheritedFrom);
      if (resp.config) {
        const fields = configToFields(resp.config);
        setConfigFields(fields);
        setConfigDraft(fields);
        const yearlyPounds = resp.config.gross_yearly_pence / 100;
        const wks = resp.config.work_weeks_per_year;
        const days = resp.config.work_days_per_week;
        const hrs = resp.config.hours_per_week;
        setGross(deriveFromYearly(yearlyPounds, wks, days, hrs));
        setNote(resp.config.note ?? '');
      } else {
        setConfigFields(EMPTY_CONFIG_FIELDS);
        setConfigDraft(EMPTY_CONFIG_FIELDS);
        setGross({ yearly: '', monthly: '', weekly: '', daily: '', hourly: '' });
        setNote('');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(ym); }, [ym, load]);

  // Handle editing any gross field — derive the OTHER 4 fields, leave the active one as typed.
  // Deriving all 5 (including the active field) would reformat it on every keystroke, losing focus.
  const onGrossChange = (field: GrossField, value: string) => {
    const pounds = parsePounds(value);
    setGross((prev) => {
      if (pounds == null) return { ...prev, [field]: value };
      const wks = parseFloat(configFields.work_weeks_per_year) || 52;
      const days = parseFloat(configFields.work_days_per_week) || 5;
      const hrs = parseFloat(configFields.hours_per_week) || 37;
      const yearlyPounds = toYearlyPounds(field, pounds, wks, days, hrs);
      const derived = deriveFromYearly(yearlyPounds, wks, days, hrs);
      return { ...derived, [field]: value }; // keep active field as-is
    });
  };

  // Breakdown calculation (memoised)
  const breakdown = useMemo(() => {
    const yearlyPounds = parsePounds(gross.yearly);
    if (yearlyPounds == null) return null;
    const { year, month } = ymToYearMonth(ym);
    const cfg = fieldsToConfig(year, month, yearlyPounds, note, configFields);
    if (!cfg) return null;
    try { return calcSalary(cfg); } catch { return null; }
  }, [gross.yearly, note, configFields, ym]);

  // Save — breakdown is always non-null here (Save button is disabled when breakdown is null)
  const onSave = async () => {
    if (!breakdown) return;
    const yearlyPounds = parsePounds(gross.yearly);
    if (yearlyPounds == null) return;
    const { year, month } = ymToYearMonth(ym);
    const cfg = fieldsToConfig(year, month, yearlyPounds, note, configFields);
    if (!cfg) { setError('Some config fields are invalid — please check the config panel.'); return; }
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await saveSalaryConfig(cfg, breakdown.netMonthlyPence);
      await refresh();
      setSaveSuccess(true);
      setInheritedFrom(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // Determine if saving this month updates the default
  const isPastMonth = ym < currentYm();

  // Config panel helpers
  const startEdit = () => { setConfigDraft({ ...configFields }); setConfigEditing(true); };
  const cancelEdit = () => setConfigEditing(false);
  const saveEdit = () => { setConfigFields({ ...configDraft }); setConfigEditing(false); };
  const setDraft = (key: keyof ConfigFields, value: string | boolean) =>
    setConfigDraft((prev) => ({ ...prev, [key]: value }));

  // ── render helpers ────────────────────────────────────────────────────────

  const inputClass = 'w-full rounded-md border border-hairline bg-paper py-2 px-3 text-sm text-ink outline-none focus:border-ink/40';

  return (
    <div className="flex flex-col gap-8">
      {/* Month picker + inherited indicator */}
      <div className="flex flex-wrap items-center gap-4">
        <MonthPicker ym={ym} onChange={setYm} />
        {inheritedFrom && (
          <span className="text-xs text-ink-muted">
            Showing values inherited from {monthLabel(`${inheritedFrom.year}-${String(inheritedFrom.month).padStart(2, '0')}`)}
          </span>
        )}
      </div>

      {loading ? (
        <Panel>Loading salary config…</Panel>
      ) : (
        <>
          {/* ── Gross Input ── */}
          <section className="rounded-lg border border-hairline bg-panel p-5">
            <h2 className="mb-4 font-serif text-base font-medium text-ink">Gross Pay</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {GROSS_FIELDS.map((field) => (
                <PoundInput
                  key={field}
                  label={GROSS_LABELS[field]}
                  value={gross[field]}
                  onChange={(v) => onGrossChange(field, v)}
                />
              ))}
            </div>
            <div className="mt-3">
              <label className={labelClass}>Note</label>
              <input
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. April pay rise + 2026/27 tax year"
              />
            </div>

            {/* Time & Hours disclosure */}
            <button
              type="button"
              onClick={() => setTimeOpen((o) => !o)}
              className="mt-4 flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
            >
              <span className={`transition-transform ${timeOpen ? 'rotate-90' : ''}`}>▶</span>
              Time & Hours
            </button>
            {timeOpen && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Hours / week</label>
                  <input className={inputClass} value={configFields.hours_per_week} onChange={(e) => setConfigFields((p) => ({ ...p, hours_per_week: e.target.value }))} inputMode="decimal" />
                </div>
                <div>
                  <label className={labelClass}>Work weeks / year</label>
                  <input className={inputClass} value={configFields.work_weeks_per_year} onChange={(e) => setConfigFields((p) => ({ ...p, work_weeks_per_year: e.target.value }))} inputMode="decimal" />
                </div>
                <div>
                  <label className={labelClass}>Work days / week</label>
                  <input className={inputClass} value={configFields.work_days_per_week} onChange={(e) => setConfigFields((p) => ({ ...p, work_days_per_week: e.target.value }))} inputMode="decimal" />
                </div>
              </div>
            )}
          </section>

          {/* ── Config Panel ── */}
          <section className="rounded-lg border border-hairline bg-panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-base font-medium text-ink">Tax & Deduction Parameters</h2>
              {!configEditing && (
                <button type="button" onClick={startEdit} className="text-xs text-accent hover:underline">Edit</button>
              )}
            </div>

            {configEditing ? (
              <>
                <div className="mb-4">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Pension</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <PctInput label="Employee %" value={configDraft.employee_pension_pct} onChange={(v) => setDraft('employee_pension_pct', v)} />
                    <PctInput label="Employer %" value={configDraft.employer_pension_pct} onChange={(v) => setDraft('employer_pension_pct', v)} />
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Income Tax</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <PoundInput label="Personal Allowance" value={configDraft.personal_allowance_pence} onChange={(v) => setDraft('personal_allowance_pence', v)} />
                    <PoundInput label="Basic Rate Band" value={configDraft.basic_rate_band_pence} onChange={(v) => setDraft('basic_rate_band_pence', v)} />
                    <PoundInput label="Additional Rate Threshold" value={configDraft.additional_rate_threshold_pence} onChange={(v) => setDraft('additional_rate_threshold_pence', v)} />
                    <PctInput label="Basic Rate" value={configDraft.basic_rate_pct} onChange={(v) => setDraft('basic_rate_pct', v)} />
                    <PctInput label="Higher Rate" value={configDraft.higher_rate_pct} onChange={(v) => setDraft('higher_rate_pct', v)} />
                    <PctInput label="Additional Rate" value={configDraft.additional_rate_pct} onChange={(v) => setDraft('additional_rate_pct', v)} />
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">National Insurance (monthly thresholds)</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <PoundInput label="Lower Threshold" value={configDraft.ni_lower_monthly_pence} onChange={(v) => setDraft('ni_lower_monthly_pence', v)} />
                    <PoundInput label="Upper Threshold" value={configDraft.ni_upper_monthly_pence} onChange={(v) => setDraft('ni_upper_monthly_pence', v)} />
                    <PctInput label="Primary Rate" value={configDraft.ni_primary_pct} onChange={(v) => setDraft('ni_primary_pct', v)} />
                    <PctInput label="Upper Rate" value={configDraft.ni_upper_pct} onChange={(v) => setDraft('ni_upper_pct', v)} />
                  </div>
                </div>
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Student Loan</h3>
                  <div className="mb-3 flex items-center gap-2">
                    <input type="checkbox" id="sl-enabled" checked={Boolean(configDraft.sl_enabled)} onChange={(e) => setDraft('sl_enabled', e.target.checked)} className="h-4 w-4 accent-accent" />
                    <label htmlFor="sl-enabled" className="text-sm text-ink">Student Loan enabled</label>
                  </div>
                  {configDraft.sl_enabled && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <PoundInput label="Threshold (yearly)" value={configDraft.sl_threshold_yearly_pence} onChange={(v) => setDraft('sl_threshold_yearly_pence', v)} />
                      <PctInput label="Rate" value={configDraft.sl_rate_pct} onChange={(v) => setDraft('sl_rate_pct', v)} />
                      <PoundInput label="Balance (optional)" value={configDraft.sl_balance_pence} onChange={(v) => setDraft('sl_balance_pence', v)} />
                      <PctInput label="Interest rate (optional)" value={configDraft.sl_interest_rate_pct} onChange={(v) => setDraft('sl_interest_rate_pct', v)} />
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={saveEdit} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90">Save Config</button>
                  <button type="button" onClick={cancelEdit} className="rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:bg-paper">Cancel</button>
                </div>
              </>
            ) : (
              /* Read-only summary */
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
                {[
                  ['Employee pension', `${configFields.employee_pension_pct}%`],
                  ['Employer pension', `${configFields.employer_pension_pct}%`],
                  ['Personal allowance', configFields.personal_allowance_pence ? `£${configFields.personal_allowance_pence}` : '—'],
                  ['Basic rate band', configFields.basic_rate_band_pence ? `£${configFields.basic_rate_band_pence}` : '—'],
                  ['Tax rates', configFields.basic_rate_pct ? `${configFields.basic_rate_pct} / ${configFields.higher_rate_pct} / ${configFields.additional_rate_pct}%` : '—'],
                  ['NI thresholds', configFields.ni_lower_monthly_pence ? `£${configFields.ni_lower_monthly_pence} – £${configFields.ni_upper_monthly_pence}/mo` : '—'],
                  ['NI rates', configFields.ni_primary_pct ? `${configFields.ni_primary_pct} / ${configFields.ni_upper_pct}%` : '—'],
                  ['Student Loan', configFields.sl_enabled ? `enabled · ${configFields.sl_rate_pct}% above £${configFields.sl_threshold_yearly_pence}` : 'disabled'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-hairline py-1">
                    <span className="text-ink-muted">{k}</span>
                    <span className="text-ink">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Breakdown Table ── */}
          {breakdown && (
            <section className="rounded-lg border border-hairline bg-panel p-5">
              <h2 className="mb-4 font-serif text-base font-medium text-ink">Salary Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-xs uppercase tracking-wide text-ink-faint">
                      <th className="pb-2 text-left font-normal">Row</th>
                      {['Yearly', 'Monthly', 'Weekly', 'Daily', 'Hourly'].map((h) => (
                        <th key={h} className="pb-2 text-right font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.rows.map((r) => {
                      const fmt = (v: number) =>
                        r.isPercentage
                          ? `${(v * 100).toFixed(1)}%`
                          : formatGBP(v);
                      const rowClass = [
                        'border-b border-hairline',
                        r.isSummary ? 'font-medium' : '',
                        r.isDeduction ? 'text-ink-muted' : 'text-ink',
                        r.key === 'netPay' ? 'text-accent' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <tr key={r.key} className={rowClass}>
                          <td className="py-1.5 pr-4">{r.label}</td>
                          {(['yearly', 'monthly', 'weekly', 'daily', 'hourly'] as const).map((col) => (
                            <td key={col} className="py-1.5 text-right tabular-nums">{fmt(r.figures[col])}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Save button ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !breakdown}
                className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save Income'}
              </button>
              {saveSuccess && <span className="text-sm text-ink-muted">Saved ✓</span>}
            </div>
            {isPastMonth && (
              <p className="text-xs text-ink-muted">
                Saving to {monthLabel(ym)} only · won't update default income
              </p>
            )}
            {error && <p className="text-sm text-over">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typechecks**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/salary/Salary.tsx
git commit -m "feat(web): add Salary tab component"
```

---

## Task 8: Wire up — add Salary tab to App, remove income from Manage

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/manage/Manage.tsx`
- Delete: `apps/web/src/features/manage/ManageIncome.tsx`

- [ ] **Step 1: Add Salary tab to App.tsx**

In `apps/web/src/App.tsx`, add the import:

```typescript
import { Salary } from './features/salary/Salary';
```

Change the `Tab` type and `TABS` array:

```typescript
type Tab = 'overview' | 'add' | 'manage' | 'salary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'add', label: '+ Add' },
  { id: 'salary', label: 'Salary' },
  { id: 'manage', label: '⚙ Manage' },
];
```

Add the keyboard shortcut in the `onKey` handler (after the `'m'` case):

```typescript
} else if (e.key === 's') {
  e.preventDefault();
  setTab('salary');
}
```

Add the Salary branch in the `<main>` render, before the `tab === 'add'` branch:

```tsx
) : tab === 'salary' ? (
  <Salary />
) : tab === 'add' ? (
```

Update the footer keyboard hints:

```tsx
<Kbd>s</Kbd> salary
```

(Add it alongside the existing `a`, `o`, `m` hints.)

- [ ] **Step 2: Remove income from Manage.tsx**

Replace the entire contents of `apps/web/src/features/manage/Manage.tsx` with:

```tsx
import { useState } from 'react';
import type { LedgerData } from '@budget/core';
import { Segmented } from '../../components/ui';
import { ManageEntries } from './ManageEntries';
import { ManageTaxonomy } from './ManageTaxonomy';

type View = 'entries' | 'taxonomy';

export function Manage({ data }: { data: LedgerData }) {
  const [view, setView] = useState<View>('entries');
  return (
    <div>
      <div className="mb-6">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { id: 'entries', label: 'Entries' },
            { id: 'taxonomy', label: 'Taxonomy' },
          ]}
        />
      </div>
      {view === 'entries' && <ManageEntries data={data} />}
      {view === 'taxonomy' && <ManageTaxonomy data={data} />}
    </div>
  );
}
```

- [ ] **Step 3: Delete ManageIncome.tsx**

```bash
rm apps/web/src/features/manage/ManageIncome.tsx
```

- [ ] **Step 4: Run typechecks**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
npm test 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 6: Start the dev server and verify manually**

```bash
npm run dev
```

Open `http://lab14102.labs.decoded.com:5001` and verify:
- Salary tab appears in the nav
- Entering a yearly salary fills the other four fields
- Config panel is read-only; Edit button reveals editable fields; Save Config commits them
- Time & Hours disclosure expands and collapses
- Breakdown table appears once salary + config fields are populated
- Save Income writes to the app (visible in Overview month income figures)
- Navigating to a past month shows the inherited-from indicator
- Manage tab no longer has an Income sub-tab

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/features/manage/Manage.tsx
git commit -m "feat(web): wire Salary tab into nav; remove income from Manage"
```
