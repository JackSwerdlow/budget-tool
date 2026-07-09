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

test('the anchor month applies its own interest/payroll deduction, same as any month', () => {
  const r = computeStudentLoan([cfg(2026, 4, { sl_balance_pence: 4_500_000 })], { year: 2026, month: 4 });
  // Entered balance is pre-payment for that month: opening 4_500_000, interest 0, pay 10_100 → 4_489_900
  expect(r.remainingBalancePence).toBe(4_489_900);
  expect(r.totalInterestPence).toBe(0);
  expect(r.totalPaidTowardBalancePence).toBe(PAYROLL);
});

test('non-anchor month applies interest − payroll − extra, compounding from prior balance', () => {
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 }),
    cfg(2026, 5, { sl_interest_rate_pct: 0, extra_payment_pence: 20_000 }),
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 5 });
  // April (anchor): 4_500_000 − 10_100 = 4_489_900
  // May: opening 4_489_900, interest 0, pay = 10_100 + 20_000 = 30_100 → 4_459_800
  expect(r.remainingBalancePence).toBe(4_459_800);
  expect(r.totalPaidTowardBalancePence).toBe(PAYROLL + 30_100);
});

test('interest uses 365/366 days-in-year and days-in-month, compounding month-to-month', () => {
  // April (anchor): 4_500_000 − 10_100 = 4_489_900
  // May 2026 (31 days, 2026 not leap): interest = round(4_489_900 × 7.3/100 × 31/365)
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 }),
    cfg(2026, 5, { sl_interest_rate_pct: 7.3 }),
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 5 });
  const balanceAfterApril = 4_500_000 - PAYROLL;
  const interest = Math.round(balanceAfterApril * 7.3 / 100 * 31 / 365);
  expect(r.totalInterestPence).toBe(interest);
  expect(r.remainingBalancePence).toBe(balanceAfterApril + interest - PAYROLL);
});

test('balance floors at £0 and the final payment caps at the outstanding amount', () => {
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 15_000, sl_interest_rate_pct: 0 }), // anchor pays too: 15_000 → 4_900
    cfg(2026, 5, { sl_interest_rate_pct: 0 }), // payroll 10_100 capped to 4_900 → 0
    cfg(2026, 6, { sl_interest_rate_pct: 0 }), // already 0 → stays 0, no negative
    cfg(2026, 7, { sl_interest_rate_pct: 0 }), // already 0 → stays 0, no negative
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 7 });
  expect(r.remainingBalancePence).toBe(0);
  expect(r.totalPaidTowardBalancePence).toBe(15_000);
  // Paid off during the recorded window → payoff is the real zero-crossing month (May), not `through`.
  expect(r.payoff).toEqual({ year: 2026, month: 5, remainingInterestPence: 0 });
});

test('a re-anchor after payoff opens a new loan; payoff reflects the current balance', () => {
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 5_000, sl_interest_rate_pct: 0 }),   // tiny loan, paid off by its own anchor payment
    cfg(2026, 6, { sl_balance_pence: 30_000, sl_interest_rate_pct: 0 }),  // new loan terms in June
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 6 });
  // June's own anchor payment already applies: 30_000 − 10_100 = 19_900.
  expect(r.remainingBalancePence).toBe(19_900);
  // Forward projection of the £199 remainder at £101/mo: Jul 98, Aug 0.
  expect(r.payoff).toEqual({ year: 2026, month: 8, remainingInterestPence: 0 });
});

test('positive balance but no payroll repayment (SL disabled) → payoff null', () => {
  const configs = [cfg(2026, 4, { sl_balance_pence: 30_000, sl_enabled: false, sl_interest_rate_pct: 0 })];
  const r = computeStudentLoan(configs, { year: 2026, month: 4 });
  expect(r.remainingBalancePence).toBe(30_000);
  expect(r.payoff).toBeNull();
});

