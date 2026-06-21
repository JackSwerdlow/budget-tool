import { test, expect } from 'vitest';
import { computeStudentLoan } from './studentLoan';
import type { SalaryConfig } from './types';

const cfg = (year: number, month: number, over: Partial<SalaryConfig> = {}): SalaryConfig => ({
  year, month, gross_yearly_pence: 4_200_000, note: null,
  hours_per_week: 37, work_weeks_per_year: 52, work_days_per_week: 5,
  employee_pension_pct: 0, employer_pension_pct: 0,
  personal_allowance_pence: 1_257_000, basic_rate_band_pence: 3_770_100, additional_rate_threshold_pence: 12_514_000,
  basic_rate_pct: 20, higher_rate_pct: 40, additional_rate_pct: 45,
  ni_lower_monthly_pence: 104_750, ni_upper_monthly_pence: 418_917, ni_primary_pct: 8, ni_upper_pct: 2,
  sl_enabled: true, sl_threshold_yearly_pence: 2_847_000, sl_rate_pct: 9,
  sl_balance_pence: null, sl_interest_rate_pct: 0, bonus_pence: 0, extra_payment_pence: 0,
  ...over,
});

// payroll monthly = floor(((4_200_000 - 2_847_000) * 9/100) / 12 / 100) * 100 = 10_100 pence (£101.00)
const PAYROLL = 10_100;

test('anchor seeds the balance for that month (no interest/payment applied to it)', () => {
  const r = computeStudentLoan([cfg(2026, 4, { sl_balance_pence: 4_500_000 })], { year: 2026, month: 4 });
  expect(r.remainingBalancePence).toBe(4_500_000);
  expect(r.totalInterestPence).toBe(0);
  expect(r.totalPaidTowardBalancePence).toBe(0);
});

test('non-anchor month applies interest − payroll − extra, compounding from prior balance', () => {
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 }),
    cfg(2026, 5, { sl_interest_rate_pct: 0, extra_payment_pence: 20_000 }),
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 5 });
  // May: opening 4_500_000, interest 0, pay = 10_100 + 20_000 = 30_100 → 4_469_900
  expect(r.remainingBalancePence).toBe(4_469_900);
  expect(r.totalPaidTowardBalancePence).toBe(30_100);
});

test('interest uses 365/366 days-in-year and days-in-month, compounding month-to-month', () => {
  // May 2026 (31 days, 2026 not leap): interest = round(4_500_000 × 7.3/100 × 31/365)
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 }),
    cfg(2026, 5, { sl_interest_rate_pct: 7.3 }),
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 5 });
  const interest = Math.round(4_500_000 * 7.3 / 100 * 31 / 365);
  expect(r.totalInterestPence).toBe(interest);
  expect(r.remainingBalancePence).toBe(4_500_000 + interest - PAYROLL);
});

test('balance floors at £0 and the final payment caps at the outstanding amount', () => {
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 15_000, sl_interest_rate_pct: 0 }),
    cfg(2026, 5, { sl_interest_rate_pct: 0 }), // payroll 10_100, opening 15_000 → 4_900
    cfg(2026, 6, { sl_interest_rate_pct: 0 }), // payroll 10_100 capped to 4_900 → 0
    cfg(2026, 7, { sl_interest_rate_pct: 0 }), // already 0 → stays 0, no negative
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 7 });
  expect(r.remainingBalancePence).toBe(0);
  expect(r.totalPaidTowardBalancePence).toBe(15_000);
});

test('inherited months never re-anchor; recurrence runs through them', () => {
  const configs = [cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 })];
  const r = computeStudentLoan(configs, { year: 2026, month: 6 });
  // May: 4_500_000 − 10_100 = 4_489_900 ; June: − 10_100 = 4_479_800
  expect(r.remainingBalancePence).toBe(4_479_800);
});

test('payoff projection reaches £0 with latest rate/payment held constant', () => {
  const configs = [cfg(2026, 4, { sl_balance_pence: 30_000, sl_interest_rate_pct: 0 })];
  const r = computeStudentLoan(configs, { year: 2026, month: 4 });
  // From £300.00, paying £101/mo, 0% interest → May 199, June 98, July 0 → payoff Jul 2026
  expect(r.payoff).toEqual({ year: 2026, month: 7, remainingInterestPence: 0 });
});

test('no balance ever set → zero result, payoff null', () => {
  const r = computeStudentLoan([cfg(2026, 4)], { year: 2026, month: 6 });
  expect(r.remainingBalancePence).toBe(0);
  expect(r.payoff).toBeNull();
});
