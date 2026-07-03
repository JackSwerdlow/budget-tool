import { useMemo, useState } from 'react';
import { formatGBP, itemSummaries, type ItemSummary, type LedgerData } from '@budget/core';
import { CHART_H, CHART_W, INNER_H, INNER_W, PAD_BOTTOM, PAD_LEFT, PAD_TOP, moneyScale } from '../charts/kit';
import { MoneyGrid, SvgBreakdownBox } from '../charts/kitComponents';
import { monthShort } from '../lib/dates';

const TOP_N = 15;

// Cross-time item analytics: every purchase of an item across all saved lists ("how much
// on milk?"), with unit-price drift over time. Analysis-only — reads the persisted item
// rows; the ledger never changes.
export function OverviewItems({ data, hiddenCategoryIds }: { data: LedgerData; hiddenCategoryIds: Set<number> }) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const summaries = useMemo(
    () => itemSummaries(data, { excludedCategoryIds: hiddenCategoryIds }),
    [data, hiddenCategoryIds],
  );

  const term = search.trim().toLowerCase();
  const matching = term === '' ? summaries : summaries.filter((s) => s.name.toLowerCase().includes(term));
  const shown = showAll || term !== '' ? matching : matching.slice(0, TOP_N);
  const selected = selectedName !== null ? summaries.find((s) => s.name.toLowerCase() === selectedName) ?? null : null;

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
            : `top ${Math.min(TOP_N, summaries.length)} of ${summaries.length} by total spend`}
        </span>
        {term === '' && summaries.length > TOP_N && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs text-ink-muted transition-colors hover:text-accent">
            {showAll ? 'Show top only' : 'Show all'}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-hairline bg-panel">
        <div className="grid grid-cols-[1fr_5rem_6rem_5.5rem_6rem_6rem] items-center gap-2 border-b border-hairline bg-raised/40 px-3 py-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
          <span>Item</span>
          <span className="text-right">Bought</span>
          <span className="text-right">Last unit</span>
          <span className="text-right">Drift</span>
          <span className="text-right">Total</span>
          <span className="text-right">Your share</span>
        </div>
        {shown.map((s) => {
          const active = selected?.name === s.name;
          const drift = s.firstUnitPricePence > 0
            ? Math.round(((s.lastUnitPricePence - s.firstUnitPricePence) / s.firstUnitPricePence) * 100)
            : null;
          const lastCat = cat(s.purchases[s.purchases.length - 1].categoryId);
          return (
            <button
              key={s.name.toLowerCase()}
              type="button"
              onClick={() => setSelectedName(active ? null : s.name.toLowerCase())}
              aria-expanded={active}
              className={`grid w-full grid-cols-[1fr_5rem_6rem_5.5rem_6rem_6rem] items-center gap-2 border-b border-hairline px-3 py-1.5 text-left text-sm transition-colors last:border-b-0 hover:bg-raised/40 ${active ? 'bg-raised/60' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: lastCat?.color }} />
                <span className={`truncate ${active ? 'font-semibold text-accent' : 'text-ink'}`}>{s.name}</span>
              </span>
              <span className="text-right tabular-nums text-ink-muted">×{s.timesBought}</span>
              <span className="text-right tabular-nums text-ink">{formatGBP(s.lastUnitPricePence)}</span>
              <span className={`text-right tabular-nums text-xs ${drift === null || drift === 0 ? 'text-ink-faint' : drift > 0 ? 'text-over' : 'text-under'}`}>
                {drift === null || drift === 0 ? '—' : `${drift > 0 ? '+' : ''}${drift}%`}
              </span>
              <span className="text-right tabular-nums text-ink">{formatGBP(s.totalPence)}</span>
              <span className="text-right tabular-nums text-ink-muted">{formatGBP(s.totalMyPence)}</span>
            </button>
          );
        })}
        {shown.length === 0 && <p className="px-3 py-4 text-sm text-ink-muted">No items match this search.</p>}
      </div>

      {selected && <ItemDetail summary={selected} />}
    </div>
  );
}

// Unit-price history for one item: a stepped line over its purchases (kit frame), a dot per
// purchase, hover for the exact date/qty/price.
function ItemDetail({ summary }: { summary: ItemSummary }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pts = summary.purchases;

  if (pts.length < 2) {
    return (
      <p className="text-sm text-ink-muted">
        <span className="font-medium text-ink">{summary.name}</span> — bought once ({formatGBP(pts[0].unitPricePence)} on {pts[0].date}); no drift to chart yet.
      </p>
    );
  }

  const scale = moneyScale(Math.max(...pts.map((p) => p.unitPricePence)), 500);
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <h4 className="font-serif text-sm text-ink">{summary.name} — unit price over purchases</h4>
        <span className="text-xs text-ink-faint">
          {formatGBP(summary.firstUnitPricePence)} first · {formatGBP(summary.lastUnitPricePence)} latest
        </span>
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" role="img" aria-label={`Unit price of ${summary.name} over time`}>
        <MoneyGrid scale={scale} />
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
          onMouseMove={(e) => {
            const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * CHART_W;
            const i = Math.round(((svgX - PAD_LEFT) / INNER_W) * (pts.length - 1));
            setHoverIdx(Math.max(0, Math.min(i, pts.length - 1)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        />
      </svg>
    </div>
  );
}
