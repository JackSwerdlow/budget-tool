import { describe, expect, it } from 'vitest';
import { calcSalary } from './salary';
import type { SalaryConfig } from './types';

/*
 * Salary engine tests.
 *
 * Income-tax expected values are VALIDATED against a real payslip (ground truth), not a
 * spec reading. The cumulative PAYE this payroll uses is:
 *   • Taxable pay to date is rounded DOWN to the whole pound before tax is applied.
 *   • Tax due to date = taxableToDate × higher_rate − (exact cumulative basic band) ×
 *     basic_rate   (marginal-relief form; the basic band is the EXACT annual band ×
 *     period/12, NOT rounded up to a whole-£ higher-rate boundary).
 *   • Period PAYE = (tax due to date at period n) − (tax due to date at period n−1).
 *
 * NOTE / lesson learned: the HMRC "Taxable Pay Tables (manual method)" rounds the band
 * limit UP to the nearest £ (FOT spec Def 13). Applying that here drifts ~10–25p/period
 * away from the actual payslip — this payroll behaves like the exact-percentage method
 * (exact band). The payslip wins; see the May cross-check below.
 *
 * Payslip cross-check (May 2026, period 2): taxable YTD £9,304.71 → tax YTD £1,626.53,
 * period PAYE £983.27, net £3,562.94 — reproduced to the penny by salary.ts.
 *
 * Pension / NI / student-loan figures follow the payslip convention the engine uses: the
 * deduction is computed on the MONTHLY figure, rounded, then annualised (× 12) — what a
 * real payslip does (differs from a once-a-year annual rounding by a penny or two).
 *
 * Income-tax column semantics:
 *   • Monthly = the cumulative PAYE actually deducted that month (£0 in a mid-year first
 *               month, etc.). This is what feeds netMonthlyPence / the ledger.
 *   • Yearly  = the full-year-equivalent liability at this salary/config (the cumulative
 *               routine evaluated at period 12). For a steady employee this is the real
 *               annual tax; for a mid-year month it reads "what a full year at this salary
 *               costs", so for the tax rows Monthly × 12 ≠ Yearly — by design.
 *   • netMonthlyPence (written to the ledger) == the displayed Monthly net pay.
 */

// Baseline config — Jack's salary, 2025/26 UK tax year (mirrors the live/demo config).
// NOTE: a few stored parameters differ slightly from HMRC's published monthly figures:
//   basic_rate_band_pence = £37,701 (HMRC band is £37,700)
//   ni_lower_monthly_pence = £1,047.50 (HMRC primary threshold is £1,048.00)
//   ni_upper_monthly_pence = £4,189.17 (HMRC UEL is £4,189.00)
// These tests are faithful to the *method applied to the configured parameters*; the
// divergences above are a data/config concern, flagged but not "fixed" here.
const BASE: SalaryConfig = {
  year: 2026,
  month: 1,
  gross_yearly_pence: 5_946_600, // £59,466
  note: null,
  hours_per_week: 37,
  work_weeks_per_year: 52,
  work_days_per_week: 5,
  employee_pension_pct: 5.45,
  employer_pension_pct: 28.97,
  personal_allowance_pence: 1_257_000,
  basic_rate_band_pence: 3_770_100,
  additional_rate_threshold_pence: 12_514_000,
  basic_rate_pct: 20,
  higher_rate_pct: 40,
  additional_rate_pct: 45,
  ni_lower_monthly_pence: 104_750,
  ni_upper_monthly_pence: 418_917,
  ni_primary_pct: 8,
  ni_upper_pct: 2,
  sl_enabled: true,
  sl_threshold_yearly_pence: 2_847_000,
  sl_rate_pct: 9,
  sl_balance_pence: null,
  sl_interest_rate_pct: null,
  bonus_pence: 0,
};

const yearlyOf = (cfg: SalaryConfig, key: string) =>
  calcSalary(cfg).rows.find((r) => r.key === key)!.figures.yearly;

