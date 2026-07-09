import { useLayoutEffect, useRef, useState } from 'react';
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
  const popRef = useRef<HTMLDivElement>(null);
  const [shiftX, setShiftX] = useState(0);

  // The trigger can wrap to either edge of the header row, so a fixed left/right anchor always
  // overflows on one side on a phone. Measure the panel once it opens (at shiftX 0, reset on
  // close) and nudge it horizontally so it clears both viewport edges. max-w keeps it narrower
  // than the viewport, so a single translate can always fit it.
  useLayoutEffect(() => {
    if (!showRange) { setShiftX(0); return; }
    const el = popRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    if (rect.left < margin) setShiftX(margin - rect.left);
    else if (rect.right > window.innerWidth - margin) setShiftX(window.innerWidth - margin - rect.right);
  }, [showRange]);

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
        <div
          ref={popRef}
          style={{ transform: shiftX ? `translateX(${shiftX}px)` : undefined }}
          className="absolute right-0 top-full z-20 mt-2 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-hairline bg-panel p-2 text-xs text-ink-muted shadow-sm sm:flex-nowrap sm:whitespace-nowrap"
        >
          <span className="flex items-center gap-2">
            From
            <select
              value={displayStart}
              onChange={(e) => onRangeStart(e.target.value)}
              className="rounded border border-hairline bg-panel px-1.5 py-0.5 text-xs text-ink"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </span>
          <span className="flex items-center gap-2">
            to
            <select
              value={displayEnd}
              onChange={(e) => onRangeEnd(e.target.value)}
              className="rounded border border-hairline bg-panel px-1.5 py-0.5 text-xs text-ink"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </span>
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