test('inherited months never re-anchor; recurrence runs through them', () => {
  const configs = [cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 })];
  const r = computeStudentLoan(configs, { year: 2026, month: 6 });
  // April (anchor): 4_500_000 − 10_100 = 4_489_900 ; May: − 10_100 = 4_479_800 ; June: − 10_100 = 4_469_700
  expect(r.remainingBalancePence).toBe(4_469_700);
});

test('payoff projection reaches £0 with latest rate/payment held constant', () => {
  const configs = [cfg(2026, 4, { sl_balance_pence: 30_000, sl_interest_rate_pct: 0 })];
  const r = computeStudentLoan(configs, { year: 2026, month: 4 });
  // April's own anchor payment applies first: 30_000 − 10_100 = 19_900.
  // From £199.00, paying £101/mo, 0% interest → May 98, June 0 → payoff Jun 2026
  expect(r.payoff).toEqual({ year: 2026, month: 6, remainingInterestPence: 0 });
});

test('no balance ever set → zero result, payoff null', () => {
  const r = computeStudentLoan([cfg(2026, 4)], { year: 2026, month: 6 });
  expect(r.remainingBalancePence).toBe(0);
  expect(r.payoff).toBeNull();
});

// ── Variable interest rate (VIR) ─────────────────────────────────────────────
// gov.uk Plan 2 example thresholds: lower £29,385, upper £52,885; RPI-only 3.2%, max 6.2%.
const VIR = {
  sl_interest_rate_pct: 3.2,
  sl_vir_enabled: true,
  sl_vir_max_rate_pct: 6.2,
  sl_vir_lower_income_pence: 2_938_500,
  sl_vir_upper_income_pence: 5_288_500,
};
// Full-year income £42,000 → rate = 3.2 + 3 × (42000 − 29385)/(52885 − 29385)
const VIR_RATE_42K = 3.2 + 3 * (4_200_000 - 2_938_500) / (5_288_500 - 2_938_500);

test('VIR scales the rate with the tax year income (gov.uk linear formula)', () => {
  const r = computeStudentLoan([cfg(2026, 4, { ...VIR, sl_balance_pence: 4_500_000 })], { year: 2026, month: 5 });
  const iApr = Math.round(4_500_000 * VIR_RATE_42K / 100 * 30 / 365);
  const b1 = 4_500_000 + iApr - PAYROLL;
  const iMay = Math.round(b1 * VIR_RATE_42K / 100 * 31 / 365);
  expect(r.totalInterestPence).toBe(iApr + iMay);
  expect(r.remainingBalancePence).toBe(b1 + iMay - PAYROLL);
});

test('VIR clamps: income below the lower threshold charges the minimum rate, above the upper the max', () => {
  const below = computeStudentLoan(
    [cfg(2026, 4, { ...VIR, sl_vir_lower_income_pence: 9_000_000, sl_vir_upper_income_pence: 9_900_000, sl_balance_pence: 4_500_000 })],
    { year: 2026, month: 4 },
  );
  expect(below.totalInterestPence).toBe(Math.round(4_500_000 * 3.2 / 100 * 30 / 365));

  const above = computeStudentLoan(
    [cfg(2026, 4, { ...VIR, sl_vir_lower_income_pence: 100_000, sl_vir_upper_income_pence: 200_000, sl_balance_pence: 4_500_000 })],
    { year: 2026, month: 4 },
  );
  expect(above.totalInterestPence).toBe(Math.round(4_500_000 * 6.2 / 100 * 30 / 365));
});

test('VIR part-year start: the first (short) tax year uses actual income, not annualised', () => {
  // First config Jan 2026 → tax year 2025 income is 3 months (£10,500, below the lower
  // threshold → minimum rate); from April 2026 the full £42,000 sets the scaled rate.
  const r = computeStudentLoan([cfg(2026, 1, { ...VIR, sl_balance_pence: 4_500_000 })], { year: 2026, month: 4 });
  let bal = 4_500_000;
  let interest = 0;
  for (const [m, days] of [[1, 31], [2, 28], [3, 31]]) {
    void m;
    const i = Math.round(bal * 3.2 / 100 * days / 365);
    bal += i - PAYROLL;
    interest += i;
  }
  const iApr = Math.round(bal * VIR_RATE_42K / 100 * 30 / 365);
  expect(r.totalInterestPence).toBe(interest + iApr);
  expect(r.remainingBalancePence).toBe(bal + iApr - PAYROLL);
});