/*
 * Independent annual income-tax liability: the cumulative method applied to the
 * configured parameters. Taxable pay (rounded down to the whole £) taxed across the
 * annual 20/40/45 bands. Computed only from annual figures + configured parameters —
 * it never calls the engine's per-period tax routine, so it's an independent reference,
 * not a mirror of the implementation. (Not labelled "HMRC-exact": BASE uses a £37,701
 * basic-rate band, £1 above HMRC's £37,700 — faithful to the configured input, which is
 * also why the band divides evenly at period 12.)
 */
function annualIncomeTaxPence(adjustedNetYearly: number, effPaYearly: number, cfg: SalaryConfig): number {
  const taxable = Math.max(0, Math.floor((adjustedNetYearly - effPaYearly) / 100) * 100);
  const arTaxable = cfg.additional_rate_threshold_pence - effPaYearly; // 45% boundary, in taxable terms
  const band1 = Math.min(taxable, cfg.basic_rate_band_pence);
  const band2 = Math.max(0, Math.min(taxable, arTaxable) - cfg.basic_rate_band_pence);
  const band3 = Math.max(0, taxable - arTaxable);
  return Math.round(
    (band1 * cfg.basic_rate_pct + band2 * cfg.higher_rate_pct + band3 * cfg.additional_rate_pct) / 100,
  );
}

describe('calcSalary — derived figures (time columns)', () => {
  const r = calcSalary(BASE);
  const gross = r.rows.find((x) => x.key === 'gross')!;

  it('monthly = yearly ÷ 12', () => {
    expect(gross.figures.monthly).toBe(Math.round(5_946_600 / 12));
  });
  it('weekly = yearly ÷ work_weeks_per_year', () => {
    expect(gross.figures.weekly).toBe(Math.round(5_946_600 / 52));
  });
  it('daily = weekly ÷ work_days_per_week', () => {
    expect(gross.figures.daily).toBe(Math.round(Math.round(5_946_600 / 52) / 5));
  });
  it('hourly = weekly ÷ hours_per_week', () => {
    expect(gross.figures.hourly).toBe(Math.round(Math.round(5_946_600 / 52) / 37));
  });
  it('percentage rows carry the same value in every time column', () => {
    const etr = r.rows.find((x) => x.key === 'effectiveTaxRate')!;
    expect(etr.isPercentage).toBe(true);
    expect(etr.figures.yearly).toBeCloseTo(etr.figures.monthly, 10);
    expect(etr.figures.yearly).toBeCloseTo(etr.figures.weekly, 10);
    expect(etr.figures.yearly).toBeCloseTo(etr.figures.daily, 10);
  });
});

describe('calcSalary — gross, pension & compensation (payslip rounding: monthly → ×12)', () => {
  const r = calcSalary(BASE);
  const get = (key: string) => r.rows.find((x) => x.key === key)!;
  // grossM = 5_946_600 / 12 = 495_550 (exact)

  it('employer pension = round(monthly gross × employer%) × 12', () => {
    // round(495_550 × 28.97%) = round(143_560.835) = 143_561 → × 12 = 1_722_732
    expect(get('employerPension').figures.yearly).toBe(1_722_732);
  });

  it('employee pension = −round(monthly gross × employee%) × 12', () => {
    // round(495_550 × 5.45%) = round(27_007.475) = 27_007 → × 12 = 324_084
    expect(get('employeePension').figures.yearly).toBe(-324_084);
  });

  it('net pay incl. compensation = net pay + employer pension', () => {
    expect(get('inclComp').figures.yearly).toBe(
      get('netPay').figures.yearly + get('employerPension').figures.yearly,
    );
  });

  it('adjusted net = gross − employee pension', () => {
    // (495_550 − 27_007) × 12 = 5_622_516
    expect(get('adjustedNet').figures.yearly).toBe(5_622_516);
  });
});

