import { describe, expect, it } from 'vitest';
import { calcSalary, type SalaryConfig } from '@budget/core';
import { EMPTY_CONFIG_FIELDS, previewYtd } from './salaryState';

describe('EMPTY_CONFIG_FIELDS — statutory defaults match payslip-validated TY 2026/27 values', () => {
  // A first-ever month pre-fills these; wrong defaults silently produce wrong figures.
  it('income-tax parameters', () => {
    expect(EMPTY_CONFIG_FIELDS.personal_allowance_pence).toBe('12579.12'); // divides evenly ÷12
    expect(EMPTY_CONFIG_FIELDS.basic_rate_band_pence).toBe('37700.00');
    expect(EMPTY_CONFIG_FIELDS.additional_rate_threshold_pence).toBe('125140.00');
    expect(EMPTY_CONFIG_FIELDS.basic_rate_pct).toBe('20');
    expect(EMPTY_CONFIG_FIELDS.higher_rate_pct).toBe('40');
    expect(EMPTY_CONFIG_FIELDS.additional_rate_pct).toBe('45');
  });
  it('NI thresholds & rates', () => {
    expect(EMPTY_CONFIG_FIELDS.ni_lower_monthly_pence).toBe('1048.00'); // primary threshold, not 1480
    expect(EMPTY_CONFIG_FIELDS.ni_upper_monthly_pence).toBe('4189.00');
    expect(EMPTY_CONFIG_FIELDS.ni_primary_pct).toBe('8');
    expect(EMPTY_CONFIG_FIELDS.ni_upper_pct).toBe('2');
  });
  it('student-loan parameters', () => {
    expect(EMPTY_CONFIG_FIELDS.sl_threshold_yearly_pence).toBe('29385.00');
    expect(EMPTY_CONFIG_FIELDS.sl_rate_pct).toBe('9');
  });
});

// Regression: editing the current month's config must recompute the YTD the cumulative
// PAYE method differences against. Before the fix, the preview used the server YTD (built
// from the *persisted* config) while the breakdown used the edited config — so the monthly
// income tax was computed against the old salary. See April 2026 below.
const base: SalaryConfig = {
  year: 2026, month: 4, gross_yearly_pence: 0, note: null,
  hours_per_week: 37, work_weeks_per_year: 52, work_days_per_week: 5,
  employee_pension_pct: 5.45, employer_pension_pct: 28.97,
  personal_allowance_pence: 1_257_912, basic_rate_band_pence: 3_770_000,
  additional_rate_threshold_pence: 12_514_000,
  basic_rate_pct: 20, higher_rate_pct: 40, additional_rate_pct: 45,
  ni_lower_monthly_pence: 104_800, ni_upper_monthly_pence: 418_900,
  ni_primary_pct: 8, ni_upper_pct: 2,
  sl_enabled: true, sl_threshold_yearly_pence: 2_938_500, sl_rate_pct: 9,
  sl_balance_pence: null, sl_interest_rate_pct: null, bonus_pence: 0,
};

describe('previewYtd — live YTD reflects the edited current-month config', () => {
  // Saved April is the old £59,466 demo seed; the user edits April to £40,965 + £12,000 bonus.
  const savedApril: SalaryConfig = {
    ...base, gross_yearly_pence: 5_946_600, bonus_pence: 0,
    personal_allowance_pence: 1_257_000, basic_rate_band_pence: 3_770_100,
    ni_lower_monthly_pence: 104_750, ni_upper_monthly_pence: 418_917,
    sl_threshold_yearly_pence: 2_847_000,
  };
  const editedApril: SalaryConfig = { ...base, gross_yearly_pence: 4_096_500, bonus_pence: 1_200_000 };

  it('YTD adjusted net reflects the edited config, not the saved one', () => {
    const ytd = previewYtd([savedApril], editedApril);
    expect(ytd.adjustedNetYTDPence).toBe(422_770); // £4,227.70, not the stale £4,685.43
  });

  it('composed monthly PAYE and net match the April payslip (£643.26 / £3,152.67)', () => {
    const ytd = previewYtd([savedApril], editedApril);
    const r = calcSalary(editedApril, { year: 2026, month: 4 }, ytd);
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.monthly).toBe(-64_326);
    expect(r.netMonthlyPence).toBe(315_267);
  });
});

// Continuous employment: a salary saved in one tax year, viewed in a later year with nothing
// saved there, must accumulate from that year's April — not collapse to a single month (which
// decayed PAYE to £0). The preview includes the inherited prior-year config as the seed.
describe('previewYtd — inherited salary viewed in a later tax year accumulates', () => {
  const june2026: SalaryConfig = {
    ...base, year: 2026, month: 6, gross_yearly_pence: 5_028_200, bonus_pence: 918_396,
  };
  const sept2027: SalaryConfig = { ...june2026, year: 2027, month: 9 }; // inherited, shown at Sep 2027

  it('YTD adjusted net is ~6 months (Apr–Sep 2027), not a single month', () => {
    const oneMonth = previewYtd([june2026], june2026).adjustedNetYTDPence; // June 2026 alone
    const ytd = previewYtd([june2026], sept2027);
    expect(ytd.adjustedNetYTDPence).toBeGreaterThan(oneMonth * 5);
  });
});
