import type { SalaryConfig, SalaryBreakdown, SalaryFigures, SalaryRow } from './types';

function figures(yearly: number, cfg: SalaryConfig, monthlyOverride?: number): SalaryFigures {
  const weekly = Math.round(yearly / cfg.work_weeks_per_year);
  return {
    yearly,
    // Tax-affected rows pass a monthlyOverride so the monthly column shows the
    // cumulative-month figure rather than yearly ÷ 12 (Monthly × 12 ≠ Yearly there).
    monthly: monthlyOverride ?? Math.round(yearly / 12),
    weekly,
    daily: Math.round(weekly / cfg.work_days_per_week),
    hourly: Math.round(weekly / cfg.hours_per_week),
  };
}

function flatFigures(value: number): SalaryFigures {
  return { yearly: value, monthly: value, weekly: value, daily: value, hourly: value };
}

function row(key: string, label: string, yearly: number, cfg: SalaryConfig, opts: { deduction?: boolean; summary?: boolean } = {}, monthlyOverride?: number): SalaryRow {
  return {
    key,
    label,
    isDeduction: opts.deduction ?? false,
    isSummary: opts.summary ?? false,
    isPercentage: false,
    figures: figures(yearly, cfg, monthlyOverride),
  };
}

function pctRow(key: string, label: string, value: number): SalaryRow {
  return {
    key,
    label,
    isDeduction: false,
    isSummary: false,
    isPercentage: true,
    figures: flatFigures(value),
  };
}

// Cumulative PAYE tax on `cumAdjNetPence` of actual earnings across `m` tax periods.
function  taxOnCumulative(
  cumAdjNetPence: number,
  m: number,
  monthlyPA: number,
  monthlyBRB: number,
  monthlyARTaxable: number,
  cfg: SalaryConfig,
): number[] {
  if (cumAdjNetPence <= 0 || m <= 0) return [0, 0, 0];
  const t = Math.floor(Math.max(0, cumAdjNetPence - m * monthlyPA) / 100) * 100;
  const roundedBRB = Math.ceil(monthlyBRB * m / 100) * 100;
  if (t <= roundedBRB) {
    const basic = t * cfg.basic_rate_pct / 100;
    return [basic, 0, 0]
  }
  else if (t <= (monthlyARTaxable * m)) {
    // Marginal-relief form, VALIDATED against real payslips (see salary.test.ts):
    // net effect = t×higher_rate − (exact cumulative basic band)×basic_rate. Do NOT
    // "simplify" to band×basic_rate + (t−roundedBRB)×higher_rate — that rounds the
    // higher-rate boundary to the ceil'd band and drifts ~10–25p/period off the payslip.
    const basic = Math.floor((roundedBRB * cfg.higher_rate_pct / 100) - (monthlyBRB * m * cfg.basic_rate_pct / 100))
    const higher = (t - roundedBRB) * cfg.higher_rate_pct / 100
    return [basic, higher, 0]
  }
  else {
  const basic  = Math.min(t, monthlyBRB * m) * cfg.basic_rate_pct / 100;
  const higher = Math.max(0, Math.min(t, monthlyARTaxable * m) - monthlyBRB * m) * cfg.higher_rate_pct / 100;
  const addl   = Math.max(0, t - monthlyARTaxable * m) * cfg.additional_rate_pct / 100;
  return [basic, higher, addl];
  }
}

