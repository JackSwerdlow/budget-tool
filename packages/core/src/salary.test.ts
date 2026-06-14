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
  bonus_pence: 0,
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

  it('income tax — PAYE monthly rounddown to nearest £', () => {
    // monthly taxable raw: 4_365_510 / 12 = 363_792.5 → floor to £: 363_700
    // monthly basic:  min(363_700, 314_175) × 20%          = 62_835
    // monthly higher: (363_700 − 314_175) × 40%            = 19_810
    // monthly total: 82_645 → × 12                         = 991_740
    expect(get('incomeTax').figures.yearly).toBe(-991_740);
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

  it('net pay yearly', () => {
    // 5_622_510 − 991_740 − 319_992 − 278_400 = 4_032_378
    expect(get('netPay').figures.yearly).toBe(4_032_378);
  });

  it('net monthly pence is yearly net ÷ 12 rounded', () => {
    expect(result.netMonthlyPence).toBe(Math.round(4_032_378 / 12));
  });

  it('effective tax rate row: same value in all columns', () => {
    const r = get('effectiveTaxRate');
    expect(r.isPercentage).toBe(true);
    expect(r.figures.yearly).toBeCloseTo(r.figures.monthly, 10);
    expect(r.figures.yearly).toBeCloseTo(r.figures.weekly, 10);
  });

  it('bonus row is absent when bonus_pence is 0', () => {
    expect(result.rows.find((r) => r.key === 'bonus')).toBeUndefined();
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
    // Gross £200,000: PA tapers to £0 (income > £125,140 taper end), so full gross is taxable.
    const r = calcSalary({
      ...BASE,
      gross_yearly_pence: 20_000_000,
      employee_pension_pct: 0,
      employer_pension_pct: 0,
      sl_enabled: false,
    });
    const tax = r.rows.find((row) => row.key === 'incomeTax')!.figures.yearly;
    // effectivePaY = 0 (tapered); monthly gross = 20_000_000/12 = 1_666_666.67
    // floor to £: 1_666_600; monthlyARTaxable = 12_514_000/12 = 1_042_833.33
    // monthly basic:  314_175 × 20%                              =  62_835
    // monthly higher: (1_042_833.33 − 314_175) × 40%            = 291_463.33
    // monthly addl:   (1_666_600 − 1_042_833.33) × 45%          = 280_695
    // monthly total: 634_993.33 → round 634_993 × 12            = 7_619_916
    expect(tax).toBe(-7_619_916);
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

describe('calcSalary — cumulative PAYE (mid-year employment start)', () => {
  // £42,000 gross, 5.45% pension, no SL/bonus — mirrors the demo salary config.
  const cfg42k = { ...BASE, gross_yearly_pence: 4_200_000, sl_enabled: false, bonus_pence: 0 };
  // adjustedNetY = 4_200_000 − 228_900 = 3_971_100; monthly adj = 330_925 pence (£3,309.25)
  // monthly PA = 104_750 pence (£1,047.50)

  it('November (period 8, N=1): PAYE = 0 — 8 months of PA (£8,380) > 1 month of earnings (£3,309)', () => {
    const r = calcSalary({ ...cfg42k, year: 2025, month: 11 }, { year: 2025, month: 11 });
    expect(r.rows.find((row) => row.key === 'incomeTax')!.figures.yearly).toBe(0);
    expect(r.rows.find((row) => row.key === 'incomeTax')!.figures.monthly).toBe(0);
  });

  it('January (period 10, N=3 from November): PAYE still 0 — PA runs to £10,475, earnings £9,928', () => {
    const r = calcSalary({ ...cfg42k, year: 2026, month: 1 }, { year: 2025, month: 11 });
    expect(r.rows.find((row) => row.key === 'incomeTax')!.figures.yearly).toBe(0);
  });

  it('February (period 11, N=4 from November): PAYE kicks in as earnings finally exceed accumulated PA', () => {
    const r = calcSalary({ ...cfg42k, year: 2026, month: 2 }, { year: 2025, month: 11 });
    // cum(11, 4): t = floor((4×330_925 − 11×104_750)/100)×100 = floor(171_450/100)×100 = 171_400
    // basic = 171_400 × 20% = 34_280; prior (10,3) taxable = 0
    // monthly PAYE = 34_280 pence; yearly = −411_360
    expect(r.rows.find((row) => row.key === 'incomeTax')!.figures.yearly).toBe(-411_360);
  });

  it('April new tax year (period 1, different tax year from employment start): resets to steady-state', () => {
    // Employment start Nov 2025 is in 2025/26; April 2026 is in 2026/27 → N=M=1 (steady-state)
    const r = calcSalary({ ...cfg42k, year: 2026, month: 4 }, { year: 2025, month: 11 });
    // Same as calcSalary with no employmentStart for April
    const rSteady = calcSalary({ ...cfg42k, year: 2026, month: 4 });
    expect(r.rows.find((row) => row.key === 'incomeTax')!.figures.yearly)
      .toBe(rSteady.rows.find((row) => row.key === 'incomeTax')!.figures.yearly);
  });
});

describe('calcSalary — bonus', () => {
  // £5,000 bonus on top of base salary
  const cfg = { ...BASE, bonus_pence: 500_000 };
  const result = calcSalary(cfg);
  const get = (key: string) => result.rows.find((r) => r.key === key)!;

  it('bonus row appears after employee pension', () => {
    const keys = result.rows.map((r) => r.key);
    const epIdx = keys.indexOf('employeePension');
    const bonusIdx = keys.indexOf('bonus');
    const adjIdx = keys.indexOf('adjustedNet');
    expect(bonusIdx).toBe(epIdx + 1);
    expect(bonusIdx).toBeLessThan(adjIdx);
  });

  it('bonus row yearly = 500_000', () => {
    expect(get('bonus').figures.yearly).toBe(500_000);
  });

  it('total compensation includes bonus', () => {
    // gross + bonus + employerPension = 5_946_600 + 500_000 + 1_722_730
    expect(get('totalComp').figures.yearly).toBe(8_169_330);
  });

  it('employee pension unchanged (salary only)', () => {
    expect(get('employeePension').figures.yearly).toBe(-324_090);
  });

  it('adjusted net = gross + bonus − employee pension', () => {
    // 5_946_600 + 500_000 − 324_090 = 6_122_510
    expect(get('adjustedNet').figures.yearly).toBe(6_122_510);
  });

  it('NI uses (gross + bonus) as monthly base', () => {
    // monthly gross = (5_946_600 + 500_000) / 12 = 537_216.67
    // primary: (min(537_216.67, 418_917) − 104_750) × 8% = 314_167 × 8% = 25_133.36
    // upper:   (537_216.67 − 418_917) × 2% = 118_299.67 × 2% = 2_365.99
    // monthly: 27_499.35 → × 12 = 329_992.2 → Math.round = 329_992
    expect(get('ni').figures.yearly).toBe(-329_992);
  });

  it('SLC uses (gross + bonus) against threshold', () => {
    // (5_946_600 + 500_000 − 2_847_000) × 9% / 12 = 3_599_600 × 0.09 / 12 = 26_997
    // ROUNDDOWN to whole £: Math.floor(26_997 / 100) × 100 = 26_900
    // annual: 26_900 × 12 = 322_800
    expect(get('sl').figures.yearly).toBe(-322_800);
  });
});
