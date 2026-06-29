# Salary Breakdown Redesign — Phase 1 (engine + layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single flat salary breakdown table with four sections (rate strip, expandable breakdown, stats, pension), and replace the inaccurate annualised "yearly tax" with an accurate Forecast (YTD actuals + rest-of-year at current rate).

**Architecture:** Keep `calcSalary` as the payslip-validated kernel — its `rows`/`netMonthlyPence` and every number in `salary.test.ts` stay **untouched**. `calcSalary` additionally returns a new `view: SalaryView` model. The view reuses existing annualise figures for the rate strip, and computes new Forecast + YTD figures by feeding the already-fetched YTD totals into the **existing** `taxOnCumulative` (the PAYE math is never re-derived). `Salary.tsx` renders `view`; the old table render is removed. This is Phase 1 — pension Forecast is an interim annualise and pension All-time is hidden (Phase 2 adds the cross-adapter pension data).

**Tech Stack:** TypeScript monorepo, `@budget/core` (pure functions, vitest), `apps/web` (React + Tailwind), Tauri/HTTP data adapters (untouched in Phase 1).

**Spec:** `docs/superpowers/specs/2026-06-18-salary-breakdown-redesign-design.md`

---

## Deliberate deviation from spec §5.1

The spec says "replace the flat `SalaryBreakdown.rows` shape." This plan instead **keeps** `rows`
(now consumed only by the validated tests + as the kernel's internal snapshot) and **adds** the
`view`. Rationale: the spec's overriding constraint (§5.1/§7) is that the payslip-validated pence
values must not drift. Keeping the validated kernel and its tests verbatim is the lowest-risk way
to guarantee that. `rows` can be retired in a later cleanup once `view` tests fully subsume them.

---

## File structure

- `packages/core/src/types.ts` — **modify**: add `SalaryView` and its sub-types; widen
  `calcSalary` YTD input type; add `view` to `SalaryBreakdown`.
- `packages/core/src/salary.ts` — **modify**: widen `ytdInput`; after the existing computation,
  build Forecast + YTD figures and assemble `view`; return `{ rows, netMonthlyPence, view }`.
- `packages/core/src/salary.test.ts` — **modify**: existing assertions unchanged; append new
  `describe` blocks for the `view` (forecast/ytd/rate-strip/stats/pension).
- `apps/web/src/features/salary/SalaryView.tsx` — **create**: the four presentational
  components (`RateStrip`, `BreakdownTable`, `StatsPanel`, `PensionPanel`) + shared formatting.
- `apps/web/src/features/salary/Salary.tsx` — **modify**: pass full YTD into `calcSalary`;
  replace the old `<table>` render with the new components.

---

## Task 1: View types

**Files:**
- Modify: `packages/core/src/types.ts` (after `SalaryBreakdown`, ~line 117)

- [ ] **Step 1: Add the view types**

Append after the existing `SalaryBreakdown` type:

```ts
// ── New structured view (Salary tab redesign) ───────────────────────────────
// Pence integers. Deduction figures are negative. weekly/daily/hourly are null
// where a per-period rate is meaningless (every deduction/tax row).
export type BreakdownCell = {
  forecast: number;          // yearly forecast: YTD actual + rest-of-year at current rate
  monthly: number;           // this month's actual figure (validated payslip number)
  weekly: number | null;
  daily: number | null;
  hourly: number | null;
  ytd: number | null;        // year-to-date actual (null where not tracked yet)
};

export type BreakdownLine = {
  key: string;
  label: string;
  cell: BreakdownCell;
  isDeduction: boolean;
  isNet: boolean;            // the Net Income line (accent styling)
  depth: number;             // 0 = top group, 1 = child, 2 = tax band
  children?: BreakdownLine[];
};

export type RateRow = {
  key: string;
  label: string;
  yearly: number;
  monthly: number;
  weekly: number;
  daily: number;
  hourly: number;
  pctGross: number;          // fraction, e.g. 0.726
};

export type SalaryStats = {
  effectiveRate: number;                    // fraction
  effectiveRateInclEmployerPension: number; // fraction
};

export type PensionRow = {
  key: string;
  label: string;
  month: number;
  yearlyForecast: number;
  allTime: number | null;    // null in Phase 1 (hidden)
};

export type SalaryView = {
  rateStrip: RateRow[];      // gross, net, netInclEmployerPension
  breakdown: BreakdownLine[];
  stats: SalaryStats;
  pension: PensionRow[];     // employer, employee, total
};
```

- [ ] **Step 2: Widen the YTD input type and add `view` to the result**

Replace the `SalaryBreakdown` type (`view` is optional until Task 3 wires it, so every
intermediate task typechecks green):

```ts
export type SalaryBreakdown = {
  rows: SalaryRow[];
  netMonthlyPence: number;
  view?: SalaryView; // optional until Task 3; tightened to required there
};
```

Add a named input type (used by `calcSalary` and the caller):

```ts
// Already-fetched YTD totals (all positive magnitudes) fed into the view math.
export type SalaryYTDInput = {
  adjustedNetYTDPence: number;
  priorAdjNetYTDPence: number;
  grossYTDPence: number;
  employeePensionYTDPence: number;
  niYTDPence: number;
  slYTDPence: number;
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (types are additive; `view` is optional so `calcSalary`'s current return is valid).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(salary): add SalaryView types for breakdown redesign"
```

---

## Task 2: Widen `calcSalary` YTD input (no behaviour change)

**Files:**
- Modify: `packages/core/src/salary.ts:75-79` (signature) and `apps/web/src/features/salary/Salary.tsx:285-288` (caller)
- Test: `packages/core/src/salary.test.ts`

- [ ] **Step 1: Write a test pinning that widening the input does not change monthly tax**

Append to `salary.test.ts`:

```ts
describe('calcSalary — widened YTD input is backward compatible', () => {
  it('passing full YTD totals does not change the validated monthly tax', () => {
    // adjustedNetYTD/prior at BASE period 10 (steady) = 10×/9× adjusted net monthly.
    const adjNetM = 468_543;
    const r = calcSalary(BASE, undefined, {
      adjustedNetYTDPence: 10 * adjNetM,
      priorAdjNetYTDPence: 9 * adjNetM,
      grossYTDPence: 10 * 495_550,
      employeePensionYTDPence: 10 * 27_007,
      niYTDPence: 10 * 26_666,
      slYTDPence: 10 * 23_200,
    });
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.monthly).toBe(-82_685);
    expect(r.netMonthlyPence).toBe(335_992);
  });
});
```

- [ ] **Step 2: Run it — expect a TYPE/compile error (extra fields not in current input type)**

Run: `npx vitest run packages/core/src/salary.test.ts -t "widened YTD input"`
Expected: FAIL (object literal has properties not in the current inline `ytdInput` type).

- [ ] **Step 3: Widen the signature to the new type**

In `salary.ts`, replace the import line 1 and the `ytdInput` param:

```ts
import type { SalaryConfig, SalaryBreakdown, SalaryFigures, SalaryRow, SalaryView, SalaryYTDInput } from './types';
```

Change the `calcSalary` signature (line ~75-79):

```ts
export function calcSalary(
  cfg: SalaryConfig,
  employmentStart?: { year: number; month: number },
  ytdInput?: SalaryYTDInput,
): SalaryBreakdown {
```

The existing monthly logic only reads `ytdInput.adjustedNetYTDPence` / `priorAdjNetYTDPence`, so
no other change is needed for behaviour to stay identical.

- [ ] **Step 4: Run the full core test file — all existing tests + the new one pass**

Run: `npx vitest run packages/core/src/salary.test.ts`
Expected: PASS — `view` is optional, so the new backcompat test and all existing validated tests
pass. Do not alter any expected number.

- [ ] **Step 5: Update the caller to pass full YTD**

In `Salary.tsx`, replace the `ytdInput` construction (lines ~285-287):

```ts
    const ytdInput = ytdData
      ? {
          adjustedNetYTDPence: ytdData.adjustedNetYTDPence,
          priorAdjNetYTDPence: ytdData.priorAdjNetYTDPence,
          grossYTDPence: ytdData.grossYTDPence,
          employeePensionYTDPence: ytdData.employeePensionYTDPence,
          niYTDPence: ytdData.niYTDPence,
          slYTDPence: ytdData.slYTDPence,
        }
      : undefined;
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS (all fields exist on `SalaryYTD`).

```bash
git add packages/core/src/salary.ts packages/core/src/salary.test.ts apps/web/src/features/salary/Salary.tsx
git commit -m "feat(salary): widen calcSalary YTD input (no behaviour change)"
```

---

## Task 3: Compute Forecast + YTD figures and assemble the view

**Files:**
- Modify: `packages/core/src/salary.ts` (insert before `const rows: SalaryRow[] = [` at ~line 213, and change the `return`)
- Test: `packages/core/src/salary.test.ts`

- [ ] **Step 1: Write the forecast/ytd/view tests (invariants + independent pins)**

Append to `salary.test.ts`:

```ts
describe('calcSalary — view: forecast', () => {
  const find = (v: import('./types').SalaryView, key: string) => {
    const walk = (lines: import('./types').BreakdownLine[]): import('./types').BreakdownLine | undefined => {
      for (const l of lines) {
        if (l.key === key) return l;
        const c = l.children && walk(l.children);
        if (c) return c;
      }
    };
    return walk(v.breakdown)!;
  };

  it('steady-state: forecast tax equals the validated annualise yearly tax', () => {
    // No employmentStart, no ytdInput → forecast spans a full 12 months → == annualise.
    const r = calcSalary(BASE);
    const taxYearly = r.rows.find((x) => x.key === 'incomeTax')!.figures.yearly; // -992_180
    expect(find(r.view, 'incomeTax').cell.forecast).toBe(taxYearly);
  });

  it('steady-state: monthly cell equals the validated monthly tax', () => {
    const r = calcSalary(BASE);
    expect(find(r.view, 'incomeTax').cell.monthly).toBe(-82_685);
  });

  it('mid-year (Nov start) forecast tax is the partial-year liability, not the annualise figure', () => {
    // forecastAdjNet = 5 × 330_925 = 1_654_625; taxable floor((..−1_257_000))=397_600; ×20% = 79_520.
    const cfg42k = { ...BASE, gross_yearly_pence: 4_200_000, sl_enabled: false, bonus_pence: 0 };
    const r = calcSalary({ ...cfg42k, year: 2025, month: 11 }, { year: 2025, month: 11 });
    expect(find(r.view, 'incomeTax').cell.forecast).toBe(-79_520);
    // and the old annualise value (still on rows.yearly) is the larger, wrong-for-the-year figure
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.yearly).toBe(-542_820);
  });

  it('forecast column reconciles: net = adjusted net + tax + NI + SL', () => {
    const r = calcSalary(BASE);
    const net = find(r.view, 'netIncome').cell.forecast;
    const adj = find(r.view, 'adjustedNet').cell.forecast;
    const tax = find(r.view, 'incomeTax').cell.forecast;
    const ni = find(r.view, 'ni').cell.forecast;
    const sl = find(r.view, 'sl').cell.forecast;
    expect(net).toBe(adj + tax + ni + sl);
  });
});

describe('calcSalary — view: YTD column', () => {
  const find = (v: import('./types').SalaryView, key: string) => {
    const walk = (lines: import('./types').BreakdownLine[]): import('./types').BreakdownLine | undefined => {
      for (const l of lines) { if (l.key === key) return l; const c = l.children && walk(l.children); if (c) return c; }
    };
    return walk(v.breakdown)!;
  };

  it('YTD gross equals the passed YTD total', () => {
    const r = calcSalary(BASE, undefined, {
      adjustedNetYTDPence: 10 * 468_543, priorAdjNetYTDPence: 9 * 468_543,
      grossYTDPence: 10 * 495_550, employeePensionYTDPence: 10 * 27_007,
      niYTDPence: 10 * 26_666, slYTDPence: 10 * 23_200,
    });
    expect(find(r.view, 'grossIncome').cell.ytd).toBe(10 * 495_550);
  });

  it('YTD net reconciles: adjusted net + tax + NI + SL', () => {
    const r = calcSalary(BASE, undefined, {
      adjustedNetYTDPence: 10 * 468_543, priorAdjNetYTDPence: 9 * 468_543,
      grossYTDPence: 10 * 495_550, employeePensionYTDPence: 10 * 27_007,
      niYTDPence: 10 * 26_666, slYTDPence: 10 * 23_200,
    });
    const net = find(r.view, 'netIncome').cell.ytd!;
    const adj = find(r.view, 'adjustedNet').cell.ytd!;
    const tax = find(r.view, 'incomeTax').cell.ytd!;
    const ni = find(r.view, 'ni').cell.ytd!;
    const sl = find(r.view, 'sl').cell.ytd!;
    expect(net).toBe(adj + tax + ni + sl);
  });
});

describe('calcSalary — view: rate strip, stats, pension', () => {
  it('rate strip: gross is 100%, net < gross, net-incl-pension > net', () => {
    const v = calcSalary(BASE).view;
    const [gross, net, incl] = v.rateStrip;
    expect(gross.pctGross).toBeCloseTo(1, 10);
    expect(net.yearly).toBeLessThan(gross.yearly);
    expect(incl.yearly).toBeGreaterThan(net.yearly);
  });

  it('stats: rates are positive fractions; incl-employer-pension is the lower one', () => {
    const s = calcSalary(BASE).view.stats;
    expect(s.effectiveRate).toBeGreaterThan(0);
    expect(s.effectiveRate).toBeLessThan(1);
    expect(s.effectiveRateInclEmployerPension).toBeLessThan(s.effectiveRate);
  });

  it('pension: contributions are positive and into-pot = employer + employee', () => {
    const [er, ee, tot] = calcSalary(BASE).view.pension;
    expect(ee.yearlyForecast).toBeGreaterThan(0);
    expect(ee.month).toBeGreaterThan(0);
    expect(tot.yearlyForecast).toBe(er.yearlyForecast + ee.yearlyForecast);
    expect(tot.month).toBe(er.month + ee.month);
  });
});
```

- [ ] **Step 2: Run — expect failure (view not built / wrong shape)**

Run: `npx vitest run packages/core/src/salary.test.ts -t "view:"`
Expected: FAIL (`r.view` undefined or lines missing).

- [ ] **Step 3: Build the view in `salary.ts`**

Insert the following **immediately before** `const rows: SalaryRow[] = [` (~line 213). It only
uses variables already in scope (`taxPeriod`, `monthsEmployed`, `adjustedNetM`, `monthlyGross`,
`niMonthly`, `slMonthly`, `employeePensionMonthly`, `employerPensionY`, `effectivePaM`,
`monthlyBRB`, `monthlyARTaxable`, `monthlyPA`, `grossY`, `bonusY`, `netPayY`, `cfg`, plus the
monthly `*Monthly` figures and `PAUsedM`):

```ts
  // ── New structured view ───────────────────────────────────────────────────
  const p = taxPeriod;
  const remaining = 12 - p;

  // YTD magnitudes (positive). Fall back to flat approximation when no YTD passed.
  const adjNetYTDmag   = ytdInput ? ytdInput.adjustedNetYTDPence     : monthsEmployed * adjustedNetM;
  const grossYTDmag    = ytdInput ? ytdInput.grossYTDPence           : monthsEmployed * monthlyGross;
  const niYTDmag       = ytdInput ? ytdInput.niYTDPence              : monthsEmployed * -niMonthly;
  const slYTDmag       = ytdInput ? ytdInput.slYTDPence              : monthsEmployed * -slMonthly;
  const empPenYTDmag   = ytdInput ? ytdInput.employeePensionYTDPence : monthsEmployed * -employeePensionMonthly;

  // Forecast magnitudes = YTD actual + remaining months at the current rate.
  const forecastAdjNet = adjNetYTDmag + remaining * adjustedNetM;
  const [basicFC, higherFC, addlFC] = taxOnCumulative(forecastAdjNet, 12, effectivePaM, monthlyBRB, monthlyARTaxable, cfg);
  const grossFC   = grossYTDmag  + remaining * monthlyGross;
  const niFCmag   = niYTDmag      + remaining * -niMonthly;
  const slFCmag   = slYTDmag      + remaining * -slMonthly;
  const empPenFC  = empPenYTDmag  + remaining * -employeePensionMonthly;
  const taxFC     = basicFC + higherFC + addlFC;
  const taxableFC = Math.max(0, Math.floor((forecastAdjNet - 12 * effectivePaM) / 100) * 100);
  const allowFC   = Math.min(forecastAdjNet, 12 * monthlyPA);
  const netFC     = forecastAdjNet - taxFC - niFCmag - slFCmag;

  // YTD tax (cumulative through current period) via the validated routine.
  const [basicYTD, higherYTD, addlYTD] = taxOnCumulative(adjNetYTDmag, p, effectivePaM, monthlyBRB, monthlyARTaxable, cfg);
  const taxYTD     = basicYTD + higherYTD + addlYTD;
  const taxableYTD = Math.max(0, Math.floor((adjNetYTDmag - p * effectivePaM) / 100) * 100);
  const allowYTD   = Math.min(adjNetYTDmag, p * monthlyPA);
  const netYTD     = adjNetYTDmag - taxYTD - niYTDmag - slYTDmag;

  // Per-period slices of a monthly figure (this month annualised, re-sliced).
  const wk = (monthly: number) => Math.round((monthly * 12) / cfg.work_weeks_per_year);
  const dy = (monthly: number) => Math.round(((monthly * 12) / cfg.work_weeks_per_year) / cfg.work_days_per_week);
  const hr = (monthly: number) => Math.round(((monthly * 12) / cfg.work_weeks_per_year) / cfg.hours_per_week);
  const rated = (forecast: number, monthly: number, ytd: number | null): BreakdownCell =>
    ({ forecast, monthly, weekly: wk(monthly), daily: dy(monthly), hourly: hr(monthly), ytd });
  const flatCell = (forecast: number, monthly: number, ytd: number | null): BreakdownCell =>
    ({ forecast, monthly, weekly: null, daily: null, hourly: null, ytd });

  // This-month figures (signed; deductions negative) already computed above:
  //   grossM+bonusM, employeePensionMonthly, incomeTaxMonthly, niMonthly, slMonthly,
  //   basicM/higherM/addlM (magnitudes), PAUsedM, adjustedNetMonthly, netPayMonthly.
  const grossMthly = Math.round((grossY + bonusY) / 12);

  const taxChildren: BreakdownLine[] = [
    { key: 'allowanceUsed', label: 'Allowance Used', depth: 2, isDeduction: false, isNet: false,
      cell: flatCell(allowFC, PAUsedM, allowYTD) },
    { key: 'taxBasic', label: 'Basic Rate', depth: 2, isDeduction: true, isNet: false,
      cell: flatCell(-basicFC, -basicM, -basicYTD) },
    { key: 'taxHigher', label: 'Higher Rate', depth: 2, isDeduction: true, isNet: false,
      cell: flatCell(-higherFC, -higherM, -higherYTD) },
    ...(addlFC > 0 || addlM > 0
      ? [{ key: 'taxAddl', label: 'Additional Rate', depth: 2, isDeduction: true, isNet: false,
          cell: flatCell(-addlFC, -addlM, -addlYTD) } as BreakdownLine]
      : []),
  ];

  const deductionChildren: BreakdownLine[] = [
    { key: 'employeePension', label: 'Employee Pension', depth: 1, isDeduction: true, isNet: false,
      cell: flatCell(-empPenFC, employeePensionMonthly, -empPenYTDmag) },
    { key: 'incomeTax', label: 'Income Tax', depth: 1, isDeduction: true, isNet: false,
      cell: flatCell(-taxFC, incomeTaxMonthly, -taxYTD), children: taxChildren },
    { key: 'ni', label: 'National Insurance', depth: 1, isDeduction: true, isNet: false,
      cell: flatCell(-niFCmag, niMonthly, -niYTDmag) },
    ...(cfg.sl_enabled
      ? [{ key: 'sl', label: 'Student Loan (Plan 2)', depth: 1, isDeduction: true, isNet: false,
          cell: flatCell(-slFCmag, slMonthly, -slYTDmag) } as BreakdownLine]
      : []),
  ];

  const deductionsFC  = -empPenFC - taxFC - niFCmag - slFCmag;
  const deductionsMth = employeePensionMonthly + incomeTaxMonthly + niMonthly + slMonthly;
  const deductionsYTD = -empPenYTDmag - taxYTD - niYTDmag - slYTDmag;

  const breakdown: BreakdownLine[] = [
    { key: 'grossIncome', label: 'Gross Income', depth: 0, isDeduction: false, isNet: false,
      cell: rated(grossFC, grossMthly, grossYTDmag),
      children: [
        // Bonus is a flat annual figure; grossFC includes the forecast bonus, so base = grossFC − bonusY.
        { key: 'basePay', label: 'Base Pay', depth: 1, isDeduction: false, isNet: false,
          cell: rated(grossFC - bonusY, Math.round(grossY / 12), null) },
        { key: 'bonusPay', label: 'Bonus', depth: 1, isDeduction: false, isNet: false,
          cell: rated(bonusY, Math.round(bonusY / 12), null) },
      ] },
    { key: 'deductions', label: 'Deductions', depth: 0, isDeduction: true, isNet: false,
      cell: flatCell(deductionsFC, deductionsMth, deductionsYTD), children: deductionChildren },
    { key: 'netIncome', label: 'Net Income', depth: 0, isDeduction: false, isNet: true,
      cell: rated(netFC, netPayMonthly, netYTD),
      children: [
        { key: 'adjustedNet', label: 'Adjusted Net Income', depth: 1, isDeduction: false, isNet: false,
          cell: flatCell(forecastAdjNet, adjustedNetMonthly, adjNetYTDmag) },
        { key: 'taxableIncome', label: 'Taxable Income', depth: 1, isDeduction: false, isNet: false,
          cell: flatCell(taxableFC, Math.max(0, adjustedNetMonthly - Math.round(effectivePaM)), taxableYTD) },
      ] },
  ];

  // Rate strip — standing current rate (annualise; reuse existing annualise figures).
  const grossStandY = grossY + bonusY;
  const netStandY   = netPayY;                       // existing annualise net
  const netInclY    = netPayY + employerPensionY;
  const rateRow = (key: string, label: string, yearly: number): RateRow => ({
    key, label, yearly,
    monthly: Math.round(yearly / 12),
    weekly:  Math.round(yearly / cfg.work_weeks_per_year),
    daily:   Math.round(Math.round(yearly / cfg.work_weeks_per_year) / cfg.work_days_per_week),
    hourly:  Math.round(Math.round(yearly / cfg.work_weeks_per_year) / cfg.hours_per_week),
    pctGross: grossStandY > 0 ? yearly / grossStandY : 0,
  });
  const rateStrip: RateRow[] = [
    rateRow('gross', 'Gross Income', grossStandY),
    rateRow('net', 'Net Income', netStandY),
    rateRow('netInclPension', 'Net incl. employer pension', netInclY),
  ];

  // Stats — Forecast basis. Numerator excludes pension (saving, not tax).
  const statDeductionsFC = taxFC + niFCmag + slFCmag;
  const stats: SalaryStats = {
    effectiveRate: grossFC > 0 ? statDeductionsFC / grossFC : 0,
    effectiveRateInclEmployerPension:
      grossFC + employerPensionY > 0 ? statDeductionsFC / (grossFC + employerPensionY) : 0,
  };

  // Pension — Phase 1: Month + interim annualise Yearly; All-time hidden (null).
  // empPenFC and employerPensionY are positive magnitudes; the pension panel shows
  // contributions as positive (employeePensionMonthly is negative → flip for the month col).
  const employerMonthly = Math.round(employerPensionY / 12);
  const employeeMonthly = -employeePensionMonthly;   // positive contribution
  const pension: PensionRow[] = [
    { key: 'employer', label: 'Employer', month: employerMonthly, yearlyForecast: employerPensionY, allTime: null },
    { key: 'employee', label: 'Employee', month: employeeMonthly, yearlyForecast: empPenFC, allTime: null },
    { key: 'total', label: 'Into pot', month: employerMonthly + employeeMonthly, yearlyForecast: employerPensionY + empPenFC, allTime: null },
  ];

  const view: SalaryView = { rateStrip, breakdown, stats, pension };
```

Add the new imported types at the top of `salary.ts` (extend the Task 2 import):

```ts
import type {
  SalaryConfig, SalaryBreakdown, SalaryFigures, SalaryRow,
  SalaryView, SalaryYTDInput, BreakdownLine, BreakdownCell, RateRow, SalaryStats, PensionRow,
} from './types';
```

- [ ] **Step 4: Change the return to include `view`**

Replace `return { rows, netMonthlyPence: netPayMonthly };` (~line 234):

```ts
  return { rows, netMonthlyPence: netPayMonthly, view };
```

Now tighten the type in `types.ts` — change `view?: SalaryView;` to `view: SalaryView;` on
`SalaryBreakdown` (it is always returned). The UI in Task 5 relies on it being required.

- [ ] **Step 5: Run the full core test file**

Run: `npx vitest run packages/core/src/salary.test.ts`
Expected: PASS — all original (validated) tests + the new view tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/salary.ts packages/core/src/salary.test.ts packages/core/src/types.ts
git commit -m "feat(salary): build SalaryView (forecast + YTD) on the validated kernel"
```

---

## Task 4: Presentational components

**Files:**
- Create: `apps/web/src/features/salary/SalaryView.tsx`

- [ ] **Step 1: Create the components**

```tsx
import { useState } from 'react';
import { formatGBP, type BreakdownLine, type SalaryView } from '@budget/core';

const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
const cell = (v: number | null) => (v == null ? '—' : formatGBP(v));

const th = 'pb-2 text-right text-xs font-normal uppercase tracking-wide text-ink-faint';
const td = 'py-1.5 text-right tabular-nums';

export function RateStrip({ rows }: { rows: SalaryView['rateStrip'] }) {
  return (
    <section className="rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">Rate</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className={`${th} text-left`}>Rate</th>
              {['Yearly', 'Monthly', 'Weekly', 'Daily', 'Hourly', '% Gross'].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-hairline text-ink">
                <td className="py-1.5 pr-4">{r.label}</td>
                <td className={td}>{formatGBP(r.yearly)}</td>
                <td className={td}>{formatGBP(r.monthly)}</td>
                <td className={td}>{formatGBP(r.weekly)}</td>
                <td className={td}>{formatGBP(r.daily)}</td>
                <td className={td}>{formatGBP(r.hourly)}</td>
                <td className={td}>{pct(r.pctGross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ line, open, toggle }: {
  line: BreakdownLine;
  open: Record<string, boolean>;
  toggle: (k: string) => void;
}) {
  const hasChildren = !!line.children?.length;
  const isOpen = open[line.key] ?? line.depth === 0; // top groups default open
  const pad = ['pr-4', 'pl-4 pr-4', 'pl-8 pr-4', 'pl-12 pr-4'][line.depth] ?? 'pr-4';
  const tone = line.isNet ? 'text-accent' : line.isDeduction ? 'text-ink-muted' : 'text-ink';
  const weight = line.depth === 0 ? 'font-medium' : '';
  return (
    <>
      <tr className={`border-b border-hairline ${tone} ${weight}`}>
        <td className={`py-1.5 ${pad}`}>
          {hasChildren ? (
            <button type="button" onClick={() => toggle(line.key)} className="inline-flex items-center gap-1 hover:text-ink">
              <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              {line.label}
            </button>
          ) : line.label}
        </td>
        <td className={td}>{cell(line.cell.forecast)}</td>
        <td className={td}>{cell(line.cell.monthly)}</td>
        <td className={td}>{cell(line.cell.weekly)}</td>
        <td className={td}>{cell(line.cell.daily)}</td>
        <td className={td}>{cell(line.cell.hourly)}</td>
        <td className={td}>{cell(line.cell.ytd)}</td>
      </tr>
      {hasChildren && isOpen && line.children!.map((c) => (
        <Row key={c.key} line={c} open={open} toggle={toggle} />
      ))}
    </>
  );
}

export function BreakdownTable({ lines }: { lines: BreakdownLine[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ incomeTax: false });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !(o[k] ?? false) }));
  return (
    <section className="rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">Breakdown</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className={`${th} text-left`}>Row</th>
              {['Yearly (fcast)', 'Monthly', 'Weekly', 'Daily', 'Hourly', 'YTD'].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => <Row key={l.key} line={l} open={open} toggle={toggle} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StatsPanel({ stats }: { stats: SalaryView['stats'] }) {
  return (
    <section className="flex-1 rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">Stats</h2>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">Effective tax + NI rate</dt>
          <dd className="tabular-nums text-ink">{pct(stats.effectiveRate)}</dd>
        </div>
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">… incl. employer pension</dt>
          <dd className="tabular-nums text-ink">{pct(stats.effectiveRateInclEmployerPension)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function PensionPanel({ rows }: { rows: SalaryView['pension'] }) {
  const showAllTime = rows.some((r) => r.allTime != null);
  return (
    <section className="flex-1 rounded-lg border border-hairline bg-panel p-5">
      <h2 className="mb-4 font-serif text-base font-medium text-ink">Pension</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className={`${th} text-left`}>&nbsp;</th>
              <th className={th}>Month</th>
              <th className={th}>Yearly</th>
              {showAllTime && <th className={th}>All-time</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-b border-hairline text-ink ${r.key === 'total' ? 'font-medium' : ''}`}>
                <td className="py-1.5 pr-4">{r.label}</td>
                <td className={td}>{formatGBP(r.month)}</td>
                <td className={td}>{formatGBP(r.yearlyForecast)}</td>
                {showAllTime && <td className={td}>{cell(r.allTime)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/salary/SalaryView.tsx
git commit -m "feat(salary): rate strip / breakdown / stats / pension components"
```

---

## Task 5: Render the view in `Salary.tsx`

**Files:**
- Modify: `apps/web/src/features/salary/Salary.tsx` (imports; replace the breakdown `<section>` at ~lines 498-537)

- [ ] **Step 1: Import the new components**

Add near the top of `Salary.tsx`:

```ts
import { BreakdownTable, PensionPanel, RateStrip, StatsPanel } from './SalaryView';
```

- [ ] **Step 2: Replace the old breakdown table render**

Replace the entire `{/* ── Breakdown Table ── */}` block (the `{breakdown && ( <section> … </section> )}`, ~lines 498-537) with:

```tsx
          {/* ── Salary view ── */}
          {breakdown && (
            <>
              <RateStrip rows={breakdown.view.rateStrip} />
              <BreakdownTable lines={breakdown.view.breakdown} />
              <div className="flex flex-col gap-8 sm:flex-row">
                <StatsPanel stats={breakdown.view.stats} />
                <PensionPanel rows={breakdown.view.pension} />
              </div>
            </>
          )}
```

(`breakdown` here is the `calcSalary` result memo; it now carries `.view`.)

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (If lint flags an unused `formatGBP` import in `Salary.tsx`, remove it only if no
longer used elsewhere in that file.)

- [ ] **Step 4: Manual verification in the browser**

Run: `npm run dev`
Open: `http://192.168.14.102:5001` (network IP — Vite `allowedHosts` is intentionally absent) →
Salary tab. Verify: rate strip (Gross/Net/Net incl. pension), breakdown expands/collapses
(Income Tax collapsed by default; tax rows blank under Weekly/Daily/Hourly), Stats + Pension side
by side. Change month and confirm figures update; the saved Net still matches the ledger.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/salary/Salary.tsx
git commit -m "feat(salary): render four-section view, retire flat breakdown table"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the whole suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS. The validated `salary.test.ts` numbers are unchanged; `queries.test.ts`
parity tests untouched (no data-layer change in Phase 1).

- [ ] **Step 2: Confirm no number drift (sanity grep)**

Run: `git log -p -1 -- packages/core/src/salary.test.ts | grep -E "^[-].*toBe\(" | grep -v "^---"`
Expected: **no output** (no existing assertion line was removed/changed — only additions).

- [ ] **Step 3: Final commit if anything outstanding**

```bash
git add -A && git commit -m "test(salary): verify Phase 1 redesign green" --allow-empty
```

---

## Phase 2 (separate plan — not in scope here)

Employer-pension YTD + all-time pension totals cross the HTTP/Tauri adapter seam (CLAUDE.md "one
rule"): extend `computeSalaryYTD` + `YTDConfigRow` + the YTD SQL (both `http.ts`→`repo.ts` and
`queries.ts`, + `db.rs` if a transaction is needed), add an all-time aggregation, with parity
tests in both `queries.test.ts` and the Rust tests. Then replace the Pension panel's interim
annualise Yearly with the real forecast and reveal the All-time column. Write as
`docs/superpowers/plans/<date>-salary-breakdown-redesign-phase-2.md`.
```
