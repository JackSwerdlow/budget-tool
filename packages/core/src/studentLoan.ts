import type { SalaryConfig, StudentLoanResult } from './types.ts';
import { walkMonths } from './salaryWalk.ts';

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const daysInYear = (y: number) => (isLeap(y) ? 366 : 365);
const idx = (y: number, m: number) => y * 12 + (m - 1);
const taxYearOf = (y: number, m: number) => (m >= 4 ? y : y - 1);

function payrollRepayment(cfg: SalaryConfig): number {
  const earnings = cfg.gross_yearly_pence + (cfg.bonus_pence ?? 0);
  if (!cfg.sl_enabled || earnings <= cfg.sl_threshold_yearly_pence) return 0;
  return Math.floor(((earnings - cfg.sl_threshold_yearly_pence) * cfg.sl_rate_pct / 100) / 12 / 100) * 100;
}

function monthInterest(balance: number, annualRatePct: number, y: number, m: number): number {
  if (balance <= 0 || annualRatePct <= 0) return 0;
  return Math.round(balance * (annualRatePct / 100) * daysInMonth(y, m) / daysInYear(y));
}

// Total earnings (gross + bonus, the same base the payroll repayment uses) for one UK tax year
// (Apr→Mar), resolving config inheritance month by month over ALL saved configs — including ones
// saved after the viewed month, and months past it (the inherited config is treated as if saved,
// matching the app-wide forecast convention). Months before the first-ever config earn nothing,
// so a genuine part-year start yields the real (lower) income — the SLC does not annualise.
function taxYearIncome(sorted: SalaryConfig[], taxYear: number): number {
  const firstIdx = idx(sorted[0].year, sorted[0].month);
  let income = 0;
  for (let i = idx(taxYear, 4); i < idx(taxYear, 4) + 12; i++) {
    if (i < firstIdx) continue;
    let resolved = sorted[0];
    for (const c of sorted) {
      if (idx(c.year, c.month) <= i) resolved = c; else break;
    }
    income += (resolved.gross_yearly_pence + (resolved.bonus_pence ?? 0)) / 12;
  }
  return income;
}

// The annual interest rate for a month. Flat plans (VIR off) use sl_interest_rate_pct as-is.
// With VIR on (gov.uk Plan 2), sl_interest_rate_pct is the minimum (RPI-only) rate and the rate
// climbs linearly to sl_vir_max_rate_pct as the tax year's income moves between the lower and
// upper thresholds: rate = min + (max − min) × clamp((income − lower)/(upper − lower), 0, 1).
// Applied contemporaneously per tax year — the SLC's charge-RPI-then-adjust-after-HMRC-data
// mechanism trues the year up to the same figure, so the simpler model converges with it.
// Degenerate params (missing, max ≤ min, upper ≤ lower) fall back to the flat rate.
function effectiveRate(cfg: SalaryConfig, tyIncomePence: number): number {
  const base = cfg.sl_interest_rate_pct ?? 0;
  if (!cfg.sl_vir_enabled) return base;
  const max = cfg.sl_vir_max_rate_pct;
  const lower = cfg.sl_vir_lower_income_pence;
  const upper = cfg.sl_vir_upper_income_pence;
  if (max == null || lower == null || upper == null || max <= base || upper <= lower) return base;
  const frac = Math.min(1, Math.max(0, (tyIncomePence - lower) / (upper - lower)));
  return base + (max - base) * frac;
}

export function computeStudentLoan(
  configs: SalaryConfig[],
  through: { year: number; month: number },
): StudentLoanResult {
  const empty: StudentLoanResult = {
    remainingBalancePence: 0, totalInterestPence: 0, totalPaidTowardBalancePence: 0,
    series: [], payoff: null,
  };
  const walk = walkMonths(configs, through);
  if (walk.length === 0) return empty;

  const sorted = [...configs].sort((a, b) => idx(a.year, a.month) - idx(b.year, b.month));
  const incomeByTaxYear = new Map<number, number>();
  const incomeFor = (ty: number): number => {
    let v = incomeByTaxYear.get(ty);
    if (v === undefined) { v = taxYearIncome(sorted, ty); incomeByTaxYear.set(ty, v); }
    return v;
  };

  let balance = 0, totalInterest = 0, totalPaid = 0, anchored = false;
  // First month of the current zero-balance run (the actual payoff month). Reset whenever the
  // balance goes positive again (e.g. a re-anchor opening a new loan), so it always reflects
  // the loan that is current as of `through`.
  let paidOffAt: { year: number; month: number } | null = null;
  const series: StudentLoanResult['series'] = [];

  for (const w of walk) {
    const isAnchor = w.isExplicit && w.cfg.sl_balance_pence != null;
    if (isAnchor) {
      balance = w.cfg.sl_balance_pence as number;
      anchored = true;
    }
    if (anchored) {
      const rate = effectiveRate(w.cfg, incomeFor(taxYearOf(w.year, w.month)));
      const interest = monthInterest(balance, rate, w.year, w.month);
      const opening = balance + interest;
      const extra = w.isExplicit ? Math.max(0, w.cfg.extra_payment_pence ?? 0) : 0;
      const payment = Math.min(opening, payrollRepayment(w.cfg) + extra);
      balance = opening - payment;
      totalInterest += interest;
      totalPaid += payment;
    }
    if (anchored) paidOffAt = balance <= 0 ? (paidOffAt ?? { year: w.year, month: w.month }) : null;
    series.push({ year: w.year, month: w.month, balancePence: balance });
  }

  let payoff: StudentLoanResult['payoff'] = null;
  if (paidOffAt) {
    // Already paid off within (or at the end of) the recorded window — report the real month.
    payoff = { ...paidOffAt, remainingInterestPence: 0 };
  } else if (anchored && balance > 0) {
    // Forward-walk from `through` at the latest rate + payroll, no extra, until £0. With VIR,
    // "latest rate held constant" means a full forward year at the latest salary sets the rate.
    const last = walk[walk.length - 1].cfg;
    const rate = effectiveRate(last, last.gross_yearly_pence + (last.bonus_pence ?? 0));
    const pay = payrollRepayment(last);
    if (pay > 0) {
      let bal = balance, y = through.year, m = through.month, interestRem = 0;
      for (let i = 0; i < 1200 && bal > 0; i++) {
        if (m === 12) { y += 1; m = 1; } else { m += 1; }
        const interest = monthInterest(bal, rate, y, m);
        const payment = Math.min(bal + interest, pay);
        bal = bal + interest - payment;
        interestRem += interest;
        if (bal <= 0) { payoff = { year: y, month: m, remainingInterestPence: interestRem }; break; }
      }
    }
    // pay <= 0 → balance never shrinks → payoff stays null.
  }

  return { remainingBalancePence: balance, totalInterestPence: totalInterest, totalPaidTowardBalancePence: totalPaid, series, payoff };
}
