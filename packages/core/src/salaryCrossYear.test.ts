import { describe, expect, it } from 'vitest';
import { calcSalary } from './salary';
import { computeSalaryYTD, type YTDConfigRow } from './salaryYtd';
import { resolveEmploymentStart } from './salaryWalk';
import type { SalaryConfig } from './types';

/*
 * Cross-tax-year inheritance (the continuous-employment fix).
 *
 * Bug: with the latest saved config in TY 2026/27 (June 2026) and nothing saved in TY 2027/28,
 * every month from April 2027 was computed as a brand-new starter — YTD never accumulated, so
 * PAYE decayed to £0 and net pay drifted up. The fix anchors a later tax year at its April and
 * resolves the inherited salary for every month from that anchor.
 *
 * Pins are derived FROM the engine (it is the payslip-validated ground truth); we assert the
 * shape the fix guarantees — steady, non-decaying PAYE and a strictly accumulating YTD — not
 * hand-transcribed magic numbers.
 */

// Jack's TY 2026/27 salary: £50,282 base + £918,396 DDaT allowance (as bonus), payslip params.
const JACK_TY26: SalaryConfig = {
  year: 2026, month: 6,
  gross_yearly_pence: 5_028_200,
  bonus_pence: 918_396,
  note: null,
  hours_per_week: 37, work_weeks_per_year: 52, work_days_per_week: 5,
  employee_pension_pct: 5.45, employer_pension_pct: 28.97,
  personal_allowance_pence: 1_257_912, basic_rate_band_pence: 3_770_000,
  additional_rate_threshold_pence: 12_514_000,
  basic_rate_pct: 20, higher_rate_pct: 40, additional_rate_pct: 45,
  ni_lower_monthly_pence: 104_800, ni_upper_monthly_pence: 418_900,
  ni_primary_pct: 8, ni_upper_pct: 2,
  sl_enabled: true, sl_threshold_yearly_pence: 2_938_500, sl_rate_pct: 9,
  sl_balance_pence: null, sl_interest_rate_pct: null,
};

const toRow = (c: SalaryConfig): YTDConfigRow => ({
  year: c.year, month: c.month, gross_yearly_pence: c.gross_yearly_pence,
  bonus_pence: c.bonus_pence ?? 0, employee_pension_pct: c.employee_pension_pct,
  employer_pension_pct: c.employer_pension_pct,
  ni_lower_monthly_pence: c.ni_lower_monthly_pence, ni_upper_monthly_pence: c.ni_upper_monthly_pence,
  ni_primary_pct: c.ni_primary_pct, ni_upper_pct: c.ni_upper_pct,
  sl_enabled: c.sl_enabled ? 1 : 0, sl_threshold_yearly_pence: c.sl_threshold_yearly_pence,
  sl_rate_pct: c.sl_rate_pct,
});

// The Summary path for a viewed month, resolving the inherited salary as continuous employment.
function viewMonth(configs: SalaryConfig[], year: number, month: number) {
  const start = resolveEmploymentStart(configs, year, month);
  const ytd = computeSalaryYTD(configs.map(toRow), start, year, month);
  // Latest saved config at or before the viewed month drives the displayed parameters.
  const idx = (y: number, m: number) => y * 12 + (m - 1);
  let cfg = configs[0];
  for (const c of configs) if (idx(c.year, c.month) <= idx(year, month)) cfg = c;
  const bd = calcSalary({ ...cfg, year, month }, start ?? { year, month }, {
    adjustedNetYTDPence: ytd.adjustedNetYTDPence, priorAdjNetYTDPence: ytd.priorAdjNetYTDPence,
    grossYTDPence: ytd.grossYTDPence, employeePensionYTDPence: ytd.employeePensionYTDPence,
    employerPensionYTDPence: ytd.employerPensionYTDPence,
    niYTDPence: ytd.niYTDPence, slYTDPence: ytd.slYTDPence,
  });
  const paye = bd.rows.find((r) => r.key === 'incomeTax')!.figures.monthly;
  return { paye, ytdAdjNet: ytd.adjustedNetYTDPence };
}

describe('cross-tax-year: an inherited salary viewed in a later tax year', () => {
  const configs = [JACK_TY26]; // only June 2026 saved
  // Every month of TY 2027/28, in order: Apr 2027 … Mar 2028.
  const months: Array<{ year: number; month: number; label: string }> = [
    ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({ year: 2027, month: m, label: `2027-${m}` })),
    ...[1, 2, 3].map((m) => ({ year: 2028, month: m, label: `2028-${m}` })),
  ];

  it('PAYE is steady (within £1 of period 1) and never decays to £0', () => {
    const rows = months.map((mm) => viewMonth(configs, mm.year, mm.month));
    const april = rows[0].paye;
    expect(april).toBeLessThan(0); // a real deduction, not £0
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].paye, `${months[i].label} PAYE`).not.toBe(0);
      expect(Math.abs(rows[i].paye - april), `${months[i].label} drift`).toBeLessThanOrEqual(100);
    }
  });

  it('YTD adjusted net accumulates month over month (the walk no longer resets each month)', () => {
    let prev = 0;
    for (const mm of months) {
      const { ytdAdjNet } = viewMonth(configs, mm.year, mm.month);
      expect(ytdAdjNet, `${mm.label} YTD`).toBeGreaterThan(prev);
      prev = ytdAdjNet;
    }
  });
});

describe('cross-tax-year: a future mid-year raise anchors April, applying from the raise month', () => {
  const raise: SalaryConfig = { ...JACK_TY26, year: 2027, month: 9, gross_yearly_pence: 6_000_000 };
  const configs = [JACK_TY26, raise]; // June 2026 + a Sept 2027 raise

  it('viewing November 2027 accumulates from April 2027, with the raise applying in September', () => {
    const start = resolveEmploymentStart(configs, 2027, 11);
    expect(start).toEqual({ year: 2027, month: 4 });

    const ytdNov = computeSalaryYTD(configs.map(toRow), start, 2027, 11);
    // Apr–Aug at the old salary, Sep–Nov at the raised salary → strictly more than 8 months at
    // the old rate alone (proves the raise lifts the back half of the year).
    const eightOld = computeSalaryYTD([toRow(JACK_TY26)], { year: 2027, month: 4 }, 2027, 11).adjustedNetYTDPence;
    expect(ytdNov.adjustedNetYTDPence).toBeGreaterThan(eightOld);
  });
});
