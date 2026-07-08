import { useState } from 'react';
import { previousMonth } from '@budget/core';
import { monthLabel, monthsRange, todayISO } from '../lib/dates';

// Lives in the same header slot as the Month view's MonthPicker (App.tsx) so the range
// that drives all three Trends charts (bars, lines, matrix) is set from one visible control.
export function TrendsRangePicker({ displayStart, displayEnd, isCustomRange, onRangeStart, onRangeEnd, onResetRange }: {
  displayStart: string;
  displayEnd: string;
  isCustomRange: boolean;
  onRangeStart: (ym: string) => void;
  onRangeEnd: (ym: string) => void;
  onResetRange: () => void;
}) {
  const [showRange, setShowRange] = useState(false);

  const currentYm = todayISO().slice(0, 7);
  let optStart = currentYm;
  for (let i = 0; i < 47; i++) optStart = previousMonth(optStart);
  const monthOptions = monthsRange(optStart, currentYm, 48);

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        className={`text-xs transition-colors hover:text-accent ${isCustomRange ? 'text-accent' : 'text-ink-muted'}`}
        onClick={() => setShowRange((s) => !s)}
      >
        {isCustomRange ? 'Custom range' : '6 months'} {showRange ? '▴' : '▾'}
      </button>
      {showRange && (
        <div className="absolute left-0 top-full z-20 mt-2 flex items-center gap-2 whitespace-nowrap rounded-lg border border-hairline bg-panel p-2 text-xs text-ink-muted shadow-sm sm:left-auto sm:right-0">
          <span>From</span>
          <select
            value={displayStart}
            onChange={(e) => onRangeStart(e.target.value)}
            className="rounded border border-hairline bg-panel px-1.5 py-0.5 text-xs text-ink"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <span>to</span>
          <select
            value={displayEnd}
            onChange={(e) => onRangeEnd(e.target.value)}
            className="rounded border border-hairline bg-panel px-1.5 py-0.5 text-xs text-ink"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          {isCustomRange && (
            <button type="button" onClick={onResetRange} className="text-ink-muted transition-colors hover:text-accent">
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