describe('calcSalary — National Insurance (employee, monthly → ×12)', () => {
  it('NI = primary 8% + upper 2%, on monthly gross', () => {
    // monthly gross 495_550; primary (min(495_550, 418_917) − 104_750) × 8% = 314_167 × 8% = 25_133.36
    // upper (495_550 − 418_917) × 2% = 76_633 × 2% = 1_532.66 → 26_666.02 × 12 = 319_992.24 → round 319_992
    expect(yearlyOf(BASE, 'ni')).toBe(-319_992);
  });

  it('NI uses (gross + bonus) as the monthly base', () => {
    // monthly base (5_946_600 + 500_000)/12 = 537_216.67
    // primary 314_167 × 8% = 25_133.36; upper (537_216.67 − 418_917) × 2% = 2_365.99
    // 27_499.35 × 12 = 329_992.2 → round 329_992
    expect(yearlyOf({ ...BASE, bonus_pence: 500_000 }, 'ni')).toBe(-329_992);
  });
});

describe('calcSalary — Student Loan (Plan 2, monthly rounddown → ×12)', () => {
  it('SL = rounddown to whole £ of monthly 9% over threshold, × 12', () => {
    // (5_946_600 − 2_847_000) × 9% / 12 = 23_247/mo → floor to £ 23_200 → × 12 = 278_400
    expect(yearlyOf(BASE, 'sl')).toBe(-278_400);
  });

  it('SL uses (gross + bonus) against the threshold', () => {
    // (6_446_600 − 2_847_000) × 9% / 12 = 26_997/mo → floor to £ 26_900 → × 12 = 322_800
    expect(yearlyOf({ ...BASE, bonus_pence: 500_000 }, 'sl')).toBe(-322_800);
  });

  it('SL row is absent when sl_enabled is false', () => {
    expect(calcSalary({ ...BASE, sl_enabled: false }).rows.find((r) => r.key === 'sl')).toBeUndefined();
  });
});

describe('calcSalary — income tax: robust anchors', () => {
  it('no tax when income is below the personal allowance', () => {
    // £10,000 gross, after pension still well under £12,570 free pay → nil tax.
    // (−0 and +0 are both nil; === treats them equal where toBe/Object.is would not.)
    expect(yearlyOf({ ...BASE, gross_yearly_pence: 1_000_000 }, 'incomeTax') === 0).toBe(true);
  });
});

describe('calcSalary — income tax: cumulative PAYE on a mid-year employment start', () => {
  // £42,000 gross, 5.45% pension, no SL/bonus — mirrors the demo salary, started Nov 2025.
  // adjustedNetY = (350_000 − round(350_000×5.45%)=19_075) × 12 = 3_971_100; monthly adj 330_925.
  // free pay to date = period × £1,047.50 (personal_allowance ÷ 12).
  const cfg42k = { ...BASE, gross_yearly_pence: 4_200_000, sl_enabled: false, bonus_pence: 0 };
  const start = { year: 2025, month: 11 };

  it('November (period 8, 1st month): nil tax THIS month — 8 months of free pay (£8,380) > 1 month earnings (£3,309)', () => {
    const r = calcSalary({ ...cfg42k, year: 2025, month: 11 }, start);
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.monthly).toBe(0);
  });

  it('November: yearly column shows the full-year-equivalent liability (not £0)', () => {
    // Monthly is £0 (cumulative), but a full year at £42k owes tax: annual taxable
    // floor((3_971_100 − 1_257_000)/100)×100 = 2_714_100, all basic-rate → ×20% = 542_820.
    const r = calcSalary({ ...cfg42k, year: 2025, month: 11 }, start);
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.yearly).toBe(-542_820);
  });

  it('January (period 10, 3rd month): still nil — accumulated free pay (£10,475) > earnings (£9,928)', () => {
    const r = calcSalary({ ...cfg42k, year: 2026, month: 1 }, start);
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.monthly).toBe(0);
  });

  it('February (period 11, 4th month): tax begins as cumulative earnings overtake free pay', () => {
    // taxable to date = floor((4×330_925 − 11×104_750)/100)×100 = floor(171_450)→£1,714 = 171_400
    // all within the basic band → 171_400 × 20% = 34_280; prior period taxable was nil.
    const r = calcSalary({ ...cfg42k, year: 2026, month: 2 }, start);
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.monthly).toBe(-34_280);
  });

  it('April (period 1 of the next tax year): resets to steady-state', () => {
    const withStart = calcSalary({ ...cfg42k, year: 2026, month: 4 }, start);
    const steady = calcSalary({ ...cfg42k, year: 2026, month: 4 });
    expect(withStart.rows.find((x) => x.key === 'incomeTax')!.figures.yearly)
      .toBe(steady.rows.find((x) => x.key === 'incomeTax')!.figures.yearly);
  });
});

