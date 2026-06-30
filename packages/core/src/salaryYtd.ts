import type { SalaryYTD } from './types.ts';

// Per-month config rows for a tax year, ordered ascending by (year, month). Mirrors the
// columns selected by the salary-YTD query.
export type YTDConfigRow = {
  year: number;
  month: number;
  gross_yearly_pence: number;
  bonus_pence: number;
  employee_pension_pct: number;
  employer_pension_pct: number;
  ni_lower_monthly_pence: number;
  ni_upper_monthly_pence: number;
  ni_primary_pct: number;
  ni_upper_pct: number;
  sl_enabled: number;
  sl_threshold_yearly_pence: number;
  sl_rate_pct: number;
};

// Cumulative year-to-date salary figures. Lifted VERBATIM from the API repo's getSalaryYTD
// (the payslip-validated inline math); only the two DB queries are hoisted out as params
// (taxYearConfigs + employmentStart) so this stays a pure function reusable by any adapter.
// Do NOT rewire to calcSalary — the inline math here is the validated source of truth.
export function computeSalaryYTD(
  taxYearConfigs: YTDConfigRow[],
  employmentStart: { year: number; month: number } | null,
  year: number,
  month: number,
): SalaryYTD {
  const ty = month >= 4 ? year : year - 1;

  const empty: SalaryYTD = {
    taxYear: ty, employmentStart: null,
    grossYTDPence: 0, employeePensionYTDPence: 0, adjustedNetYTDPence: 0,
    priorAdjNetYTDPence: 0, niYTDPence: 0, slYTDPence: 0,
    employerPensionYTDPence: 0, bonusYTDPence: 0,
  };
  if (!employmentStart) return empty;

  let grossYTD = 0, pensionYTD = 0, adjNetYTD = 0, priorAdjNetYTD = 0, niYTD = 0, slYTD = 0, empPenYTD = 0, bonusYTD = 0;

  let cur = { year: employmentStart.year, month: employmentStart.month };
  while (cur.year < year || (cur.year === year && cur.month <= month)) {
    // Last config in the tax year at or before this month (employmentStart guarantees one exists).
    let cfg: YTDConfigRow | undefined;
    for (let i = taxYearConfigs.length - 1; i >= 0; i--) {
      const c = taxYearConfigs[i];
      if (c.year < cur.year || (c.year === cur.year && c.month <= cur.month)) { cfg = c; break; }
    }

    if (cfg) {
      const grossY    = cfg.gross_yearly_pence;
      const bonusY    = cfg.bonus_pence ?? 0;
      const pensionY  = Math.round(grossY * cfg.employee_pension_pct / 100);
      const empPenY   = Math.round(grossY * cfg.employer_pension_pct / 100);
      const adjNetY   = grossY + bonusY - pensionY;
      const mGross    = (grossY + bonusY) / 12;
      const mAdjNet   = adjNetY / 12;

      const niPrimary = Math.max(0, Math.min(mGross, cfg.ni_upper_monthly_pence) - cfg.ni_lower_monthly_pence) * cfg.ni_primary_pct / 100;
      const niUpper   = Math.max(0, mGross - cfg.ni_upper_monthly_pence) * cfg.ni_upper_pct / 100;

      let slMonthly = 0;
      if (cfg.sl_enabled !== 0 && (grossY + bonusY) > cfg.sl_threshold_yearly_pence) {
        slMonthly = Math.floor(((grossY + bonusY - cfg.sl_threshold_yearly_pence) * cfg.sl_rate_pct / 100) / 12 / 100) * 100;
      }

      const isCurrentMonth = cur.year === year && cur.month === month;
      if (!isCurrentMonth) priorAdjNetYTD += mAdjNet;

      grossYTD   += mGross;
      pensionYTD += pensionY / 12;
      adjNetYTD  += mAdjNet;
      niYTD      += niPrimary + niUpper;
      slYTD      += slMonthly;
      empPenYTD  += empPenY / 12;
      bonusYTD   += bonusY / 12;
    }

    if (cur.month === 12) { cur = { year: cur.year + 1, month: 1 }; }
    else { cur = { year: cur.year, month: cur.month + 1 }; }
  }

  return {
    taxYear: ty,
    employmentStart,
    grossYTDPence:           Math.round(grossYTD),
    employeePensionYTDPence: Math.round(pensionYTD),
    adjustedNetYTDPence:     Math.round(adjNetYTD),
    priorAdjNetYTDPence:     Math.round(priorAdjNetYTD),
    niYTDPence:              Math.round(niYTD),
    slYTDPence:              Math.round(slYTD),
    employerPensionYTDPence: Math.round(empPenYTD),
    bonusYTDPence:           Math.round(bonusYTD),
  };
}
