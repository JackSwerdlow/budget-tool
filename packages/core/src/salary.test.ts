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