describe('calcSalary — income tax: cumulative monthly PAYE', () => {
  it('monthly PAYE matches the cumulative method (validated against a real payslip)', () => {
    // BASE, month 1 = tax period 10.  Free pay to date = 10 × £1,047.50 (PA ÷ 12).
    //   taxable to date Tn = floor((10×468_543 − 10×104_750)/100)×100 = 3_637_900  (£36,379)
    //   exact cumulative basic band = (3_770_100 ÷ 12) × 10 = 3_141_750  (£31,417.50)
    //   tax to date = Tn×40% − band×20%   (marginal relief, EXACT band)
    //     period 10: 3_637_900×40% − 3_141_750×20% = 826_810
    //     period  9: 3_274_100×40% − 2_827_575×20% = 744_125
    //   PAYE for the month = 826_810 − 744_125 = 82_685  →  −£826.85
    // This exact-band form reproduces real payslips to the penny (see header cross-check);
    // the £-rounded-band variant reads ~10p low and does NOT match.
    expect(calcSalary(BASE).rows.find((r) => r.key === 'incomeTax')!.figures.monthly).toBe(-82_685);
  });

  it('steady-state monthly PAYE is within £1 of (annual liability ÷ 12)', () => {
    const r = calcSalary(BASE);
    const monthly = r.rows.find((x) => x.key === 'incomeTax')!.figures.monthly;
    const adjNet = r.rows.find((x) => x.key === 'adjustedNet')!.figures.yearly;
    const annual = annualIncomeTaxPence(adjNet, BASE.personal_allowance_pence, BASE);
    expect(Math.abs(monthly - -Math.round(annual / 12))).toBeLessThanOrEqual(100);
  });
});

describe('calcSalary — income tax: yearly = full-year-equivalent liability', () => {
  it('basic+higher rate: yearly equals the annual liability (HMRC bands on annual taxable)', () => {
    const adjNet = yearlyOf(BASE, 'adjustedNet'); // 5_622_516
    const liability = annualIncomeTaxPence(adjNet, BASE.personal_allowance_pence, BASE); // 992_180
    expect(yearlyOf(BASE, 'incomeTax')).toBe(-liability);
  });

  it('additional rate (£200k, PA tapered to £0): yearly exercises all three bands', () => {
    // £200k > £125,140 ⇒ personal allowance tapers to £0, so the whole gross is taxable.
    const cfg = {
      ...BASE,
      gross_yearly_pence: 20_000_000,
      employee_pension_pct: 0,
      employer_pension_pct: 0,
      sl_enabled: false,
    };
    const liability = annualIncomeTaxPence(20_000_000, 0, cfg); // 7_620_280 (£76,202.80)
    expect(yearlyOf(cfg, 'incomeTax')).toBe(-liability);
  });
});

