import type { LifetimeTotals, SalaryConfig, SalaryView } from './types.js';
import { calcSalary } from './salary.js';
import { computeSalaryYTD, type YTDConfigRow } from './salaryYtd.js';

const idx = (y: number, m: number) => y * 12 + (m - 1);
const taxYearOf = (y: number, m: number) => (m >= 4 ? y : y - 1);
const toYtdRow = (c: SalaryConfig): YTDConfigRow => ({
  year: c.year, month: c.month, gross_yearly_pence: c.gross_yearly_pence,
  bonus_pence: c.bonus_pence ?? 0, employee_pension_pct: c.employee_pension_pct,
  employer_pension_pct: c.employer_pension_pct,
  ni_lower_monthly_pence: c.ni_lower_monthly_pence, ni_upper_monthly_pence: c.ni_upper_monthly_pence,
  ni_primary_pct: c.ni_primary_pct, ni_upper_pct: c.ni_upper_pct,
  sl_enabled: c.sl_enabled ? 1 : 0, sl_threshold_yearly_pence: c.sl_threshold_yearly_pence,
  sl_rate_pct: c.sl_rate_pct,
});

const zero: LifetimeTotals = {
  monthsCount: 0, grossPence: 0, basePayPence: 0, bonusPence: 0, employeePensionPence: 0,
  incomeTaxPence: 0, allowanceUsedPence: 0, basicPence: 0, higherPence: 0, additionalPence: 0,
  niPence: 0, studentLoanPaidPence: 0, netTakeHomePence: 0, employerPensionPence: 0, pensionPotPence: 0,
};

function findCell(view: SalaryView, key: string) {
  const walk = (ls: SalaryView['breakdown']): SalaryView['breakdown'][number] | undefined => {
    for (const l of ls) { if (l.key === key) return l; const c = l.children && walk(l.children); if (c) return c; }
  };
  return walk(view.breakdown);
}

// Cumulative actuals first→through. Sums per-tax-year cumulative slices (each via the
// validated computeSalaryYTD + calcSalary YTD column) so PAYE resets every April. Months in a
// tax year with no saved config in that tax year contribute nothing (mirrors getSalaryYTD's
// getFirstConfigInTaxYear contract).
export function computeLifetime(
  configs: SalaryConfig[],
  through: { year: number; month: number },
): LifetimeTotals {
  if (configs.length === 0) return { ...zero };
  const sorted = [...configs].sort((a, b) => idx(a.year, a.month) - idx(b.year, b.month));
  if (idx(through.year, through.month) < idx(sorted[0].year, sorted[0].month)) return { ...zero };

  const firstTY = taxYearOf(sorted[0].year, sorted[0].month);
  const throughTY = taxYearOf(through.year, through.month);
  const out: LifetimeTotals = { ...zero };

  for (let ty = firstTY; ty <= throughTY; ty++) {
    const inTY = sorted.filter((c) => taxYearOf(c.year, c.month) === ty);
    if (inTY.length === 0) continue;
    const start = { year: inTY[0].year, month: inTY[0].month };
    // slice end: full year (March) for a completed TY, else `through`.
    const end = ty < throughTY ? { year: ty + 1, month: 3 } : through;
    if (idx(start.year, start.month) > idx(end.year, end.month)) continue;

    const ytd = computeSalaryYTD(inTY.map(toYtdRow), start, end.year, end.month);
    // last saved config at or before `end` (drives this TY's bands)
    let lastCfg = inTY[0];
    for (const c of inTY) { if (idx(c.year, c.month) <= idx(end.year, end.month)) lastCfg = c; }
    const view = calcSalary({ ...lastCfg, year: end.year, month: end.month }, start, {
      adjustedNetYTDPence: ytd.adjustedNetYTDPence, priorAdjNetYTDPence: ytd.priorAdjNetYTDPence,
      grossYTDPence: ytd.grossYTDPence, employeePensionYTDPence: ytd.employeePensionYTDPence,
      employerPensionYTDPence: ytd.employerPensionYTDPence,
      niYTDPence: ytd.niYTDPence, slYTDPence: ytd.slYTDPence,
    }).view;

    const ytdOf = (k: string) => findCell(view, k)?.cell.ytd ?? 0;
    // months actually counted this TY:
    const months = idx(end.year, end.month) - idx(start.year, start.month) + 1;

    out.monthsCount          += months;
    out.grossPence           += ytd.grossYTDPence;
    out.bonusPence           += ytd.bonusYTDPence;
    out.basePayPence         += ytd.grossYTDPence - ytd.bonusYTDPence;
    out.employeePensionPence += ytd.employeePensionYTDPence;
    out.employerPensionPence += ytd.employerPensionYTDPence;
    out.pensionPotPence      += ytd.employeePensionYTDPence + ytd.employerPensionYTDPence;
    out.niPence              += ytd.niYTDPence;
    out.studentLoanPaidPence += ytd.slYTDPence;
    out.incomeTaxPence       += -ytdOf('incomeTax');
    out.basicPence           += -ytdOf('taxBasic');
    out.higherPence          += -ytdOf('taxHigher');
    out.additionalPence      += -ytdOf('taxAddl');
    out.allowanceUsedPence   += ytdOf('allowanceUsed');
    out.netTakeHomePence     += ytdOf('netIncome');
  }
  return out;
}
