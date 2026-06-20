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
