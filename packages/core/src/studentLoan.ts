import type { SalaryConfig, StudentLoanResult } from './types';
import { walkMonths } from './salaryWalk';

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const daysInYear = (y: number) => (isLeap(y) ? 366 : 365);

function payrollRepayment(cfg: SalaryConfig): number {
  const earnings = cfg.gross_yearly_pence + (cfg.bonus_pence ?? 0);
  if (!cfg.sl_enabled || earnings <= cfg.sl_threshold_yearly_pence) return 0;
  return Math.floor(((earnings - cfg.sl_threshold_yearly_pence) * cfg.sl_rate_pct / 100) / 12 / 100) * 100;
}

function monthInterest(balance: number, annualRatePct: number, y: number, m: number): number {
  if (balance <= 0 || annualRatePct <= 0) return 0;
  return Math.round(balance * (annualRatePct / 100) * daysInMonth(y, m) / daysInYear(y));
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

  let balance = 0, totalInterest = 0, totalPaid = 0, anchored = false;
  const series: StudentLoanResult['series'] = [];

  for (const w of walk) {
    const isAnchor = w.isExplicit && w.cfg.sl_balance_pence != null;
    if (isAnchor) {
      balance = w.cfg.sl_balance_pence as number;
      anchored = true;
    } else if (anchored) {
      const interest = monthInterest(balance, w.cfg.sl_interest_rate_pct ?? 0, w.year, w.month);
      const opening = balance + interest;
      const extra = w.isExplicit ? Math.max(0, w.cfg.extra_payment_pence ?? 0) : 0;
      const payment = Math.min(opening, payrollRepayment(w.cfg) + extra);
      balance = opening - payment;
      totalInterest += interest;
      totalPaid += payment;
    }
    series.push({ year: w.year, month: w.month, balancePence: balance });
  }

  let payoff: StudentLoanResult['payoff'] = null;
  if (!anchored || balance <= 0) {
    payoff = balance <= 0 && anchored ? { year: through.year, month: through.month, remainingInterestPence: 0 } : null;
  } else {
    const last = walk[walk.length - 1].cfg;
    const rate = last.sl_interest_rate_pct ?? 0;
    const pay = payrollRepayment(last);
    let bal = balance, y = through.year, m = through.month, interestRem = 0;
    if (pay <= 0 && monthInterest(bal, rate, y, m) > 0) {
      payoff = null;
    } else {
      for (let i = 0; i < 1200 && bal > 0; i++) {
        if (m === 12) { y += 1; m = 1; } else { m += 1; }
        const interest = monthInterest(bal, rate, y, m);
        const payment = Math.min(bal + interest, pay);
        bal = bal + interest - payment;
        interestRem += interest;
        if (bal <= 0) { payoff = { year: y, month: m, remainingInterestPence: interestRem }; break; }
      }
    }
  }

  return { remainingBalancePence: balance, totalInterestPence: totalInterest, totalPaidTowardBalancePence: totalPaid, series, payoff };
}
