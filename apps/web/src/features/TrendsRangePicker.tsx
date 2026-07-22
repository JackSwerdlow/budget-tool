import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { monthAbbr, todayISO } from '../lib/dates';

// Lives in the same header slot as the Month view's MonthPicker (PinnedTabBar's right slot, see
// App.tsx) and wears the same box, so the two sub-tabs' controls read as one control in one place.
// The range drives all three Trends charts (bars, lines, matrix).
//
// The panel is a month-grid range calendar — the booking-site / BI-tool convention, in months
// because the whole app buckets by month. Selection is two taps: the first anchors a new range,
// the second closes it (either order — the ends sort themselves). A pair of from/to selects, which
// this replaced, is the *custom* branch of that pattern rather than the whole control.

// How far back the grid can page. Matches the 48-month window the old select offered.
const YEARS_BACK = 3;

// "Apr–Sep 26", or "Apr 25–Sep 26" when the range spans years. Compact by default because this
// sits beside the sub-tabs in a row that must not wrap; `long` spells the year out from sm up.
function rangeLabel(start: string, end: string, long: boolean): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const year = (ym: string) => (long ? ym.slice(0, 4) : ym.slice(2, 4));
  const from = sameYear ? monthAbbr(start) : `${monthAbbr(start)} ${year(start)}`;
  return `${from}${long ? ' – ' : '–'}${monthAbbr(end)} ${year(end)}`;
}