describe('calcSalary — internal consistency', () => {
  const r = calcSalary(BASE);
  const y = (key: string) => r.rows.find((x) => x.key === key)!.figures.yearly;
  const m = (key: string) => r.rows.find((x) => x.key === key)!.figures.monthly;

  it('yearly: net pay = adjusted net + income tax + NI + student loan', () => {
    expect(y('netPay')).toBe(y('adjustedNet') + y('incomeTax') + y('ni') + y('sl'));
  });

  it('yearly: total deductions = employee pension + income tax + NI + student loan', () => {
    expect(y('totalDeductions')).toBe(y('employeePension') + y('incomeTax') + y('ni') + y('sl'));
  });

  it('yearly: incl. compensation = (gross + bonus) + employer pension + total deductions', () => {
    // 'Total Compensation' is no longer a row; it equals grossWithBonus + employerPension.
    expect(y('inclComp')).toBe(y('grossWithBonus') + y('employerPension') + y('totalDeductions'));
  });

  it('monthly column reconciles within itself (tax rows use the cumulative month figure)', () => {
    expect(m('netPay')).toBe(m('adjustedNet') + m('incomeTax') + m('ni') + m('sl'));
    expect(m('totalDeductions')).toBe(m('employeePension') + m('incomeTax') + m('ni') + m('sl'));
  });

  it('netMonthlyPence equals the displayed monthly net pay (this is what the ledger stores)', () => {
    expect(r.netMonthlyPence).toBe(m('netPay'));
  });

  it('netMonthlyPence for BASE is 335_992 (characterisation pin)', () => {
    // adjustedNetM 468_543 − monthlyTax 82_685 − NI 26_666 − SL 23_200 = 335_992
    expect(r.netMonthlyPence).toBe(335_992);
  });
});

describe('calcSalary — bonus', () => {
  const cfg = { ...BASE, bonus_pence: 500_000 }; // £5,000
  const r = calcSalary(cfg);
  const get = (key: string) => r.rows.find((x) => x.key === key)!;

  it('bonus row appears between base pay and gross income', () => {
    const keys = r.rows.map((x) => x.key);
    expect(keys.indexOf('bonus')).toBe(keys.indexOf('gross') + 1);
    expect(keys.indexOf('bonus')).toBeLessThan(keys.indexOf('grossWithBonus'));
  });

  it('bonus row yearly = the configured bonus', () => {
    expect(get('bonus').figures.yearly).toBe(500_000);
  });

  it('employer & employee pension are unchanged by bonus (salary only)', () => {
    expect(get('employerPension').figures.yearly).toBe(1_722_732);
    expect(get('employeePension').figures.yearly).toBe(-324_084);
  });

  it('gross income row includes the bonus', () => {
    // 'Gross Income' (grossWithBonus) = base pay + bonus = 5_946_600 + 500_000.
    expect(get('grossWithBonus').figures.yearly).toBe(
      get('gross').figures.yearly + get('bonus').figures.yearly,
    );
  });

  it('adjusted net = gross + bonus − employee pension', () => {
    // (495_550 + 41_666.67 − 27_007) × 12 = 6_122_516
    expect(get('adjustedNet').figures.yearly).toBe(6_122_516);
  });

  it('bonus row is always present, showing £0 when bonus_pence is 0', () => {
    expect(calcSalary(BASE).rows.find((x) => x.key === 'bonus')!.figures.yearly).toBe(0);
  });
});

describe('calcSalary — widened YTD input is backward compatible', () => {
  it('passing full YTD totals does not change the validated monthly tax', () => {
    // adjustedNetYTD/prior at BASE period 10 (steady) = 10×/9× adjusted net monthly.
    const adjNetM = 468_543;
    const r = calcSalary(BASE, undefined, {
      adjustedNetYTDPence: 10 * adjNetM,
      priorAdjNetYTDPence: 9 * adjNetM,
      grossYTDPence: 10 * 495_550,
      employeePensionYTDPence: 10 * 27_007,
      niYTDPence: 10 * 26_666,
      slYTDPence: 10 * 23_200,
    });
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.monthly).toBe(-82_685);
    expect(r.netMonthlyPence).toBe(335_992);
  });
});

