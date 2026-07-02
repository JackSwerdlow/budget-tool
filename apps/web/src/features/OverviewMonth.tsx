import { averageNet, formatGBP, income, monthNet, monthTotal, type LedgerData } from '@budget/core';
import { Kbd, Panel } from '../components/ui';
import { monthLabel, todayISO } from '../lib/dates';
import { RunningChart } from '../charts/RunningChart';
import { GroupingDonut } from '../charts/GroupingDonut';
import { ComparisonBars } from '../charts/ComparisonBars';

export function OverviewMonth({ data, ym, hiddenCategoryIds }: { data: LedgerData; ym: string; hiddenCategoryIds: Set<number> }) {
  const currentYm = todayISO().slice(0, 7);
  const total = monthTotal(data, ym, { excludedCategoryIds: hiddenCategoryIds });
  const net = monthNet(data, ym, currentYm);
  const inc = income(data, ym, currentYm);
  const avg = averageNet(data, currentYm);
  const noData = data.entries.length === 0 && data.lists.length === 0 && data.income.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {noData && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-panel p-5 text-center">
          <p className="font-serif text-lg text-ink">Welcome to your Budget Tool</p>
          <p className="mt-1 text-sm text-ink-muted">
            Record your first spend under <span className="text-ink">+ Add</span> (or press <Kbd>a</Kbd>). Every total,
            chart and comparison below updates live.
          </p>
        </div>
      )}

      {!noData && total === 0 && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-panel p-4 text-center text-sm text-ink-muted">
          No spend recorded for {monthLabel(ym)} yet — the totals and charts below fill in as you add entries.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel>
          <div className="text-xs uppercase tracking-wide text-ink-faint">This month</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-4xl text-ink">{formatGBP(total)}</span>
          </div>
        </Panel>

        <Panel>
          <div className="text-xs uppercase tracking-wide text-ink-faint">Net balance</div>
          <div className="mt-1 font-serif text-4xl">
            <span className={net >= 0 ? 'text-under' : 'text-over'}>{formatGBP(net)}</span>
          </div>
          <div className="mt-1 text-sm text-ink-muted">
            income {formatGBP(inc)} · avg{' '}
            <span className={avg >= 0 ? 'text-under' : 'text-over'}>{formatGBP(avg)}</span>/mo
          </div>
        </Panel>
      </div>

      <Panel>
        <RunningChart data={data} ym={ym} hiddenCategoryIds={hiddenCategoryIds} />
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-base text-ink">By group</h3>
        </div>
        <GroupingDonut data={data} ym={ym} hiddenCategoryIds={hiddenCategoryIds} />
      </Panel>

      <Panel>
        <ComparisonBars data={data} ym={ym} hiddenCategoryIds={hiddenCategoryIds} />
      </Panel>
    </div>
  );
}