export function TrendsRangePicker({ displayStart, displayEnd, isCustomRange, monthsWithSpend, onRangeStart, onRangeEnd, onResetRange }: {
  displayStart: string;
  displayEnd: string;
  isCustomRange: boolean;
  // Months holding any entry or list. The rest are faded — still selectable, since a range may
  // legitimately span a quiet stretch, but visibly not worth extending a range over.
  monthsWithSpend: Set<string>;
  onRangeStart: (ym: string) => void;
  onRangeEnd: (ym: string) => void;
  onResetRange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const currentYm = todayISO().slice(0, 7);
  const [year, setYear] = useState(() => Number(displayEnd.slice(0, 4)));
  // The first tap of a pair. Non-null means "half-picked": the grid previews from here.
  const [anchor, setAnchor] = useState<string | null>(null);
  // Mouse-only preview of the range the second tap would produce. Never set by touch.
  const [hover, setHover] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [shiftX, setShiftX] = useState(0);

  // The trigger can sit at either edge of the header row, so a fixed left/right anchor always
  // overflows on one side on a phone. Measure the panel once it opens (at shiftX 0, reset on
  // close) and nudge it horizontally so it clears both viewport edges. max-w keeps it narrower
  // than the viewport, so a single translate can always fit it.
  useLayoutEffect(() => {
    if (!open) { setShiftX(0); return; }
    const el = popRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    if (rect.left < margin) setShiftX(margin - rect.left);
    else if (rect.right > window.innerWidth - margin) setShiftX(window.innerWidth - margin - rect.right);
  }, [open]);

  // Dismiss on a tap outside or Escape, and abandon a half-picked range with it — leaving an
  // anchor behind would make the next open's first tap mean something different.
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setAnchor(null); setHover(null); };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const maxYear = Number(currentYm.slice(0, 4));
  const minYear = maxYear - YEARS_BACK;

  function toggle() {
    setOpen((was) => {
      if (was) { setAnchor(null); setHover(null); return false; }
      setYear(Number(displayEnd.slice(0, 4)));
      return true;
    });
  }

  function pick(ym: string) {
    if (anchor === null) {
      setAnchor(ym);
      return;
    }
    const [from, to] = anchor <= ym ? [anchor, ym] : [ym, anchor];
    onRangeStart(from);
    onRangeEnd(to);
    setAnchor(null);
    setHover(null);
    // Deliberately stays open: the charts behind it are already live, so you can judge the range
    // you just picked and adjust it without reopening. Tapping outside is what dismisses it.
  }

  // What the grid paints: the committed range, or — mid-pick — the anchor alone on touch and the
  // anchor→cursor band on a mouse.
  const [bandStart, bandEnd] = anchor === null
    ? [displayStart, displayEnd]
    : hover === null
      ? [anchor, anchor]
      : anchor <= hover ? [anchor, hover] : [hover, anchor];

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-1.5 sm:gap-2">
      {/* "Reset" sits to the LEFT of the box, exactly where MonthPicker puts "Today" — the bar
          right-aligns this whole control, so a button on the right would shove the box sideways
          the moment the range stops being the default. */}
      {isCustomRange && (
        <button
          type="button"
          onClick={() => { onResetRange(); setOpen(false); setAnchor(null); }}
          className="text-xs text-ink-muted transition-colors hover:text-accent"
        >
          Reset
        </button>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-raised px-2 py-1 font-serif text-sm text-ink transition-colors hover:border-hairline-strong sm:px-3 sm:py-1.5"
      >
        {/* Abbreviated on a phone, spelled out from sm up — the same split as the month box, whose
            width this deliberately sits close to so the slot doesn't jump between sub-tabs. */}
        <span className="min-w-[4.75rem] text-center sm:hidden">{rangeLabel(displayStart, displayEnd, false)}</span>
        <span className="hidden text-center sm:inline sm:min-w-[8.5rem]">{rangeLabel(displayStart, displayEnd, true)}</span>
        <span className="text-xs text-ink-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div
          ref={popRef}
          style={{ transform: shiftX ? `translateX(${shiftX}px)` : undefined }}
          className="absolute right-0 top-full z-20 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-lg border border-hairline bg-panel p-2 shadow-sm"
        >
          <div className="flex items-center justify-between px-1 pb-1.5">
            <button
              type="button"
              aria-label="Previous year"
              disabled={year <= minYear}
              onClick={() => setYear((y) => y - 1)}
              className="px-2 text-ink-muted transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-muted"
            >
              ‹
            </button>
            <span className="font-serif text-sm text-ink">{year}</span>
            <button
              type="button"
              aria-label="Next year"
              disabled={year >= maxYear}
              onClick={() => setYear((y) => y + 1)}
              className="px-2 text-ink-muted transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-muted"
            >
              ›
            </button>
          </div>
          {/* No column gap: the in-range months have to touch to read as one band across a row.
              Rows are separated instead, which is how month-grid range pickers look. */}
          <div className="grid grid-cols-3 gap-y-1">
            {months.map((ym) => {
              const future = ym > currentYm;
              const isStart = ym === bandStart;
              const isEnd = ym === bandEnd;
              const inBand = ym > bandStart && ym < bandEnd;
              // Faded when the month holds nothing — a quiet stretch is then obvious before you
              // pick across it. Future months fade harder, since those can't be picked at all.
              const dim = future ? 'opacity-30' : monthsWithSpend.has(ym) ? '' : 'opacity-50';
              return (
                <button
                  key={ym}
                  type="button"
                  disabled={future}
                  aria-pressed={isStart || isEnd}
                  onClick={() => pick(ym)}
                  onMouseEnter={() => { if (anchor !== null) setHover(ym); }}
                  onMouseLeave={() => setHover(null)}
                  className={`py-1.5 text-center text-xs transition-colors ${dim} ${
                    isStart && isEnd
                      ? 'rounded-md bg-accent text-panel'
                      : isStart
                        ? 'rounded-l-md bg-accent text-panel'
                        : isEnd
                          ? 'rounded-r-md bg-accent text-panel'
                          : inBand
                            ? 'bg-accent/15 text-ink'
                            : 'text-ink-muted enabled:hover:text-ink'
                  }`}
                >
                  {monthAbbr(ym)}
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-hairline px-1 pt-1.5 text-xs">
            <span className="text-ink-muted">
              {anchor === null ? rangeLabel(displayStart, displayEnd, true) : 'Pick an end month'}
            </span>
            {isCustomRange && (
              <button
                type="button"
                onClick={() => { onResetRange(); setAnchor(null); setOpen(false); }}
                className="text-ink-muted transition-colors hover:text-accent"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
