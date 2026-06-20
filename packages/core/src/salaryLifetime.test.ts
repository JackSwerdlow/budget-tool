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
// tax year's own actual PAYE (April reset). Expected tax is computed via the engine's own
// YTD column per tax year (never hand-transcribed), and asserted to differ from a single
// cumulative spanning both years — that inequality is the real proof of the April reset.
test('lifetime income tax = Σ per-tax-year actual PAYE (April reset)', () => {
  const a = base(2025, 4, 3_000_000);
  const b = base(2026, 4, 4_200_000);
  const through = { year: 2026, month: 9 };
  const life = computeLifetime([a, b], through);

  const tyA = computeSalaryYTD([{ ...a, sl_enabled: 1 } as never], { year: 2025, month: 4 }, 2026, 3);
  const tyAtax = -calcSalaryTaxYTD(a, { year: 2025, month: 4 }, tyA, 2026, 3);
  const tyB = computeSalaryYTD([{ ...b, sl_enabled: 1 } as never], { year: 2026, month: 4 }, 2026, 9);
  const tyBtax = -calcSalaryTaxYTD(b, { year: 2026, month: 4 }, tyB, 2026, 9);
  expect(life.incomeTaxPence).toBe(tyAtax + tyBtax);

  const spanning = computeSalaryYTD(
    [{ ...a, sl_enabled: 1 } as never, { ...b, sl_enabled: 1 } as never],
    { year: 2025, month: 4 }, 2026, 9,
  );
  const spanningTax = -calcSalaryTaxYTD(b, { year: 2025, month: 4 }, spanning, 2026, 9);
  expect(life.incomeTaxPence).not.toBe(spanningTax);
});

// GAP YEAR: a tax year with no saved config in it contributes nothing (mirrors getSalaryYTD's
// getFirstConfigInTaxYear → null). Employed TY2024, gap in TY2025, employed again TY2026.
test('a tax year with no saved config contributes nothing (employment gap)', () => {
  const a = base(2024, 4, 3_000_000);  // TY2024 full year
  const b = base(2026, 4, 3_000_000);  // TY2026 (nothing recorded in TY2025)
  const through = { year: 2026, month: 9 };
  const life = computeLifetime([a, b], through);

  const tyA = computeSalaryYTD([{ ...a, sl_enabled: 1 } as never], { year: 2024, month: 4 }, 2025, 3);
  const tyAtax = -calcSalaryTaxYTD(a, { year: 2024, month: 4 }, tyA, 2025, 3);
  const tyB = computeSalaryYTD([{ ...b, sl_enabled: 1 } as never], { year: 2026, month: 4 }, 2026, 9);
  const tyBtax = -calcSalaryTaxYTD(b, { year: 2026, month: 4 }, tyB, 2026, 9);

  expect(life.incomeTaxPence).toBe(tyAtax + tyBtax);   // TY2025 (gap) adds nothing
  expect(life.monthsCount).toBe(12 + 6);               // TY2024 full year + TY2026 Apr–Sep; gap skipped
  expect(life.grossPence).toBe(tyA.grossYTDPence + tyB.grossYTDPence);
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
