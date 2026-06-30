import { describe, expect, it } from 'vitest';
import { calcSalary, type SalaryConfig } from '@budget/core';
import { previewYtd } from './salaryState';

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
    const ytd = previewYtd([savedApril], editedApril, { year: 2026, month: 4 });
    expect(ytd.adjustedNetYTDPence).toBe(422_770); // £4,227.70, not the stale £4,685.43
  });

  it('composed monthly PAYE and net match the April payslip (£643.26 / £3,152.67)', () => {
    const ytd = previewYtd([savedApril], editedApril, { year: 2026, month: 4 });
    const r = calcSalary(editedApril, { year: 2026, month: 4 }, ytd);
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.monthly).toBe(-64_326);
    expect(r.netMonthlyPence).toBe(315_267);
  });
});
