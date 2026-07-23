import { categoryTotalsByMonth, previousMonth, type LedgerData } from '@budget/core';
import { TrendsBars } from '../charts/TrendsBars';
import { TrendsLines } from '../charts/TrendsLines';
import { TrendsMatrix } from '../charts/TrendsMatrix';
import { FlowSankey } from '../charts/FlowSankey';
import { monthsRange } from '../lib/dates';

// The Trends view: the stacked per-month bars, the line chart, and the category×month matrix
// share one month range. The range picker itself lives in App.tsx's header (TrendsRangePicker,
// next to the tab switcher) since it affects all three charts, not just the matrix below them.
// Clicking a bar (or a matrix month header) opens that month in the Month view via onOpenMonth.
export function OverviewTrends({ data, hiddenCategoryIds, displayStart, displayEnd, onOpenMonth }: {
  data: LedgerData;
  hiddenCategoryIds: Set<number>;
  displayStart: string;
  displayEnd: string;
  onOpenMonth: (ym: string) => void;
}) {
  // A From after the To yields no months — both sections handle the empty range.
  const months = monthsRange(displayStart, displayEnd, 60);

  // One ledger pass covers both sections; the month before the range is included as the
  // baseline for the first column's / first bar's vs-last-month figures.
  const totalsByMonth = categoryTotalsByMonth(
    data,
    months.length > 0 ? [previousMonth(months[0]), ...months] : months,
  );

  return (
    <div className="space-y-8">
      <TrendsBars data={data} months={months} totalsByMonth={totalsByMonth} hiddenCategoryIds={hiddenCategoryIds} onOpenMonth={onOpenMonth} />
      <TrendsLines data={data} months={months} totalsByMonth={totalsByMonth} hiddenCategoryIds={hiddenCategoryIds} />
      <TrendsMatrix
        data={data}
        hiddenCategoryIds={hiddenCategoryIds}
        months={months}
        totalsByMonth={totalsByMonth}
        onOpenMonth={onOpenMonth}
        displayStart={displayStart}
      />
      {/* The Month tab's money-flow sankey, summed across the whole range: a single-month range is
          identical to the Month tab's, and a wider one totals each stage — so the From savings /
          Left over band reads as the net savings direction over the span. */}
      {months.length > 0 && <FlowSankey data={data} months={months} filterActive={hiddenCategoryIds.size > 0} />}
    </div>
  );
}
