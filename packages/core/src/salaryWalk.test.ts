import { test, expect } from 'vitest';
import { resolveEmploymentStart, walkMonths } from './salaryWalk';
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

// resolveEmploymentStart — the anchor rule for cumulative-PAYE accumulation.
// taxYear(y,m) = m >= 4 ? y : y - 1. Continuous employment: a salary inherited into a later
// tax year anchors that year at its April; the genuine first employed year keeps its real
// mid-year start; months before the first-ever config are blank.
test('resolveEmploymentStart — no configs anywhere → null', () => {
  expect(resolveEmploymentStart([], 2027, 6)).toBeNull();
});

test('resolveEmploymentStart — before the first-ever config → null (pre-employment blank)', () => {
  const configs = [cfg(2026, 6, 5_028_200)];
  expect(resolveEmploymentStart(configs, 2026, 3)).toBeNull(); // earlier same TY, still pre-first
  expect(resolveEmploymentStart(configs, 2025, 11)).toBeNull(); // earlier TY
});

test('resolveEmploymentStart — genuine first tax year keeps its real mid-year start', () => {
  const configs = [cfg(2025, 11, 4_200_000)]; // first employed Nov 2025 (TY 2025/26)
  expect(resolveEmploymentStart(configs, 2025, 11)).toEqual({ year: 2025, month: 11 });
  expect(resolveEmploymentStart(configs, 2026, 1)).toEqual({ year: 2025, month: 11 });
});

test('resolveEmploymentStart — a later tax year anchors at that year\'s April (continuous)', () => {
  const configs = [cfg(2026, 6, 5_028_200)]; // saved June 2026 (TY 2026/27)
  // Viewing any month in TY 2027/28 (a later year, nothing saved there) anchors April 2027.
  expect(resolveEmploymentStart(configs, 2027, 4)).toEqual({ year: 2027, month: 4 });
  expect(resolveEmploymentStart(configs, 2027, 9)).toEqual({ year: 2027, month: 4 });
  expect(resolveEmploymentStart(configs, 2028, 3)).toEqual({ year: 2027, month: 4 }); // March 2028 is TY 2027/28
});

test('resolveEmploymentStart — a future mid-year raise still anchors that year at April', () => {
  const configs = [cfg(2026, 6, 5_028_200), cfg(2027, 9, 6_000_000)]; // raise in Sept 2027
  // Viewing Nov 2027: anchor is April 2027, not the September raise month.
  expect(resolveEmploymentStart(configs, 2027, 11)).toEqual({ year: 2027, month: 4 });
});
