import type {
  SalaryConfig, SalaryBreakdown, SalaryFigures, SalaryRow,
  SalaryView, SalaryYTDInput, BreakdownLine, BreakdownCell, RateRow, SalaryStats, PensionRow,
} from './types.ts';

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
// HMRC's cumulative exact-percentage method: taxable pay to date is rounded DOWN to the whole £;
// the higher-rate branch nets to a marginal-relief form on the EXACT cumulative band (the ceil'd
// band cancels — see the note below). Payslip-validated; verify any change against a real payslip.
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
  ytdInput?: SalaryYTDInput,
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
  const monthlyBRB = cfg.basic_rate_band_pence / 12;
  const monthlyART = cfg.additional_rate_threshold_pence / 12; 

  // Personal allowance tapering: PA reduces by £1 for every £2 of adjusted yearly net income above £100k.
  // Annual basis (spec-correct): taper start = ART − 2×PA = £125,140 − 2×£12,570 = £100,000.
  const taperStartY  = cfg.additional_rate_threshold_pence - 2 * cfg.personal_allowance_pence;
  const paReductionY = Math.max(0, Math.floor((adjustedNetY - taperStartY) / 2));
  const effectivePaY = Math.max(0, cfg.personal_allowance_pence - paReductionY);
  const effectivePaM = effectivePaY / 12;

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
    PAUsedY = Math.min(cumEarnings, M * effectivePaM);
    PAUsedM = Math.min(adjustedNetM, (Math.min(cumEarnings, M * effectivePaM) - Math.min(priorEarnings, (M-1) * effectivePaM)));
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
    PAUsedY = Math.min(cumEarnings, M * effectivePaM);
    PAUsedM = PAUsedY - Math.min(cumEarnings, (M-1) * effectivePaM);
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

  // ── New structured view ───────────────────────────────────────────────────
  const p = taxPeriod;
  const remaining = 12 - p;

  // YTD magnitudes (positive). Fall back to flat approximation when no YTD passed.
  const adjNetYTDmag   = ytdInput ? ytdInput.adjustedNetYTDPence     : monthsEmployed * adjustedNetM;
  const grossYTDmag    = ytdInput ? ytdInput.grossYTDPence           : monthsEmployed * monthlyGross;
  const niYTDmag       = ytdInput ? ytdInput.niYTDPence              : monthsEmployed * -niMonthly;
  const slYTDmag       = ytdInput ? ytdInput.slYTDPence              : monthsEmployed * -slMonthly;
  const empPenYTDmag   = ytdInput ? ytdInput.employeePensionYTDPence : monthsEmployed * -employeePensionMonthly;

  // Forecast magnitudes = YTD actual + remaining months at the current rate.
  const forecastAdjNet = adjNetYTDmag + remaining * adjustedNetM;
  const [basicFC, higherFC, addlFC] = taxOnCumulative(forecastAdjNet, 12, effectivePaM, monthlyBRB, monthlyARTaxable, cfg);
  const grossFC   = grossYTDmag  + remaining * monthlyGross;
  const niFCmag   = niYTDmag      + remaining * -niMonthly;
  const slFCmag   = slYTDmag      + remaining * -slMonthly;
  const empPenFC  = empPenYTDmag  + remaining * -employeePensionMonthly;
  const employerPenYTDmag = ytdInput ? (ytdInput.employerPensionYTDPence ?? monthsEmployed * employerPensionM) : monthsEmployed * employerPensionM;
  const employerPenFC = employerPenYTDmag + remaining * employerPensionM;
  const taxFC     = basicFC + higherFC + addlFC;
  const taxableFC = Math.max(0, Math.floor((forecastAdjNet - 12 * effectivePaM) / 100) * 100);
  const allowFC   = Math.min(forecastAdjNet, 12 * effectivePaM);
  const netFC     = forecastAdjNet - taxFC - niFCmag - slFCmag;

  // YTD tax (cumulative through current period) via the validated routine.
  const [basicYTD, higherYTD, addlYTD] = taxOnCumulative(adjNetYTDmag, p, effectivePaM, monthlyBRB, monthlyARTaxable, cfg);
  const taxYTD     = basicYTD + higherYTD + addlYTD;
  const taxableYTD = Math.max(0, Math.floor((adjNetYTDmag - p * effectivePaM) / 100) * 100);
  const allowYTD   = Math.min(adjNetYTDmag, p * effectivePaM);
  const netYTD     = adjNetYTDmag - taxYTD - niYTDmag - slYTDmag;

  // Per-period slices of a monthly figure (this month annualised, re-sliced).
  const wk = (monthly: number) => Math.round((monthly * 12) / cfg.work_weeks_per_year);
  const dy = (monthly: number) => Math.round(((monthly * 12) / cfg.work_weeks_per_year) / cfg.work_days_per_week);
  const hr = (monthly: number) => Math.round(((monthly * 12) / cfg.work_weeks_per_year) / cfg.hours_per_week);
  // Money is integer pence everywhere (money.ts); a forecast = YTD + remaining×monthly carries
  // fractional pence when monthly doesn't divide evenly, so round every cell value to whole pence
  // here — else formatGBP renders the raw float as "£59,283.96.3333…".
  const r2 = (n: number) => Math.round(n);
  const rated = (forecast: number, monthly: number, ytd: number | null): BreakdownCell =>
    ({ forecast: r2(forecast), monthly: r2(monthly), weekly: wk(monthly), daily: dy(monthly), hourly: hr(monthly), ytd: ytd == null ? null : r2(ytd) });
  const flatCell = (forecast: number, monthly: number, ytd: number | null): BreakdownCell =>
    ({ forecast: r2(forecast), monthly: r2(monthly), weekly: null, daily: null, hourly: null, ytd: ytd == null ? null : r2(ytd) });

  // This-month figures (signed; deductions negative) already computed above:
  //   grossM+bonusM, employeePensionMonthly, incomeTaxMonthly, niMonthly, slMonthly,
  //   basicM/higherM/addlM (magnitudes), PAUsedM, adjustedNetMonthly, netPayMonthly.
  const grossMthly = Math.round((grossY + bonusY) / 12);

  const taxChildren: BreakdownLine[] = [
    { key: 'allowanceUsed', label: 'Allowance Used', depth: 2, isDeduction: false, isNet: false, muted: true,
      cell: flatCell(allowFC, PAUsedM, allowYTD) },
    { key: 'taxBasic', label: 'Basic Rate', depth: 2, isDeduction: true, isNet: false,
      cell: flatCell(-basicFC, -basicM, -basicYTD) },
    { key: 'taxHigher', label: 'Higher Rate', depth: 2, isDeduction: true, isNet: false,
      cell: flatCell(-higherFC, -higherM, -higherYTD) },
    ...(addlFC > 0 || addlM > 0
      ? [{ key: 'taxAddl', label: 'Additional Rate', depth: 2, isDeduction: true, isNet: false,
          cell: flatCell(-addlFC, -addlM, -addlYTD) } as BreakdownLine]
      : []),
  ];

  const deductionChildren: BreakdownLine[] = [
    { key: 'employeePension', label: 'Employee Pension', depth: 1, isDeduction: true, isNet: false,
      cell: flatCell(-empPenFC, employeePensionMonthly, -empPenYTDmag) },
    { key: 'incomeTax', label: 'Income Tax', depth: 1, isDeduction: true, isNet: false,
      cell: flatCell(-taxFC, incomeTaxMonthly, -taxYTD), children: taxChildren },
    { key: 'ni', label: 'National Insurance', depth: 1, isDeduction: true, isNet: false,
      cell: flatCell(-niFCmag, niMonthly, -niYTDmag) },
    ...(cfg.sl_enabled
      ? [{ key: 'sl', label: 'Student Loan (Plan 2)', depth: 1, isDeduction: true, isNet: false,
          cell: flatCell(-slFCmag, slMonthly, -slYTDmag) } as BreakdownLine]
      : []),
  ];

  const deductionsFC  = -empPenFC - taxFC - niFCmag - slFCmag;
  const deductionsMth = employeePensionMonthly + incomeTaxMonthly + niMonthly + slMonthly;
  const deductionsYTD = -empPenYTDmag - taxYTD - niYTDmag - slYTDmag;

  const totalAnnualGross = grossY + bonusY;
  const bonusFC = totalAnnualGross > 0 ? Math.round(grossFC * bonusY / totalAnnualGross) : 0;

  const breakdown: BreakdownLine[] = [
    { key: 'grossIncome', label: 'Gross Income', depth: 0, isDeduction: false, isNet: false,
      cell: rated(grossFC, grossMthly, grossYTDmag),
      children: [
        // Split the gross forecast proportionally so base + bonus = grossFC and base ≥ 0
        // (hard-coding the full annual bonus understates base for a mid-year start).
        { key: 'basePay', label: 'Base Pay', depth: 1, isDeduction: false, isNet: false,
          cell: rated(grossFC - bonusFC, Math.round(grossY / 12), null) },
        { key: 'bonusPay', label: 'Bonus', depth: 1, isDeduction: false, isNet: false,
          cell: rated(bonusFC, Math.round(bonusY / 12), null) },
      ] },
    { key: 'deductions', label: 'Deductions', depth: 0, isDeduction: true, isNet: false,
      cell: flatCell(deductionsFC, deductionsMth, deductionsYTD), children: deductionChildren },
    { key: 'netIncome', label: 'Net Income', depth: 0, isDeduction: false, isNet: true,
      cell: rated(netFC, netPayMonthly, netYTD),
      children: [
        { key: 'adjustedNet', label: 'Adjusted Net Income', depth: 1, isDeduction: false, isNet: false,
          cell: flatCell(forecastAdjNet, adjustedNetMonthly, adjNetYTDmag) },
        { key: 'taxableIncome', label: 'Taxable Income', depth: 1, isDeduction: false, isNet: false,
          cell: flatCell(taxableFC, Math.max(0, adjustedNetMonthly - Math.round(effectivePaM)), taxableYTD) },
      ] },
  ];

  // Rate strip — standing current rate. Yearly is the standing annualise (intentionally
  // distinct from the breakdown's Forecast yearly); the Monthly column is overridden to the
  // ACTUAL this-month figure for the net rows so it matches the breakdown's Monthly (the
  // figure written to the ledger) rather than a yearly÷12 that rounds a few pence off.
  const grossStandY = grossY + bonusY;
  const netStandY   = netPayY;                       // existing annualise net
  const netInclY    = netPayY + employerPensionY;
  const rateRow = (key: string, label: string, yearly: number, monthlyOverride?: number): RateRow => ({
    key, label, yearly,
    monthly: monthlyOverride ?? Math.round(yearly / 12),
    weekly:  Math.round(yearly / cfg.work_weeks_per_year),
    daily:   Math.round(Math.round(yearly / cfg.work_weeks_per_year) / cfg.work_days_per_week),
    hourly:  Math.round(Math.round(yearly / cfg.work_weeks_per_year) / cfg.hours_per_week),
    pctGross: grossStandY > 0 ? yearly / grossStandY : 0,
  });
  const rateStrip: RateRow[] = [
    rateRow('gross', 'Gross Income', grossStandY),
    rateRow('net', 'Net Income', netStandY, netPayMonthly),
    rateRow('netInclPension', 'Net incl. employer pension', netInclY, netPayMonthly + employerPensionM),
  ];

  // Stats — standing (annualise) basis, consistent with the rate strip's "% of gross" so the
  // total rate reconciles exactly (totalRate = 1 − net% of gross).
  //  • incomeTaxRateGross   = income tax ÷ gross income   (standard effective rate; counts the allowance)
  //  • incomeTaxRateTaxable = income tax ÷ taxable income (average rate on the taxed portion)
  //  • totalRate            = all deductions (employee pension + tax + NI + SL) ÷ gross  (= 1 − net/gross)
  //  • totalRateInclPension = all deductions ÷ (gross + employer pension)
  const incomeTaxStand     = -incomeTaxY;             // annualise income-tax magnitude
  const allDeductionsStand = grossStandY - netStandY; // employee pension + tax + NI + SL (annualise)
  const stats: SalaryStats = {
    incomeTaxRateGross:   grossStandY > 0 ? incomeTaxStand / grossStandY : 0,
    incomeTaxRateTaxable: taxableY    > 0 ? incomeTaxStand / taxableY    : 0,
    totalRate:            grossStandY > 0 ? allDeductionsStand / grossStandY : 0,
    totalRateInclPension: grossStandY + employerPensionY > 0
      ? allDeductionsStand / (grossStandY + employerPensionY)
      : 0,
  };

  const employerMonthly = employerPensionM;          // positive contribution this month
  const employeeMonthly = -employeePensionMonthly;   // positive contribution this month
  const pension: PensionRow[] = [
    { key: 'employer', label: 'Employer', month: employerMonthly, yearlyForecast: employerPenFC, allTime: null },
    { key: 'employee', label: 'Employee', month: employeeMonthly, yearlyForecast: empPenFC, allTime: null },
    { key: 'total', label: 'Into pot', month: employerMonthly + employeeMonthly, yearlyForecast: employerPenFC + empPenFC, allTime: null },
  ];

  const view: SalaryView = { rateStrip, breakdown, stats, pension };

  const rows: SalaryRow[] = [
    row('gross', 'Base Pay', grossY, cfg),
    row('bonus', 'Bonus Pay', bonusY, cfg),
    row('grossWithBonus', 'Gross Income', grossY + bonusY, cfg, { summary: true }),
    row('employeePension', 'Employee Pension Deduction', employeePensionY, cfg, { deduction: true }),
    row('adjustedNet', 'Adjusted Net Income', adjustedNetY, cfg),
    row('taxableIncome', 'Taxable Income', taxableY, cfg),
    row('allowanceUsed', 'Allowance Used', PAUsedY, cfg, { deduction: true }, PAUsedM),
    row('taxBasic', 'Tax Paid (Basic Band)', basicY, cfg, { deduction: true }, -basicM),
    row('taxHigher', 'Tax Paid (Higher Band)', higherY, cfg, { deduction: true }, -higherM),
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

  return { rows, netMonthlyPence: netPayMonthly, view };
}
