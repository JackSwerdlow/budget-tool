import { useState } from 'react';
import { formatGBP, previousMonth, type LedgerData } from '@budget/core';
import { monthLabel, monthShort, todayISO } from '../lib/dates';
import { BOX_W, boxHeight, moneyScale, useChartFrame, useDismissOnOutsideTap } from './kit';
import { MoneyGrid, SvgBreakdownBox } from './kitComponents';

type Series = { id: number; name: string; color: string; values: number[] };

// Per-month lines under the stacked bars: the bars show composition, these show slope —
// whether a group (click it: its categories, donut-style; "‹ all groups" collapses) has
// been rising or falling across the range. Same months/totals/filter as the other two
// Trends sections.
export function TrendsLines({ data, months, totalsByMonth, hiddenCategoryIds }: {
  data: LedgerData;
  months: string[];
  totalsByMonth: ReadonlyMap<string, Map<number, number>>;
  hiddenCategoryIds: Set<number>;
}) {
  const [drillGroupId, setDrillGroupId] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [emphasisId, setEmphasisId] = useState<number | null>(null);
  const { ref: wrapRef, frame } = useChartFrame();
  const { W: CHART_W, H: CHART_H, PAD_LEFT, PAD_TOP, PAD_BOTTOM, INNER_W, INNER_H } = frame;
  useDismissOnOutsideTap(hoveredIdx !== null, wrapRef, () => setHoveredIdx(null));

  const currentYm = todayISO().slice(0, 7);
  if (months.length === 0) return null;

  const visibleCats = (groupId: number) =>
    data.categories.filter((c) => c.group_id === groupId && !hiddenCategoryIds.has(c.id));
  const monthValue = (m: string, catIds: number[]) => {
    const totals = totalsByMonth.get(m) ?? new Map<number, number>();
    return catIds.reduce((s, id) => s + (totals.get(id) ?? 0), 0);
  };
  const toSeries = (rows: { id: number; name: string; color: string; catIds: number[] }[]): Series[] =>
    rows
      .map((r) => ({ id: r.id, name: r.name, color: r.color, values: months.map((m) => monthValue(m, r.catIds)) }))
      .filter((s) => s.values.some((v) => v > 0));

  const groupSeries = toSeries(
    data.groups.map((g) => ({ id: g.id, name: g.name, color: g.color, catIds: visibleCats(g.id).map((c) => c.id) })),
  );
  const drillGroup = data.groups.find((g) => g.id === drillGroupId) ?? null;
  const categorySeries = drillGroup
    ? toSeries(visibleCats(drillGroup.id).map((c) => ({ id: c.id, name: c.name, color: c.color, catIds: [c.id] })))
    : [];
  // A filter change can empty the drilled group — fall back to the groups view.
  const drilled = drillGroup !== null && categorySeries.length > 0;
  const series = drilled ? categorySeries : groupSeries;
  if (groupSeries.length === 0) return null;

  const dataMax = Math.max(...series.flatMap((s) => s.values));
  const scale = moneyScale(dataMax, frame);
  const { y } = scale;
  const band = INNER_W / months.length;
  const cx = (i: number) => PAD_LEFT + i * band + band / 2;
  const labelStep = Math.ceil(months.length / 12);

  // The last segment is dashed when it runs into the half-finished current month, so a
  // "everything is plummeting" tail reads as incomplete data, not a trend.
  const lastIsCurrent = months[months.length - 1] === currentYm && months.length > 1;
  const solidCount = lastIsCurrent ? months.length - 1 : months.length;
  const pointsOf = (s: Series, from: number, to: number) =>
    s.values.slice(from, to).map((v, i) => `${cx(from + i)},${y(v)}`).join(' ');

  // Baseline for the first month's tooltip delta: the month before the range (as the
  // bars/matrix do).
  const prevYm = previousMonth(months[0]);
  const prevValue = (s: Series) =>
    drilled ? monthValue(prevYm, [s.id]) : monthValue(prevYm, visibleCats(s.id).map((c) => c.id));

  const hovered = hoveredIdx !== null
    ? (() => {
        const i = hoveredIdx;
        const rows = series
          .map((s) => ({ s, value: s.values[i], delta: s.values[i] - (i > 0 ? s.values[i - 1] : prevValue(s)) }))
          .filter((r) => r.value > 0 || r.delta !== 0)
          .sort((a, b) => b.value - a.value);
        const total = series.reduce((sum, s) => sum + s.values[i], 0);
        const prevTotal = series.reduce((sum, s) => sum + (i > 0 ? s.values[i - 1] : prevValue(s)), 0);
        return { i, ym: months[i], total, delta: total - prevTotal, rows };
      })()
    : null;
  const boxH = boxHeight(hovered?.rows.length ?? 0);
  const deltaClass = (d: number) => (d > 0 ? 'fill-under' : d < 0 ? 'fill-accent' : 'fill-ink-faint');

  const lineOpacity = (id: number) => (emphasisId === null ? 1 : emphasisId === id ? 1 : 0.25);

  return (
    <div ref={wrapRef} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h3 className="font-serif text-base text-ink">Category trend</h3>
          {drilled ? (
            <span className="flex items-baseline gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDrillGroupId(null)}
                className="text-ink-muted transition-colors hover:text-accent"
              >
                ‹ all groups
              </button>
              <span className="text-ink-faint">{drillGroup!.name}</span>
            </span>
          ) : (
            <span className="text-xs text-ink-faint">click a group for its categories</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {series.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={drilled}
              onClick={() => setDrillGroupId(s.id)}
              onMouseEnter={() => setEmphasisId(s.id)}
              onMouseLeave={() => setEmphasisId(null)}
              className={`flex items-center gap-1.5 text-xs text-ink-muted transition-colors ${drilled ? '' : 'hover:text-ink'}`}
              style={{ opacity: lineOpacity(s.id) }}
              aria-label={drilled ? s.name : `Show ${s.name}'s categories`}
            >
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHoveredIdx(null); }}
        role="img"
        aria-label={`${drilled ? `${drillGroup!.name} categories` : 'Group'} spend trend by month${hiddenCategoryIds.size > 0 ? ', filtered' : ''}`}
      >
        <MoneyGrid scale={scale} frame={frame} />

        {months.map((m, i) => (
          (i % labelStep === 0 || i === months.length - 1) && (
            <text key={`x${m}`} x={cx(i)} y={CHART_H - 9} textAnchor="middle" className="fill-ink-faint text-[10px] tabular-nums">
              {monthShort(m)}
              {m === currentYm && <tspan className="fill-accent">*</tspan>}
            </text>
          )
        ))}

        {/* crosshair on the hovered month */}
        {hovered && (
          <line x1={cx(hovered.i)} y1={PAD_TOP} x2={cx(hovered.i)} y2={PAD_TOP + INNER_H} className="stroke-ink/20" strokeWidth={1} />
        )}

        {/* per-month hover columns — under the lines so their fat hit-strokes still win
           when the pointer is on a line */}
        {months.map((m, i) => (
          <rect
            key={`h${m}`}
            x={PAD_LEFT + i * band}
            y={PAD_TOP}
            width={band}
            height={INNER_H}
            fill="transparent"
            onPointerEnter={(e) => { if (e.pointerType !== 'touch') setHoveredIdx(i); }}
            onPointerDown={() => setHoveredIdx(i)}
          />
        ))}

        {/* one line per series (running-chart stroke), dashed into the incomplete month */}
        {series.map((s) => (
          <g key={s.id} opacity={lineOpacity(s.id)} className="transition-opacity">
            <polyline
              points={pointsOf(s, 0, solidCount)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {lastIsCurrent && (
              <polyline
                points={pointsOf(s, solidCount - 1, months.length)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="2 4"
              />
            )}
            {/* invisible fat stroke: hover emphasis + click-to-drill at group level */}
            <polyline
              points={pointsOf(s, 0, months.length)}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              className={drilled ? '' : 'cursor-pointer'}
              role={drilled ? undefined : 'button'}
              aria-label={drilled ? undefined : `Show ${s.name}'s categories`}
              onPointerEnter={(e) => { if (e.pointerType !== 'touch') setEmphasisId(s.id); }}
              onPointerLeave={(e) => { if (e.pointerType !== 'touch') setEmphasisId(null); }}
              onPointerMove={(e) => {
                // The fat stroke sits above the month columns, so it keeps the month
                // tooltip alive itself: map the pointer back through the viewBox scale.
                const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                if (!r) return;
                const vx = ((e.clientX - r.left) / r.width) * CHART_W;
                const i = Math.floor((vx - PAD_LEFT) / band);
                setHoveredIdx(Math.max(0, Math.min(months.length - 1, i)));
              }}
              onClick={() => { if (!drilled) setDrillGroupId(s.id); }}
            />
            {hovered && (
              <circle
                cx={cx(hovered.i)}
                cy={y(s.values[hovered.i])}
                r={4.5}
                fill={s.color}
                stroke="var(--color-panel)"
                strokeWidth={2}
                className="pointer-events-none"
              />
            )}
          </g>
        ))}

        {hovered && (() => {
          const boxX = cx(hovered.i) > CHART_W / 2 ? cx(hovered.i) - BOX_W - 12 : cx(hovered.i) + 12;
          const boxY = Math.max(PAD_TOP + 4, Math.min(y(hovered.total) - boxH / 2, CHART_H - PAD_BOTTOM - boxH));
          return (
            <SvgBreakdownBox
              x={boxX}
              y={boxY}
              title={`${monthLabel(hovered.ym)}${drilled ? ` · ${drillGroup!.name}` : ''}`}
              big={formatGBP(hovered.total)}
              sub={hovered.delta !== 0 ? `${hovered.delta > 0 ? '+' : ''}${formatGBP(hovered.delta)} vs last month` : '— vs last month'}
              subClass={deltaClass(hovered.delta)}
              rows={hovered.rows.map((r) => ({
                key: r.s.id,
                color: r.s.color,
                name: r.s.name,
                value: formatGBP(r.value),
                extra: r.delta !== 0 ? `${r.delta > 0 ? '+' : ''}${formatGBP(r.delta)}` : '—',
                extraClass: deltaClass(r.delta),
              }))}
            />
          );
        })()}
      </svg>
    </div>
  );
}