export function calcSalary(
  cfg: SalaryConfig,
  employmentStart?: { year: number; month: number },
  ytdInput?: { adjustedNetYTDPence: number; priorAdjNetYTDPence: number },
): SalaryBreakdown {
  // Salary + Bonus
  const grossY = cfg.gross_yearly_pence;
  const grossM = grossY/12
  const bonusY = cfg.bonus_pence ?? 0;
  const bonusM = bonusY/12

  // Employer pension (salary only — bonus excluded)
  const employerPensionM = Math.round(grossM * cfg.employer_pension_pct / 100);
  const employerPensionY = employerPensionM*12;

  // Total Compensation
  const totalCompM = grossM + bonusM + employerPensionM;
  const totalCompY = totalCompM * 12;

  // Employee pension (salary only — bonus excluded, deduction — negative)
  const employeePensionM = -Math.round(grossM * cfg.employee_pension_pct / 100);
  const employeePensionY = employeePensionM*12;

  // Adjusted Net Income (Gross - Pension Deductions)
  const adjustedNetM = grossM + bonusM + employeePensionM;
  const adjustedNetY = adjustedNetM * 12;

  // Allowances/Tax Bands
  const monthlyPA  = cfg.personal_allowance_pence / 12;
  const monthlyBRB = cfg.basic_rate_band_pence / 12;
  const monthlyART = cfg.additional_rate_threshold_pence / 12; 

  // Personal allowance tapering: PA reduces by £1 for every £2 of adjusted yearly net income above £100k.
  // The taper start is derived: additional_rate_threshold − 2 × standard_PA = £125,140 − 2×£12,570 = £100,000.
  // Slightly incorrect as technically this would use a different tax code - fix later.
  const paTaperStartM = Math.round((monthlyART) - 2 * (monthlyPA));
  const effectivePaM = Math.max(0, (monthlyPA) - Math.max(0, Math.floor((adjustedNetM - paTaperStartM) / 2)));
  const effectivePaY = effectivePaM * 12;

  const monthlyARTaxable  = Math.max(0, monthlyART - effectivePaM);

  // Taxable income display (floored at 0)
  const taxableY = Math.max(0, adjustedNetY - effectivePaY);

  // Income tax (PAYE) — cumulative system.
  // Tax period within the UK tax year (April = 1, ..., March = 12).
  const taxPeriod = cfg.month >= 4 ? cfg.month - 3 : cfg.month + 9;
  const configTaxYear = cfg.month >= 4 ? cfg.year : cfg.year - 1;

  // How many months of this salary have been earned so far in this tax year.
  // Defaults to taxPeriod (employed since April → steady-state).
  let monthsEmployed = taxPeriod;
  if (employmentStart) {
    const startTY = employmentStart.month >= 4 ? employmentStart.year : employmentStart.year - 1;
    if (startTY === configTaxYear) {
      const startPeriod = employmentStart.month >= 4 ? employmentStart.month - 3 : employmentStart.month + 9;
      monthsEmployed = Math.max(1, taxPeriod - startPeriod + 1);
    }
  }

  const sum = (arr: number[]): number => arr.reduce((acc, curr) => acc + curr, 0);
  let monthlyTax: number;
  let PAUsedY: number;
  let PAUsedM: number;
  let basicM: number;
  let higherM: number;
  let addlM: number;
  if (monthsEmployed < taxPeriod) {
    // Mid-year start: cumulative PAYE — unused prior-period PA absorbs earnings until exhausted.
    // Use actual per-month YTD when provided; otherwise fall back to flat-salary approximation.
    const M = taxPeriod, N = monthsEmployed;
    const cumEarnings   = ytdInput ? ytdInput.adjustedNetYTDPence   :  N      * adjustedNetM;
    const priorEarnings = ytdInput ? ytdInput.priorAdjNetYTDPence   : (N - 1) * adjustedNetM;
    PAUsedY = Math.min(cumEarnings, M * monthlyPA);
    PAUsedM = Math.min(adjustedNetM, (Math.min(cumEarnings, M * monthlyPA) - Math.min(priorEarnings, (M-1) * monthlyPA)));
    const [basicCum, higherCum, addlCum] = taxOnCumulative(cumEarnings,   M,     effectivePaM, monthlyBRB, monthlyARTaxable, cfg);
    const [basicPri, higherPri, addlPri] = taxOnCumulative(priorEarnings, M - 1, effectivePaM, monthlyBRB, monthlyARTaxable, cfg);
    basicM = basicCum - basicPri;
    higherM = higherCum - higherPri;
    addlM = addlCum - addlPri;
    monthlyTax = basicM + higherM + addlM
    } else {
    // Steady-state (employed since April): simple monthly floor — matches payslip for flat salary.
    const M = taxPeriod;
    const cumEarnings   = ytdInput ? ytdInput.adjustedNetYTDPence   :  M      * adjustedNetM;
    const priorEarnings = ytdInput ? ytdInput.priorAdjNetYTDPence   : (M - 1) * adjustedNetM;
    PAUsedY = Math.min(cumEarnings, M * monthlyPA);
    PAUsedM = PAUsedY - Math.min(cumEarnings, (M-1) * monthlyPA);
    const [basicCum, higherCum, addlCum] = taxOnCumulative(cumEarnings,   M,     effectivePaM, monthlyBRB, monthlyARTaxable, cfg);
    const [basicPri, higherPri, addlPri] = taxOnCumulative(priorEarnings, M - 1, effectivePaM, monthlyBRB, monthlyARTaxable, cfg);
    basicM = basicCum - basicPri;
    higherM = higherCum - higherPri;
    addlM = addlCum - addlPri;
    monthlyTax = basicM + higherM + addlM
  }
  // Income tax — MONTHLY: the cumulative PAYE actually deducted this month (monthlyTax,
  // above). Feeds the monthly column and netMonthlyPence.
  const incomeTaxMonthly = monthlyTax === 0 ? 0 : -monthlyTax;
  // Income tax — YEARLY: the full-year-equivalent liability at this salary, i.e. the
  // cumulative routine evaluated at period 12 (HMRC bands on the annual taxable pay).
  // Independent of employmentStart/YTD — it answers "what does a full year here cost".
  const [basicY, higherY, addlY] = taxOnCumulative(adjustedNetY, 12, effectivePaM, monthlyBRB, monthlyARTaxable, cfg);
  const incomeTaxY = -(basicY + higherY + addlY)

  // NI — calculated monthly then annualised (bonus included in monthly base)
  const monthlyGross = (grossY + bonusY) / 12;
  const niPrimary = Math.max(0, Math.min(monthlyGross, cfg.ni_upper_monthly_pence) - cfg.ni_lower_monthly_pence) * cfg.ni_primary_pct / 100;
  const niUpper = Math.max(0, monthlyGross - cfg.ni_upper_monthly_pence) * cfg.ni_upper_pct / 100;
  const niY = -Math.round((niPrimary + niUpper) * 12);

  // Student Loan — ROUNDDOWN to nearest whole £ per month, then annualise (bonus included)
  const totalEarningsY = grossY + bonusY;
  let slY = 0;
  if (cfg.sl_enabled && totalEarningsY > cfg.sl_threshold_yearly_pence) {
    const slMonthlyRaw = (totalEarningsY - cfg.sl_threshold_yearly_pence) * cfg.sl_rate_pct / 100 / 12;
    const slMonthly = -(Math.floor(slMonthlyRaw / 100) * 100); // ROUNDDOWN to whole £
    slY = slMonthly * 12;
  }

  // Yearly totals use the annual income tax.
  const totalDeductionsY = employeePensionY + incomeTaxY + niY + slY;
  const netPayY = adjustedNetY + incomeTaxY + niY + slY;
  const inclCompY = totalCompY + totalDeductionsY;

  // Monthly column for the tax-affected rows: built from the cumulative-month income tax
  // so it reconciles within the monthly column and matches the ledger figure.
  const niMonthly = Math.round(niY / 12);
  const slMonthly = Math.round(slY / 12);
  const adjustedNetMonthly = Math.round(adjustedNetY / 12);
  const employeePensionMonthly = Math.round(employeePensionY / 12);
  const totalCompMonthly = Math.round(totalCompY / 12);
  const totalDeductionsMonthly = employeePensionMonthly + incomeTaxMonthly + niMonthly + slMonthly;
  const netPayMonthly = adjustedNetMonthly + incomeTaxMonthly + niMonthly + slMonthly;
  const inclCompMonthly = totalCompMonthly + totalDeductionsMonthly;

  const effectiveTaxRate = totalEarningsY > 0 ? -totalDeductionsY / totalEarningsY : 0;
  const netPayPct = totalEarningsY > 0 ? netPayY / totalEarningsY : 0;

  const rows: SalaryRow[] = [
    row('gross', 'Base Pay', grossY, cfg),
    row('bonus', 'Bonus Pay', bonusY, cfg),
    row('grossWithBonus', 'Gross Income', grossY + bonusY, cfg, { summary: true }),
    row('employeePension', 'Employee Pension Deduction', employeePensionY, cfg, { deduction: true }),
    row('adjustedNet', 'Adjusted Net Income', adjustedNetY, cfg),
    row('taxableIncome', 'Taxable Income', taxableY, cfg),
    row('allowanceUsed', 'Allowance Used', PAUsedY, cfg, { deduction: true }, PAUsedM),
    row('employeePension', 'Tax Paid (Basic Band)', basicY, cfg, { deduction: true }, -basicM),
    row('employeePension', 'Tax Paid (Higher Band)', higherY, cfg, { deduction: true }, -higherM),
    row('incomeTax', 'Total Income Tax', incomeTaxY, cfg, { deduction: true, summary: true }, incomeTaxMonthly),
    row('ni', 'National Insurance', niY, cfg, { deduction: true }),
    ...(cfg.sl_enabled ? [row('sl', 'Student Loan (Plan 2)', slY, cfg, { deduction: true })] : []),
    row('totalDeductions', 'Total Deductions', totalDeductionsY, cfg, { deduction: true, summary: true }, totalDeductionsMonthly),
    row('netPay', 'Net Pay', netPayY, cfg, { summary: true }, netPayMonthly),
    pctRow('effectiveTaxRate', 'Effective Tax Rate', effectiveTaxRate),
    pctRow('netPayPct', 'Net Pay % of Gross', netPayPct),
    row('employerPension', 'Employer Pension', employerPensionY, cfg),
    row('inclComp', 'Net Pay incl. Compensation', inclCompY, cfg, { summary: true }, inclCompMonthly),
  ];

  return { rows, netMonthlyPence: netPayMonthly };
}