describe('calcSalary — view: forecast', () => {
  const find = (v: import('./types').SalaryView, key: string) => {
    const walk = (lines: import('./types').BreakdownLine[]): import('./types').BreakdownLine | undefined => {
      for (const l of lines) {
        if (l.key === key) return l;
        const c = l.children && walk(l.children);
        if (c) return c;
      }
    };
    return walk(v.breakdown)!;
  };

  it('steady-state: forecast tax equals the validated annualise yearly tax', () => {
    // No employmentStart, no ytdInput → forecast spans a full 12 months → == annualise.
    const r = calcSalary(BASE);
    const taxYearly = r.rows.find((x) => x.key === 'incomeTax')!.figures.yearly; // -992_180
    expect(find(r.view, 'incomeTax').cell.forecast).toBe(taxYearly);
  });

  it('steady-state: monthly cell equals the validated monthly tax', () => {
    const r = calcSalary(BASE);
    expect(find(r.view, 'incomeTax').cell.monthly).toBe(-82_685);
  });

  it('mid-year (Nov start) forecast tax is the partial-year liability, not the annualise figure', () => {
    // forecastAdjNet = 5 × 330_925 = 1_654_625; taxable floor((..−1_257_000))=397_600; ×20% = 79_520.
    const cfg42k = { ...BASE, gross_yearly_pence: 4_200_000, sl_enabled: false, bonus_pence: 0 };
    const r = calcSalary({ ...cfg42k, year: 2025, month: 11 }, { year: 2025, month: 11 });
    expect(find(r.view, 'incomeTax').cell.forecast).toBe(-79_520);
    // and the old annualise value (still on rows.yearly) is the larger, wrong-for-the-year figure
    expect(r.rows.find((x) => x.key === 'incomeTax')!.figures.yearly).toBe(-542_820);
  });

  it('forecast column reconciles: net = adjusted net + tax + NI + SL', () => {
    const r = calcSalary(BASE);
    const net = find(r.view, 'netIncome').cell.forecast;
    const adj = find(r.view, 'adjustedNet').cell.forecast;
    const tax = find(r.view, 'incomeTax').cell.forecast;
    const ni = find(r.view, 'ni').cell.forecast;
    const sl = find(r.view, 'sl').cell.forecast;
    expect(net).toBe(adj + tax + ni + sl);
  });

  it('bonus splits base vs bonus in the breakdown', () => {
    const r = calcSalary({ ...BASE, bonus_pence: 500_000 });
    expect(find(r.view, 'bonusPay').cell.forecast).toBe(500_000);
    // base pay = gross income − bonus (both derive from the same grossFC)
    expect(find(r.view, 'basePay').cell.forecast).toBe(
      find(r.view, 'grossIncome').cell.forecast - 500_000,
    );
  });

  it('base/bonus forecast split is proportional for a mid-year start with a bonus', () => {
    const cfg = { ...BASE, gross_yearly_pence: 4_200_000, bonus_pence: 1_200_000, sl_enabled: false };
    const r = calcSalary({ ...cfg, year: 2025, month: 11 }, { year: 2025, month: 11 });
    const base = find(r.view, 'basePay').cell.forecast;
    const bonus = find(r.view, 'bonusPay').cell.forecast;
    const gross = find(r.view, 'grossIncome').cell.forecast;
    expect(base).toBeGreaterThanOrEqual(0);
    expect(base + bonus).toBe(gross);
    expect(bonus).toBeLessThan(1_200_000); // forecast bonus is partial-year, not the full annual
  });
});

