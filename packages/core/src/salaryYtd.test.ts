import { test, expect } from 'vitest';
import { computeSalaryYTD, type YTDConfigRow } from './salaryYtd';

// Exact values from apps/api/src/app.test.ts SALARY_BODY (the real payslip config).
const JUNE_2026: YTDConfigRow = {
  year: 2026, month: 6,
  gross_yearly_pence: 5_946_600, bonus_pence: 0, employee_pension_pct: 5.45, employer_pension_pct: 28.97,
  ni_lower_monthly_pence: 104_750, ni_upper_monthly_pence: 418_917,
  ni_primary_pct: 8, ni_upper_pct: 2,
  sl_enabled: 1, sl_threshold_yearly_pence: 2_847_000, sl_rate_pct: 9,
};

// Characterization test: locks the current (payslip-validated) output of the verbatim
// math. Two values are hand-verifiable anchors that catch a botched port:
//   grossYTDPence = 5_946_600 / 12 = 495_550
//   slYTDPence    = floor(((5_946_600 - 2_847_000) * 9/100) / 12 / 100) * 100 = 23_200
test('computeSalaryYTD — June 2026 single month (payslip config)', () => {
  const out = computeSalaryYTD([JUNE_2026], { year: 2026, month: 6 }, 2026, 6);
  expect(out).toEqual({
    taxYear: 2026,
    employmentStart: { year: 2026, month: 6 },
    grossYTDPence: 495_550,
    employeePensionYTDPence: 27_008,
    adjustedNetYTDPence: 468_543,
    priorAdjNetYTDPence: 0,
    niYTDPence: 26_666,
    slYTDPence: 23_200,
    employerPensionYTDPence: 143_561,
    bonusYTDPence: 0,
  });
});

test('computeSalaryYTD — no employment start returns empty (zero) YTD', () => {
  const out = computeSalaryYTD([], null, 2026, 6);
  expect(out).toEqual({
    taxYear: 2026, employmentStart: null,
    grossYTDPence: 0, employeePensionYTDPence: 0, adjustedNetYTDPence: 0,
    priorAdjNetYTDPence: 0, niYTDPence: 0, slYTDPence: 0,
    employerPensionYTDPence: 0, bonusYTDPence: 0,
  });
});
