import { useState } from 'react';
import { averageNet, formatGBP, income, monthNet, monthTotal, type LedgerData } from '@budget/core';
import { Kbd, Panel, Segmented } from '../components/ui';
import { todayISO } from '../lib/dates';
import { RunningChart } from '../charts/RunningChart';
import { GroupingDonut } from '../charts/GroupingDonut';
import { ComparisonBars } from '../charts/ComparisonBars';

export function OverviewMonth({ data, ym }: { data: LedgerData; ym: string }) {
  const [donutRent, setDonutRent] = useState<'incl' | 'excl'>('excl');

  const currentYm = todayISO().slice(0, 7);
  const inclTotal = monthTotal(data, ym);
  const exclTotal = monthTotal(data, ym, { excludeRent: true });
  const net = monthNet(data, ym, currentYm);
  const inc = income(data, ym, currentYm);
  const avg = averageNet(data, currentYm);
  const noData = data.entries.length === 0 && data.lists.length === 0 && data.income.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {noData && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-panel p-5 text-center">
          <p className="font-serif text-lg text-ink">Welcome to your Ledger</p>
          <p className="mt-1 text-sm text-ink-muted">
            Record your first spend under <span className="text-ink">+ Add</span> (or press <Kbd>a</Kbd>). Every total,
            chart and comparison below updates live.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel>
          <div className="text-xs uppercase tracking-wide text-ink-faint">This month</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-4xl text-ink">{formatGBP(inclTotal)}</span>
            <span className="text-sm text-ink-muted">incl. Rent</span>
          </div>
          <div className="mt-1">
            <span className="font-serif text-xl text-ink">{formatGBP(exclTotal)}</span>
            <span className="ml-1 text-sm text-ink-muted">excl. Rent</span>
          </div>
        </Panel>

        <Panel>
          <div className="text-xs uppercase tracking-wide text-ink-faint">Net balance · incl. Rent</div>
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
        <RunningChart data={data} ym={ym} />
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-base text-ink">By group</h3>
          <Segmented
            size="sm"
            value={donutRent}
            onChange={setDonutRent}
            options={[
              { id: 'incl', label: 'incl. Rent' },
              { id: 'excl', label: 'excl. Rent' },
            ]}
          />
        </div>
        <GroupingDonut data={data} ym={ym} excludeRent={donutRent === 'excl'} />
      </Panel>

      <Panel>
        <ComparisonBars data={data} ym={ym} />
      </Panel>
    </div>
  );
}