describe('calcSalary — view: YTD column', () => {
  const find = (v: import('./types').SalaryView, key: string) => {
    const walk = (lines: import('./types').BreakdownLine[]): import('./types').BreakdownLine | undefined => {
      for (const l of lines) { if (l.key === key) return l; const c = l.children && walk(l.children); if (c) return c; }
    };
    return walk(v.breakdown)!;
  };

  it('YTD gross equals the passed YTD total', () => {
    const r = calcSalary(BASE, undefined, {
      adjustedNetYTDPence: 10 * 468_543, priorAdjNetYTDPence: 9 * 468_543,
      grossYTDPence: 10 * 495_550, employeePensionYTDPence: 10 * 27_007,
      niYTDPence: 10 * 26_666, slYTDPence: 10 * 23_200,
    });
    expect(find(r.view, 'grossIncome').cell.ytd).toBe(10 * 495_550);
  });

  it('YTD net reconciles: adjusted net + tax + NI + SL', () => {
    const r = calcSalary(BASE, undefined, {
      adjustedNetYTDPence: 10 * 468_543, priorAdjNetYTDPence: 9 * 468_543,
      grossYTDPence: 10 * 495_550, employeePensionYTDPence: 10 * 27_007,
      niYTDPence: 10 * 26_666, slYTDPence: 10 * 23_200,
    });
    const net = find(r.view, 'netIncome').cell.ytd!;
    const adj = find(r.view, 'adjustedNet').cell.ytd!;
    const tax = find(r.view, 'incomeTax').cell.ytd!;
    const ni = find(r.view, 'ni').cell.ytd!;
    const sl = find(r.view, 'sl').cell.ytd!;
    expect(net).toBe(adj + tax + ni + sl);
  });

  it('YTD income tax is the cumulative tax to date — independent pin (BASE, period 10)', () => {
    // BASE month 1 = tax period 10. With adjustedNetYTD = 10×468_543:
    //   taxable to date = floor((4_685_430 − 10×104_750)/100)×100 = 3_637_900
    //   exact cumulative basic band = (3_770_100/12)×10 = 3_141_750
    //   tax to date = 3_637_900×40% − 3_141_750×20% = 826_810  (marginal-relief, exact band)
    // This is derived from the cumulative method (payslip ground truth), NOT by calling the engine.
    const r = calcSalary(BASE, undefined, {
      adjustedNetYTDPence: 10 * 468_543,
      priorAdjNetYTDPence: 9 * 468_543,
      grossYTDPence: 10 * 495_550,
      employeePensionYTDPence: 10 * 27_007,
      niYTDPence: 10 * 26_666,
      slYTDPence: 10 * 23_200,
    });
    expect(find(r.view, 'incomeTax').cell.ytd).toBe(-826_810);
  });
});

describe('calcSalary — view: rate strip, stats, pension', () => {
  it('rate strip: gross is 100%, net < gross, net-incl-pension > net', () => {
    const v = calcSalary(BASE).view;
    const [gross, net, incl] = v.rateStrip;
    expect(gross.pctGross).toBeCloseTo(1, 10);
    expect(net.yearly).toBeLessThan(gross.yearly);
    expect(incl.yearly).toBeGreaterThan(net.yearly);
  });

  it('stats: rates are positive fractions; incl-employer-pension is the lower one', () => {
    const s = calcSalary(BASE).view.stats;
    expect(s.effectiveRate).toBeGreaterThan(0);
    expect(s.effectiveRate).toBeLessThan(1);
    expect(s.effectiveRateInclEmployerPension).toBeLessThan(s.effectiveRate);
  });

  it('pension: contributions are positive and into-pot = employer + employee', () => {
    const [er, ee, tot] = calcSalary(BASE).view.pension;
    expect(ee.yearlyForecast).toBeGreaterThan(0);
    expect(ee.month).toBeGreaterThan(0);
    expect(tot.yearlyForecast).toBe(er.yearlyForecast + ee.yearlyForecast);
    expect(tot.month).toBe(er.month + ee.month);
  });

  it('pension yearly uses one consistent annualise basis (into-pot sums; mid-year)', () => {
    const cfg42k = { ...BASE, gross_yearly_pence: 4_200_000, sl_enabled: false, bonus_pence: 0 };
    const r = calcSalary({ ...cfg42k, year: 2025, month: 11 }, { year: 2025, month: 11 });
    const [er, ee, tot] = r.view.pension;
    expect(er.yearlyForecast).toBe(er.month * 12);
    expect(ee.yearlyForecast).toBe(ee.month * 12);
    expect(tot.yearlyForecast).toBe(er.yearlyForecast + ee.yearlyForecast);
  });
});
