import { Fragment, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { formatGBP, itemSummaries, type ItemSummary, type LedgerData } from '@budget/core';
import { moneyScale, useChartFrame, useDismissOnOutsideTap } from '../charts/kit';
import { MoneyGrid, SvgBreakdownBox } from '../charts/kitComponents';
import { monthShort } from '../lib/dates';

const TOP_N = 15;

// Raw (un-rounded) drift for sorting; rows display the rounded % of the same figure.
const driftOf = (s: ItemSummary) =>
  s.firstUnitPricePence > 0 ? (s.lastUnitPricePence - s.firstUnitPricePence) / s.firstUnitPricePence : 0;

type SortKey = 'name' | 'bought' | 'lastUnit' | 'drift' | 'total' | 'myShare';
type Sort = { key: SortKey; dir: 'desc' | 'asc' } | null;

const SORT_VALUE: Record<SortKey, (s: ItemSummary) => number | string> = {
  name: (s) => s.name.toLowerCase(),
  bought: (s) => s.timesBought,
  lastUnit: (s) => s.lastUnitPricePence,
  drift: driftOf,
  total: (s) => s.totalPence,
  myShare: (s) => s.totalMyPence,
};

// Cross-time item analytics: every purchase of an item across all saved lists ("how much
// on milk?"), with unit-price drift over time. Analysis-only — reads the persisted item
// rows; the ledger never changes.
export function OverviewItems({ data, hiddenCategoryIds }: { data: LedgerData; hiddenCategoryIds: Set<number> }) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  // Column sort cycles desc → asc → none per header; "none" falls back to the core order
  // (total spend desc). Starts with the Total column explicitly marked.
  const [sort, setSort] = useState<Sort>({ key: 'total', dir: 'desc' });

  const cycleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }));

  const summaries = useMemo(
    () => itemSummaries(data, { excludedCategoryIds: hiddenCategoryIds }),
    [data, hiddenCategoryIds],
  );

  const term = search.trim().toLowerCase();
  const matching = term === '' ? summaries : summaries.filter((s) => s.name.toLowerCase().includes(term));
  const sorted = sort === null
    ? matching
    : [...matching].sort((a, b) => {
        const va = SORT_VALUE[sort.key](a);
        const vb = SORT_VALUE[sort.key](b);
        const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
        return sort.dir === 'desc' ? -cmp : cmp;
      });
  const shown = showAll || term !== '' ? sorted : sorted.slice(0, TOP_N);

  const cat = (id: number) => data.categories.find((c) => c.id === id);

  if (summaries.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">No list items recorded yet — itemised lists feed this view.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-serif text-base text-ink">Items over time</h3>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          aria-label="Search items"
          className="min-w-[10rem] max-w-xs rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm text-ink outline-none focus:border-ink/40"
        />
        <span className="text-xs text-ink-faint">
          {term !== ''
            ? `${matching.length} ${matching.length === 1 ? 'item matches' : 'items match'}`
            : `top ${Math.min(TOP_N, summaries.length)} of ${summaries.length}`}
        </span>
        {term === '' && summaries.length > TOP_N && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs text-ink-muted transition-colors hover:text-accent">
            {showAll ? 'Show top only' : 'Show all'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline bg-panel">
        {/* Six money columns can't all fit a phone without starving the item name, so under sm
            only Item · Last unit · Total show (the price-over-time headline); the rest return
            from sm up, and every column stays reachable via a row's detail panel. Hidden cells
            use display:none so they drop out of the grid, keeping the two column templates aligned. */}
        <div className="sm:min-w-[36rem]">
        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_5rem] sm:grid-cols-[1fr_5rem_6rem_5.5rem_6rem_6rem] items-center gap-2 border-b border-hairline bg-raised/40 px-3 py-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
          {([
            ['name', 'Item', 'text-left', ''],
            ['bought', 'Bought', 'text-right', 'hidden sm:block'],
            ['lastUnit', 'Last unit', 'text-right', ''],
            ['drift', 'Drift', 'text-right', 'hidden sm:block'],
            ['total', 'Total', 'text-right', ''],
            ['myShare', 'Your share', 'text-right', 'hidden sm:block'],
          ] as const).map(([key, label, align, hide]) => (
            <button
              key={key}
              type="button"
              onClick={() => cycleSort(key)}
              aria-sort={sort?.key === key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}
              className={`${align} ${hide} uppercase tracking-wide transition-colors hover:text-accent ${sort?.key === key ? 'font-semibold text-ink-muted' : ''}`}
            >
              {label}
              {sort?.key === key && <span className="ml-0.5">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
            </button>
          ))}
        </div>
        {shown.map((s) => {
          const active = selectedName === s.name.toLowerCase();
          const drift = s.firstUnitPricePence > 0
            ? Math.round(((s.lastUnitPricePence - s.firstUnitPricePence) / s.firstUnitPricePence) * 100)
            : null;
          const driftClass = drift === null || drift === 0 ? 'text-ink-faint' : drift > 0 ? 'text-over' : 'text-under';
          const driftLabel = drift === null || drift === 0 ? '—' : `${drift > 0 ? '+' : ''}${drift}%`;
          const lastCat = cat(s.purchases[s.purchases.length - 1].categoryId);
          return (
            <Fragment key={s.name.toLowerCase()}>
              <button
                type="button"
                onClick={() => setSelectedName(active ? null : s.name.toLowerCase())}
                aria-expanded={active}
                className={`grid w-full grid-cols-[minmax(0,1fr)_4.5rem_5rem] sm:grid-cols-[1fr_5rem_6rem_5.5rem_6rem_6rem] items-center gap-2 border-b border-hairline px-3 py-1.5 text-left text-sm transition-colors hover:bg-raised/40 ${active ? 'bg-raised/60' : ''}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: lastCat?.color }} />
                  <span className={`truncate ${active ? 'font-semibold text-accent' : 'text-ink'}`}>{s.name}</span>
                </span>
                <span className="hidden text-right tabular-nums text-ink-muted sm:block">×{s.timesBought}</span>
                <span className="text-right tabular-nums text-ink">{formatGBP(s.lastUnitPricePence)}</span>
                <span className={`hidden text-right tabular-nums text-xs sm:block ${driftClass}`}>{driftLabel}</span>
                <span className="text-right tabular-nums text-ink">{formatGBP(s.totalPence)}</span>
                <span className="hidden text-right tabular-nums text-ink-muted sm:block">{formatGBP(s.totalMyPence)}</span>
              </button>
              {/* Expand in place directly under the row: the mobile-hidden columns, then the
                  unit-price history — rather than a single detail panel at the list's bottom. */}
              {active && (
                <div className="border-b border-hairline bg-raised/30 px-3 py-3">
                  <dl className="mb-3 grid grid-cols-3 gap-2 text-xs sm:hidden">
                    <div>
                      <dt className="text-ink-faint">Bought</dt>
                      <dd className="tabular-nums text-ink">×{s.timesBought}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Drift</dt>
                      <dd className={`tabular-nums ${driftClass}`}>{driftLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Your share</dt>
                      <dd className="tabular-nums text-ink">{formatGBP(s.totalMyPence)}</dd>
                    </div>
                  </dl>
                  <ItemDetail summary={s} />
                </div>
              )}
            </Fragment>
          );
        })}
        {shown.length === 0 && <p className="px-3 py-4 text-sm text-ink-muted">No items match this search.</p>}
        </div>
      </div>
    </div>
  );
}

// Unit-price history for one item: a stepped line over its purchases (kit frame), a dot per
// purchase, hover for the exact date/qty/price.
function ItemDetail({ summary }: { summary: ItemSummary }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const { ref: wrapRef, frame } = useChartFrame();
  const { W: CHART_W, H: CHART_H, PAD_LEFT, PAD_TOP, PAD_BOTTOM, INNER_W, INNER_H } = frame;
  useDismissOnOutsideTap(hoverIdx !== null, wrapRef, () => setHoverIdx(null));
  const pts = summary.purchases;

  if (pts.length < 2) {
    return (
      <p className="text-sm text-ink-muted">
        <span className="font-medium text-ink">{summary.name}</span> — bought once ({formatGBP(pts[0].unitPricePence)} on {pts[0].date}); no drift to chart yet.
      </p>
    );
  }

  const scale = moneyScale(Math.max(...pts.map((p) => p.unitPricePence)), frame);
  const { y } = scale;
  const x = (i: number) => PAD_LEFT + (pts.length === 1 ? INNER_W / 2 : (i / (pts.length - 1)) * INNER_W);
  // Step path: unit price holds until the next purchase changes it.
  let d = '';
  pts.forEach((p, i) => {
    const px = x(i);
    const py = y(p.unitPricePence);
    d += i === 0 ? `M${px},${py}` : `H${px}V${py}`;
  });
  const labelStep = Math.ceil(pts.length / 10);
  const hovered = hoverIdx !== null ? pts[hoverIdx] : null;

  const seek = (e: ReactPointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const i = Math.round(((svgX - PAD_LEFT) / INNER_W) * (pts.length - 1));
    setHoverIdx(Math.max(0, Math.min(i, pts.length - 1)));
  };

  return (
    <div ref={wrapRef} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="font-serif text-sm text-ink">{summary.name} — unit price over purchases</h4>
        <span className="text-xs text-ink-faint">
          {formatGBP(summary.firstUnitPricePence)} first · {formatGBP(summary.lastUnitPricePence)} latest
        </span>
      </div>
      <svg data-noswipe viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" role="img" aria-label={`Unit price of ${summary.name} over time`}>
        <MoneyGrid scale={scale} frame={frame} />
        {pts.map((p, i) => (
          (i % labelStep === 0 || i === pts.length - 1) && (
            <text key={`x${i}`} x={x(i)} y={CHART_H - 9} textAnchor="middle" className="fill-ink-faint text-[10px] tabular-nums">
              {monthShort(p.date.slice(0, 7))}
            </text>
          )
        ))}
        <path d={d} className="stroke-accent" strokeWidth={1.5} fill="none" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle
            key={`d${i}`}
            cx={x(i)}
            cy={y(p.unitPricePence)}
            r={hoverIdx === i ? 4 : 2.5}
            className="fill-accent"
            stroke="var(--color-panel)"
            strokeWidth={hoverIdx === i ? 1.5 : 0}
          />
        ))}
        {hovered && hoverIdx !== null && (() => {
          const hx = x(hoverIdx);
          const boxX = hx > CHART_W / 2 ? hx - 178 - 10 : hx + 10;
          const hy = y(hovered.unitPricePence);
          const boxY = Math.max(PAD_TOP + 4, Math.min(hy - 29, CHART_H - PAD_BOTTOM - 58));
          return (
            <>
              <line x1={hx} y1={PAD_TOP} x2={hx} y2={y(0)} className="stroke-ink/20" strokeWidth={1} />
              <SvgBreakdownBox
                x={boxX}
                y={boxY}
                title={hovered.date}
                big={`${formatGBP(hovered.unitPricePence)} / unit`}
                sub={`${hovered.quantity} × · ${formatGBP(hovered.pricePence)} total`}
                subClass="fill-ink-faint"
                rows={[]}
              />
            </>
          );
        })()}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={INNER_W}
          height={INNER_H}
          fill="transparent"
          onPointerMove={seek}
          onPointerDown={seek}
          onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHoverIdx(null); }}
        />
      </svg>
    </div>
  );
}