test('VIR counts a later-saved raise into the whole tax year income, even before the raise month', () => {
  // £42k Apr–Sep + £84k Oct–Mar → tax-year income £63,000, above the upper threshold → max
  // rate already applies in April/May (the year is trued up as one income figure).
  const configs = [
    cfg(2026, 4, { ...VIR, sl_balance_pence: 4_500_000 }),
    cfg(2026, 10, { ...VIR, gross_yearly_pence: 8_400_000 }),
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 4 });
  expect(r.totalInterestPence).toBe(Math.round(4_500_000 * 6.2 / 100 * 30 / 365));
});

test('VIR degenerate params fall back to the flat rate', () => {
  const r = computeStudentLoan(
    [cfg(2026, 4, { ...VIR, sl_vir_upper_income_pence: 2_938_500, sl_balance_pence: 4_500_000 })],
    { year: 2026, month: 4 },
  );
  expect(r.totalInterestPence).toBe(Math.round(4_500_000 * 3.2 / 100 * 30 / 365));
});

test('VIR payoff projection holds the forward rate from a full year at the latest salary', () => {
  const flat = computeStudentLoan(
    [cfg(2026, 4, { sl_interest_rate_pct: 3.2, sl_balance_pence: 1_000_000 })],
    { year: 2026, month: 4 },
  );
  const vir = computeStudentLoan(
    [cfg(2026, 4, { ...VIR, sl_vir_lower_income_pence: 100_000, sl_vir_upper_income_pence: 200_000, sl_balance_pence: 1_000_000 })],
    { year: 2026, month: 4 },
  );
  // Same balance and payroll, but the VIR run accrues at 6.2% vs 3.2% → more interest to clear.
  expect(flat.payoff).not.toBeNull();
  expect(vir.payoff).not.toBeNull();
  expect(vir.payoff!.remainingInterestPence).toBeGreaterThan(flat.payoff!.remainingInterestPence);
});

// EMPLOYMENT GAP: a £0-gross month earns nothing, so no payroll repayment is deducted — but
// daily-apportioned interest keeps accruing on the balance (statutory Plan 2 behaviour).
test('during an employment gap (£0 gross) interest accrues but no payroll repayment is made', () => {
  const configs = [
    cfg(2026, 4, { sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 }), // anchor while employed
    cfg(2026, 5, { gross_yearly_pence: 0, sl_interest_rate_pct: 7.3 }),     // not employed from May
  ];
  const r = computeStudentLoan(configs, { year: 2026, month: 5 });
  const afterApril = 4_500_000 - PAYROLL;               // April (employed) still repays
  const interest = Math.round(afterApril * 7.3 / 100 * 31 / 365);
  expect(r.totalInterestPence).toBe(interest);
  expect(r.remainingBalancePence).toBe(afterApril + interest); // May: +interest, no repayment
  expect(r.totalPaidTowardBalancePence).toBe(PAYROLL);         // only April's payment
});

// A balance can be anchored on a not-employed month (e.g. going back to record a starting
// balance during a period with no salary).
test('a balance anchor can be set on a £0-gross (not-employed) month', () => {
  const r = computeStudentLoan(
    [cfg(2026, 4, { gross_yearly_pence: 0, sl_balance_pence: 4_500_000, sl_interest_rate_pct: 0 })],
    { year: 2026, month: 4 },
  );
  expect(r.remainingBalancePence).toBe(4_500_000); // no interest, no repayment
  expect(r.totalPaidTowardBalancePence).toBe(0);
});
