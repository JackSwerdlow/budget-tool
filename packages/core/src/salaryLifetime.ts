import type { LifetimeTotals, SalaryConfig, SalaryView } from './types.ts';
import { calcSalary } from './salary.ts';
import { computeSalaryYTD, type YTDConfigRow } from './salaryYtd.ts';
import { resolveEmploymentStart } from './salaryWalk.ts';

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
  niPence: 0, studentLoanPaidPence: 0, untaxedIncomePence: 0, netTakeHomePence: 0,
  employerPensionPence: 0, pensionPotPence: 0,
};

function findCell(view: SalaryView, key: string) {
  const walk = (ls: SalaryView['breakdown']): SalaryView['breakdown'][number] | undefined => {
    for (const l of ls) { if (l.key === key) return l; const c = l.children && walk(l.children); if (c) return c; }
  };
  return walk(view.breakdown);
}

// Cumulative figures first→through. Sums per-tax-year cumulative slices (each via the validated
// computeSalaryYTD + calcSalary YTD column) so PAYE resets every April. Every tax year from the
// first config through `through` is counted: a year with no saved config is FILLED with the
// brought-forward (inherited) salary, anchored at that year's April (continuous employment) —
// a rough/cheap forecast that mirrors what saving the inherited config in each month would show,
// and keeps Lifetime consistent with the Summary forecast and the student-loan tracker.
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
  const allRows = sorted.map(toYtdRow);

  for (let ty = firstTY; ty <= throughTY; ty++) {
    // slice end: full year (March) for a completed TY, else `through`.
    const end = ty < throughTY ? { year: ty + 1, month: 3 } : through;
    // slice start: the continuous-employment anchor for this tax year (first employed year keeps
    // its real start; later years anchor at April). Non-null since `end` is at/after the first config.
    const start = resolveEmploymentStart(sorted, end.year, end.month);
    if (!start || idx(start.year, start.month) > idx(end.year, end.month)) continue;

    const ytd = computeSalaryYTD(allRows, start, end.year, end.month);
    // latest saved config at or before `end` drives this slice's bands/display.
    let lastCfg = sorted[0];
    for (const c of sorted) { if (idx(c.year, c.month) <= idx(end.year, end.month)) lastCfg = c; }
    const view = calcSalary({ ...lastCfg, year: end.year, month: end.month }, start, {
      adjustedNetYTDPence: ytd.adjustedNetYTDPence, priorAdjNetYTDPence: ytd.priorAdjNetYTDPence,
      grossYTDPence: ytd.grossYTDPence, employeePensionYTDPence: ytd.employeePensionYTDPence,
      employerPensionYTDPence: ytd.employerPensionYTDPence,
      niYTDPence: ytd.niYTDPence, slYTDPence: ytd.slYTDPence,
    }).view;

    const ytdOf = (k: string) => findCell(view, k)?.cell.ytd ?? 0;
    // Months actually EARNED this TY: a month whose resolved config has £0 gross is an
    // employment gap (see SALARY.md) — it contributes zeros above and shouldn't count here.
    let months = 0;
    for (let i = idx(start.year, start.month); i <= idx(end.year, end.month); i++) {
      let resolved = sorted[0];
      for (const c of sorted) { if (idx(c.year, c.month) <= i) resolved = c; else break; }
      if (resolved.gross_yearly_pence > 0) months += 1;
    }

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
  // One-off untaxed income (gifts etc.) applies only in explicitly saved months — every element
  // of `configs` IS an explicit row, so sum them directly (the YTD walk never sees one-offs).
  for (const c of sorted) {
    if (idx(c.year, c.month) > idx(through.year, through.month)) break;
    out.untaxedIncomePence += Math.max(0, c.untaxed_income_pence ?? 0);
  }
  out.netTakeHomePence += out.untaxedIncomePence;
  return out;
}
