import type { LifetimeTotals, StudentLoanResult } from '@budget/core';
import { monthLabel } from '../../lib/dates';
import { LifetimeTotalsTable, StudentLoanTracker } from './SalaryView';

export function LifetimeTab({ lifetime, studentLoan, ym }: { lifetime: LifetimeTotals; studentLoan: StudentLoanResult; ym: string }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-hairline bg-panel p-5">
        <h2 className="mb-4 font-serif text-base font-medium text-ink">
          Lifetime totals{' '}
          <span className="font-normal text-ink-faint text-sm">
            — through {monthLabel(ym)} ({lifetime.monthsCount} months)
          </span>
        </h2>
        <LifetimeTotalsTable totals={lifetime} />
      </section>

      <StudentLoanTracker result={studentLoan} ymLabel={monthLabel(ym)} />
    </div>
  );
}
