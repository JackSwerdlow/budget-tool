import { useState } from 'react';
import { categoryTotalsByMonth, previousMonth, type LedgerData } from '@budget/core';
import { TrendsBars } from '../charts/TrendsBars';
import { TrendsMatrix } from '../charts/TrendsMatrix';
import { monthsRange, todayISO } from '../lib/dates';

// The Trends view: the stacked per-month bars and the category×month matrix share one
// month range (the picker lives in the matrix header; the state lives here).
export function OverviewTrends({ data, hiddenCategoryIds }: { data: LedgerData; hiddenCategoryIds: Set<number> }) {
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const currentYm = todayISO().slice(0, 7);
  let defaultStart = currentYm;
  for (let i = 0; i < 5; i++) defaultStart = previousMonth(defaultStart);

  const displayStart = rangeStart ?? defaultStart;
  const displayEnd = rangeEnd ?? currentYm;
  // A From after the To yields no months — both sections handle the empty range.
  const months = monthsRange(displayStart, displayEnd, 60);
  const isCustomRange = rangeStart !== null || rangeEnd !== null;

  // One ledger pass covers both sections; the month before the range is included as the
  // baseline for the first column's / first bar's vs-last-month figures.
  const totalsByMonth = categoryTotalsByMonth(
    data,
    months.length > 0 ? [previousMonth(months[0]), ...months] : months,
  );

  return (
    <div className="space-y-8">
      <TrendsBars data={data} months={months} totalsByMonth={totalsByMonth} hiddenCategoryIds={hiddenCategoryIds} />
      <TrendsMatrix
        data={data}
        hiddenCategoryIds={hiddenCategoryIds}
        months={months}
        totalsByMonth={totalsByMonth}
        displayStart={displayStart}
        displayEnd={displayEnd}
        isCustomRange={isCustomRange}
        onRangeStart={setRangeStart}
        onRangeEnd={setRangeEnd}
        onResetRange={() => { setRangeStart(null); setRangeEnd(null); }}
      />
    </div>
  );
}
