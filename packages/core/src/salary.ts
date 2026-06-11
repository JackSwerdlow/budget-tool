import type { SalaryConfig, SalaryBreakdown, SalaryFigures, SalaryRow } from './types';

function figures(yearly: number, cfg: SalaryConfig): SalaryFigures {
  const weekly = Math.round(yearly / cfg.work_weeks_per_year);
  return {
    yearly,
    monthly: Math.round(yearly / 12),
    weekly,
    daily: Math.round(weekly / cfg.work_days_per_week),
    hourly: Math.round(weekly / cfg.hours_per_week),
  };
}

function flatFigures(value: number): SalaryFigures {
  return { yearly: value, monthly: value, weekly: value, daily: value, hourly: value };
}

function row(key: string, label: string, yearly: number, cfg: SalaryConfig, opts: { deduction?: boolean; summary?: boolean } = {}): SalaryRow {
  return {
    key,
    label,
    isDeduction: opts.deduction ?? false,
    isSummary: opts.summary ?? false,
    isPercentage: false,
    figures: figures(yearly, cfg),
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

export function calcSalary(cfg: SalaryConfig): SalaryBreakdown {
  const grossY = cfg.gross_yearly_pence;

  // Employer pension
  const employerPensionY = Math.round(grossY * cfg.employer_pension_pct / 100);
  const totalCompY = grossY + employerPensionY;

  // Employee pension (deduction — negative)
  const employeePensionY = -Math.round(grossY * cfg.employee_pension_pct / 100);
  const adjustedNetY = grossY + employeePensionY;

  // Taxable income (floored at 0)
  const taxableY = Math.max(0, adjustedNetY - cfg.personal_allowance_pence);

  // Additional rate threshold as a taxable income boundary
  const addRateTaxableY = Math.max(0, cfg.additional_rate_threshold_pence - cfg.personal_allowance_pence);

  // Income tax across three bands
  const basicTax = Math.min(taxableY, cfg.basic_rate_band_pence) * cfg.basic_rate_pct / 100;
  const higherTax = Math.max(0, Math.min(taxableY, addRateTaxableY) - cfg.basic_rate_band_pence) * cfg.higher_rate_pct / 100;
  const additionalTax = Math.max(0, taxableY - addRateTaxableY) * cfg.additional_rate_pct / 100;
  const taxRounded = Math.round(basicTax + higherTax + additionalTax);
  const incomeTaxY = taxRounded === 0 ? 0 : -taxRounded;

  // NI — calculated monthly then annualised
  const monthlyGross = grossY / 12;
  const niPrimary = Math.max(0, Math.min(monthlyGross, cfg.ni_upper_monthly_pence) - cfg.ni_lower_monthly_pence) * cfg.ni_primary_pct / 100;
  const niUpper = Math.max(0, monthlyGross - cfg.ni_upper_monthly_pence) * cfg.ni_upper_pct / 100;
  const niY = -Math.round((niPrimary + niUpper) * 12);

  // Student Loan — ROUNDDOWN to nearest whole £ per month, then annualise
  let slY = 0;
  if (cfg.sl_enabled && grossY > cfg.sl_threshold_yearly_pence) {
    const slMonthlyRaw = (grossY - cfg.sl_threshold_yearly_pence) * cfg.sl_rate_pct / 100 / 12;
    const slMonthly = -(Math.floor(slMonthlyRaw / 100) * 100); // ROUNDDOWN to whole £
    slY = slMonthly * 12;
  }

  const totalDeductionsY = employeePensionY + incomeTaxY + niY + slY;
  const netPayY = adjustedNetY + incomeTaxY + niY + slY;
  const inclCompY = totalCompY + totalDeductionsY;

  const effectiveTaxRate = grossY > 0 ? -totalDeductionsY / grossY : 0;
  const netPayPct = grossY > 0 ? netPayY / grossY : 0;

  const rows: SalaryRow[] = [
    row('gross', 'Gross Income', grossY, cfg),
    row('employerPension', 'Employer Pension', employerPensionY, cfg),
    row('totalComp', 'Total Compensation', totalCompY, cfg, { summary: true }),
    row('employeePension', 'Employee Pension', employeePensionY, cfg, { deduction: true }),
    row('adjustedNet', 'Adjusted Net Income', adjustedNetY, cfg),
    row('taxableIncome', 'Taxable Income', taxableY, cfg),
    row('incomeTax', 'Income Tax', incomeTaxY, cfg, { deduction: true }),
    row('ni', 'National Insurance', niY, cfg, { deduction: true }),
    ...(cfg.sl_enabled ? [row('sl', 'Student Loan (Plan 2)', slY, cfg, { deduction: true })] : []),
    row('totalDeductions', 'Total Deductions', totalDeductionsY, cfg, { deduction: true, summary: true }),
    row('netPay', 'Net Pay', netPayY, cfg, { summary: true }),
    pctRow('effectiveTaxRate', 'Effective Tax Rate', effectiveTaxRate),
    pctRow('netPayPct', 'Net Pay % of Gross', netPayPct),
    row('inclComp', 'incl. Compensation', inclCompY, cfg, { summary: true }),
  ];

  return { rows, netMonthlyPence: Math.round(netPayY / 12) };
}
