import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Category, Group } from '@budget/core';

// Row gap of the chip container below (gap-0.5 = 2px), needed to predict whether a pulled-down
// pair actually fits on one line.
const CHIP_GAP = 2;

type RowLayout = { breakAt: number | null; first: boolean[]; last: boolean[] };

const sameFlags = (a: boolean[], b: boolean[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// One group's chips: an M3 "connected" button group, single-select. Buttons keep individual tonal
// fills and 2dp gaps; the ends of a row stay fully rounded on their outer edge, inner buttons rest
// as slightly-rounded squares and morph to a larger radius when selected.
//
// A connected group is a single-row component in both M3 and the HIG — this one wraps, because the
// taxonomy is user-defined and unbounded — so the two things that follow from wrapping are handled
// by measuring the laid-out rows:
//
//   - **Corners come from a button's visual row, not its index in the array.** Otherwise a wrapped
//     row's end keeps square inner corners and the next row's first button opens the wrong side.
//   - **A last row holding one lone chip pulls its neighbour down for company** (3,3,1 → 3,2,2), by
//     forcing a line break in front of it. Skipped when the two wouldn't fit on a line together,
//     which would just re-orphan the second one.
//
// Neither changes any height, so there's no scroll-feedback loop of the kind MOBILE.md warns about.
// The decision is always taken from the *natural* layout — the forced break is hidden for the
// measurement — so it can't re-trigger itself, and re-running it converges on the same answer.
function CategoryChipRow({ group, cats, selectedId, onSelect }: {
  group: Group;
  cats: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<RowLayout>({ breakAt: null, first: [], last: [] });

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const spacer = spacerRef.current;
    if (spacer) spacer.style.display = 'none';
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>(':scope > button'));
    const tops = buttons.map((b) => b.offsetTop);
    const widths = buttons.map((b) => b.offsetWidth);
    const available = el.clientWidth;
    if (spacer) spacer.style.display = '';
    const n = buttons.length;
    if (n === 0) return;

    // Visual rows: a new one starts wherever offsetTop changes.
    const rows: number[][] = [];
    tops.forEach((top, i) => {
      if (i === 0 || top !== tops[i - 1]) rows.push([i]);
      else rows[rows.length - 1].push(i);
    });

    let breakAt: number | null = null;
    // The +1 is slop: offsetWidth is integer-rounded, so a pair that measures as an exact fit can
    // still overflow by a fraction and re-orphan the second chip. Erring towards leaving it alone.
    if (rows.length > 1 && rows[rows.length - 1].length === 1
        && widths[n - 2] + widths[n - 1] + CHIP_GAP + 1 <= available) {
      breakAt = n - 2;
      // Everything before the break wraps exactly as it did — wrapping is greedy from the left, so
      // taking the last chip off a row can't disturb the rows above it.
      rows[rows.length - 2] = rows[rows.length - 2].slice(0, -1);
      rows[rows.length - 1] = [n - 2, n - 1];
    }

    const first = new Array<boolean>(n).fill(false);
    const last = new Array<boolean>(n).fill(false);
    for (const row of rows) {
      if (row.length === 0) continue;
      first[row[0]] = true;
      last[row[row.length - 1]] = true;
    }
    setLayout((prev) =>
      prev.breakAt === breakAt && sameFlags(prev.first, first) && sameFlags(prev.last, last)
        ? prev
        : { breakAt, first, last });
  }, []);

  // Re-measure on width changes and whenever the chips themselves change (filter, taxonomy edit).
  const signature = cats.map((c) => `${c.id}:${c.name}`).join('|');
  useLayoutEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, signature]);

  // A late webfont changes chip widths without changing the container, so the observer above never
  // fires for it.
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => { if (!cancelled) measure(); });
    return () => { cancelled = true; };
  }, [measure]);

  return (
    <div ref={containerRef} className="flex flex-wrap gap-0.5">
      {cats.map((c, i) => {
        const selected = c.id === selectedId;
        // Before the first measurement, fall back to array position for one frame.
        const isFirst = layout.first.length === cats.length ? layout.first[i] : i === 0;
        const isLast = layout.last.length === cats.length ? layout.last[i] : i === cats.length - 1;
        const roundedClass = isFirst && isLast
          ? selected ? 'rounded-full' : 'rounded-md'
          : isFirst
            ? selected ? 'rounded-full' : 'rounded-l-full'
            : isLast
              ? selected ? 'rounded-full' : 'rounded-r-full'
              : selected
                ? 'rounded-xl'
                : 'rounded-md';
        return (
          <Fragment key={c.id}>
            {layout.breakAt === i && <div ref={spacerRef} aria-hidden className="h-0 basis-full" />}
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              aria-pressed={selected}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-all duration-100 ${roundedClass} ${
                selected ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}
              style={{
                backgroundColor: selected
                  ? `color-mix(in srgb, ${c.color} 32%, var(--color-panel))`
                  : `color-mix(in srgb, ${group.color} 18%, var(--color-panel))`,
                boxShadow: selected ? `inset 0 0 0 1px ${c.color}` : undefined,
              }}
            >
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
              {c.name}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

export function CategoryGrid({
  groups,
  categories,
  selectedId,
  onSelect,
  filter = '',
}: {
  groups: Group[];
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  filter?: string;
}) {
  const q = filter.trim().toLowerCase();
  const matches = (c: Category) => q === '' || c.name.toLowerCase().includes(q);
  const visibleGroups = groups
    .map((group) => ({ group, cats: categories.filter((c) => c.group_id === group.id && matches(c)) }))
    .filter((g) => g.cats.length > 0);

  if (visibleGroups.length === 0) {
    return <p className="text-sm text-ink-muted">No category matches “{filter.trim()}”.</p>;
  }

  return (
    <div className="flex flex-col gap-y-4">
      {visibleGroups.map(({ group, cats }) => (
        <div key={group.id}>
          <div className="mb-2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
            <span className="text-xs uppercase tracking-wide text-ink-faint">{group.name}</span>
          </div>
          <CategoryChipRow group={group} cats={cats} selectedId={selectedId} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
