import { useRef, useState, type PointerEvent } from 'react';
import { area, curveStepAfter, line } from 'd3-shape';
import {
  formatGBP,
  income,
  monthTotal,
  previousMonth,
  runningCumulativeByGroup,
  type LedgerData,
} from '@budget/core';
import { LineToggle } from '../components/LineToggle';
import { dayOfMonth, daysInMonth, monthAbbr, todayISO } from '../lib/dates';
import { coarsePointer } from '../lib/pointer';
import { SCRUB_SURFACE, useScrubGesture } from '../lib/useScrubGesture';
import { BOX_W, boxHeight, moneyScale, useChartFrame, useDismissOnOutsideTap } from './kit';
import { ChartInspectStrip, MoneyGrid, STRIP_EMPTY, SvgBreakdownBox } from './kitComponents';

type Pt = { day: number; value: number };
type StackPt = { day: number; byGroup: Map<number, number>; total: number };
type BandPt = { day: number; lower: number; upper: number };

// Weekly x ticks starting at 0 (0, 7, 14, …), always ending with the last day of the month.
// Replaces the final weekly tick with the last day if they're only 1 apart (e.g. Feb non-leap).
function dayTicks(days: number): number[] {
  const ticks: number[] = [];
  for (let d = 0; d <= days; d += 7) ticks.push(d);
  if (ticks[ticks.length - 1] !== days) {
    if (days - ticks[ticks.length - 1] <= 1) ticks[ticks.length - 1] = days;
    else ticks.push(days);
  }
  return ticks;
}

export function RunningChart({ data, ym, hiddenCategoryIds }: { data: LedgerData; ym: string; hiddenCategoryIds: Set<number> }) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Width-aware frame, destructured under the frame constants' old names so the chart body
  // reads the same as every fixed-frame chart.
  const { ref: wrapRef, frame } = useChartFrame();
  const { W: CHART_W, H: CHART_H, PAD_LEFT, PAD_RIGHT, PAD_TOP, PAD_BOTTOM, INNER_W, INNER_H } = frame;
  useDismissOnOutsideTap(hoveredDay !== null, wrapRef, () => setHoveredDay(null));
  // Touch shows the scrubbed values in the strip above (not the in-chart box, which would cover
  // the chart under the finger); mouse keeps the follow-cursor box. See MOBILE.md.
  const coarse = coarsePointer();
  // The reference lines are toggleable: hiding one also releases the y-axis from its value
  // (useful when a filtered-down total sits far below income). Last Month starts on; the
  // income lines start off.
  const [showTarget, setShowTarget] = useState(true);
  const [showIncome, setShowIncome] = useState(false);
  const [showAdjIncome, setShowAdjIncome] = useState(false);

  const sumParts = (m: Map<number, number>) => {
    let s = 0;
    for (const v of m.values()) s += v;
    return s;
  };

  const byGroupPoints = runningCumulativeByGroup(data, ym, { excludedCategoryIds: hiddenCategoryIds });
  const target = monthTotal(data, previousMonth(ym), { excludedCategoryIds: hiddenCategoryIds });
  const days = daysInMonth(ym);
  const current = byGroupPoints.length > 0 ? sumParts(byGroupPoints[byGroupPoints.length - 1].cumulativeByGroup) : 0;

  const currentYm = todayISO().slice(0, 7);
  const isCurrentMonth = ym === currentYm;
  const todayDay = isCurrentMonth ? dayOfMonth(todayISO()) : null;

  // The month's income (resolved incl. the default) — drawn as a dashed pace line. Its money is
  // never touched by the category filter, matching Net Balance.
  const incomePence = income(data, ym, currentYm);

  // Adj. Income = income − spend in the hidden categories: "after everything I've filtered out,
  // this is what's left for the categories I'm looking at". Crossing it is exactly the moment
  // TOTAL spend crosses total income (visible > income − hidden ⟺ visible + hidden > income),
  // so the green/red signal stays truthful under a filter. Clamped at £0 (hidden spend alone
  // past income ⇒ nothing left ⇒ red via the un-clamped comparison). Only offered while it
  // actually differs from Income.
  const hiddenSpend = monthTotal(data, ym) - monthTotal(data, ym, { excludedCategoryIds: hiddenCategoryIds });
  const adjIncomeRaw = incomePence - hiddenSpend;
  const adjIncome = Math.max(0, adjIncomeRaw);
  const hasAdjIncome = incomePence > 0 && hiddenSpend > 0;

  const targetVisible = showTarget && target > 0;
  const incomeVisible = showIncome && incomePence > 0;
  const adjIncomeVisible = showAdjIncome && hasAdjIncome;

  const dataMax = Math.max(current, targetVisible ? target : 0, incomeVisible ? incomePence : 0, adjIncomeVisible ? adjIncome : 0);
  const scale = moneyScale(dataMax, frame);
  const { y } = scale;
  const x = (day: number) => PAD_LEFT + (day / days) * INNER_W;
  const xTicks = dayTicks(days);

  // All reference labels sit at the left end (away from the line, which is highest on the
  // right); when lines run close together, a later label slides right past the earlier ones
  // instead of overlapping them (placed in Last Month → Income → Adj. Income order).
  const placedLabels: { x: number; w: number; lineY: number }[] = [];
  const placeLabel = (lineY: number, w: number) => {
    let xPos = PAD_LEFT + 3.5;
    for (const p of placedLabels) {
      if (Math.abs(p.lineY - lineY) < 18) xPos = Math.max(xPos, p.x + p.w + 8);
    }
    placedLabels.push({ x: xPos, w, lineY });
    return xPos;
  };
  const targetLabel = `Last Month:  ${formatGBP(target)}`;
  const targetLabelW = Math.ceil(targetLabel.length * 5.35);
  const incomeLabel = `Income:  ${formatGBP(incomePence)}`;
  const incomeLabelW = Math.ceil(incomeLabel.length * 5.35);
  const adjIncomeLabel = `Adj. Income:  ${formatGBP(adjIncome)}`;
  const adjIncomeLabelW = Math.ceil(adjIncomeLabel.length * 5.35);
  const targetLabelX = targetVisible ? placeLabel(y(target), targetLabelW) : 0;
  const incomeLabelX = incomeVisible ? placeLabel(y(incomePence), incomeLabelW) : 0;
  const adjIncomeLabelX = adjIncomeVisible ? placeLabel(y(adjIncome), adjIncomeLabelW) : 0;

  const pts: StackPt[] = [
    { day: 0, byGroup: new Map(), total: 0 },
    ...byGroupPoints.map((p) => ({
      day: dayOfMonth(p.date),
      byGroup: p.cumulativeByGroup,
      total: sumParts(p.cumulativeByGroup),
    })),
  ];

  // Extend flat line: current month → today; past months → last day of month.
  const lineEndDay = isCurrentMonth ? (todayDay ?? 1) : days;
  if (pts[pts.length - 1].day < lineEndDay) pts.push({ ...pts[pts.length - 1], day: lineEndDay });

  const series: Pt[] = pts.map((p) => ({ day: p.day, value: p.total }));

  // Step, not smoothed: a cumulative total is factually flat between spends — the line jumps
  // ("impulse") on the day of a spend and holds level until the next one.
  const lineGen = line<Pt>().x((d) => x(d.day)).y((d) => y(d.value)).curve(curveStepAfter);
  const linePath = lineGen(series) ?? '';

  // The fill under the line is a stack of per-group bands (donut order, donut colours), so the
  // area's make-up mirrors the grouping donut's proportions at every day.
  const lastByGroup = pts[pts.length - 1].byGroup;
  const stackGroups = data.groups.filter((g) => (lastByGroup.get(g.id) ?? 0) > 0);
  const bands = stackGroups.map((group) => ({ group, pts: [] as BandPt[] }));
  for (const p of pts) {
    let lower = 0;
    for (const b of bands) {
      const v = p.byGroup.get(b.group.id) ?? 0;
      b.pts.push({ day: p.day, lower, upper: lower + v });
      lower += v;
    }
  }
  const bandGen = area<BandPt>().x((d) => x(d.day)).y0((d) => y(d.lower)).y1((d) => y(d.upper)).curve(curveStepAfter);

  // Build a dense day-by-day value array (carry-forward on empty days) for hover.
  const maxHoverDay = lineEndDay;
  const sparseByDay = new Map(series.map((pt) => [pt.day, pt.value]));
  const denseByDay: number[] = [];
  let carry = 0;
  for (let d = 1; d <= maxHoverDay; d++) {
    if (sparseByDay.has(d)) carry = sparseByDay.get(d)!;
    denseByDay[d] = carry;
  }

  // A horizontal position (0–1 across the chart, or a mouse event) → the day under it.
  const dayAtFraction = (fraction: number) => {
    const rawDay = ((fraction * CHART_W - PAD_LEFT) / INNER_W) * days;
    return Math.max(1, Math.min(Math.round(rawDay), maxHoverDay));
  };
  const handlePointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
    setHoveredDay(dayAtFraction((e.clientX - rect.left) / rect.width));
  };
  // Touch: press-and-hold to arm, then drag across the full chart width (see useScrubGesture).
  const scrub = useScrubGesture(
    svgRef,
    (fraction) => setHoveredDay(dayAtFraction(fraction)),
    () => setHoveredDay(null),
  );

  const hoveredPt = hoveredDay !== null ? { day: hoveredDay, value: denseByDay[hoveredDay] } : null;
  // Day 1's baseline is £0, so its delta is simply that day's cumulative.
  const delta = hoveredDay !== null
    ? denseByDay[hoveredDay] - (hoveredDay > 1 ? denseByDay[hoveredDay - 1] : 0)
    : null;
  // The strip idles on the latest point (today, or month-end for a past month) rather than a bare
  // headline, so arming the scrub changes its numbers but never its height.
  const stripDay = hoveredDay ?? maxHoverDay;

  // Per-group make-up of the hovered day's cumulative (carry-forward, same as denseByDay),
  // with each group's own day delta — the deltas sum exactly to the top +delta figure.
  const byGroupAt = (day: number) => {
    let m: Map<number, number> = new Map();
    for (const p of pts) {
      if (p.day <= day) m = p.byGroup;
      else break;
    }
    return m;
  };
  // Every stacked group, spend or not — the strip needs a constant row set (see
  // ChartInspectStrip); the mouse box filters the empties back out below.
  const groupRowsAt = (day: number) => {
    const m = byGroupAt(day);
    const prev = day > 1 ? byGroupAt(day - 1) : new Map<number, number>();
    return stackGroups.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      value: m.get(g.id) ?? 0,
      delta: (m.get(g.id) ?? 0) - (prev.get(g.id) ?? 0),
    }));
  };
  const hoverByGroup = hoveredDay !== null ? groupRowsAt(hoveredDay).filter((r) => r.value > 0) : [];
  const boxH = boxHeight(hoverByGroup.length);

  const monthName = monthAbbr(ym);

  return (
    <div ref={wrapRef} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="font-serif text-base text-ink">Running total</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {target > 0 && (
              <LineToggle
                label="Last Month"
                pressed={showTarget}
                color={current <= target ? 'var(--color-under)' : 'var(--color-over)'}
                onClick={() => setShowTarget((s) => !s)}
              />
            )}
            {incomePence > 0 && (
              <LineToggle
                label="Income"
                pressed={showIncome}
                color={current <= incomePence ? 'var(--color-under)' : 'var(--color-over)'}
                onClick={() => setShowIncome((s) => !s)}
              />
            )}
            {hasAdjIncome && (
              <LineToggle
                label="Adj. Income"
                pressed={showAdjIncome}
                color={current <= adjIncomeRaw ? 'var(--color-under)' : 'var(--color-over)'}
                onClick={() => setShowAdjIncome((s) => !s)}
              />
            )}
          </div>
          <span className="text-sm text-ink-muted">
            {formatGBP(current)} <span className="text-ink-faint">so far</span>
          </span>
        </div>
      </div>
      {coarse && (() => {
        const stripDelta = denseByDay[stripDay] - (stripDay > 1 ? denseByDay[stripDay - 1] : 0);
        return (
          <ChartInspectStrip
            active={scrub.armed}
            title={`${stripDay} ${monthName}`}
            value={formatGBP(denseByDay[stripDay])}
            delta={stripDelta !== 0 ? `${stripDelta > 0 ? '+' : ''}${formatGBP(stripDelta)}` : STRIP_EMPTY}
            // The cumulative's day-on-day step is just that day's own spend — clearer said
            // that way round than as "vs the previous day".
            deltaLabel="spent that day"
            deltaClass={stripDelta > 0 ? 'text-accent' : 'text-ink-faint'}
            rows={groupRowsAt(stripDay).map((r) => ({
              key: r.id,
              color: r.color,
              name: r.name,
              value: r.value > 0 ? formatGBP(r.value) : STRIP_EMPTY,
            }))}
          />
        );
      })()}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className={`w-full ${SCRUB_SURFACE}`}
        {...scrub.handlers}
        role="img"
        aria-label={`Running total this month${hiddenCategoryIds.size > 0 ? ', filtered' : ''}`}
      >
        <MoneyGrid scale={scale} frame={frame} />

        {/* x-axis day ticks + labels */}
        {xTicks.map((d) => (
          <g key={`x${d}`}>
            <line x1={x(d)} y1={PAD_TOP} x2={x(d)} y2={y(0)} className="stroke-hairline/40" strokeWidth={1} />
            <text x={x(d)} y={CHART_H - 9} textAnchor="middle" className="fill-ink-faint text-[10px] tabular-nums">{d}</text>
          </g>
        ))}

        {/* reference lines — all three lines first, then all three labels, so a line can
           never paint over another line's label.
           Last Month is dotted, Income dashed, Adj. Income dash-dot, so they stay
           distinguishable when they run close. Each is green while spend-so-far is under its
           value, red once over (Adj. Income compares against the UN-clamped value so a
           £0-clamped line correctly shows red). */}
        {targetVisible && (
          <line
            x1={PAD_LEFT}
            y1={y(target)}
            x2={CHART_W - PAD_RIGHT}
            y2={y(target)}
            className={current <= target ? 'stroke-under' : 'stroke-over'}
            strokeWidth={1}
            strokeLinecap="round"
            strokeDasharray="0.5 4"
          />
        )}
        {incomeVisible && (
          <line
            x1={PAD_LEFT}
            y1={y(incomePence)}
            x2={CHART_W - PAD_RIGHT}
            y2={y(incomePence)}
            className={current <= incomePence ? 'stroke-under' : 'stroke-over'}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}
        {adjIncomeVisible && (
          <line
            x1={PAD_LEFT}
            y1={y(adjIncome)}
            x2={CHART_W - PAD_RIGHT}
            y2={y(adjIncome)}
            className={current <= adjIncomeRaw ? 'stroke-under' : 'stroke-over'}
            strokeWidth={1}
            strokeDasharray="8 3 1.5 3"
          />
        )}
        {targetVisible && (
          <g transform={`translate(${targetLabelX}, ${y(target) + 2.5})`}>
            <rect x={0} y={0} width={targetLabelW} height={14} rx={6} fill="var(--color-raised)" />
            <text x={4.5} y={10} textAnchor="start" className="fill-ink-muted text-[11px]">
              {targetLabel}
            </text>
          </g>
        )}
        {incomeVisible && (
          <g transform={`translate(${incomeLabelX}, ${y(incomePence) + 2.5})`}>
            <rect x={0} y={0} width={incomeLabelW} height={14} rx={6} fill="var(--color-raised)" />
            <text x={4.5} y={10} textAnchor="start" className="fill-ink-muted text-[11px]">
              {incomeLabel}
            </text>
          </g>
        )}
        {adjIncomeVisible && (
          <g transform={`translate(${adjIncomeLabelX}, ${y(adjIncome) + 2.5})`}>
            <rect x={0} y={0} width={adjIncomeLabelW} height={14} rx={6} fill="var(--color-raised)" />
            <text x={4.5} y={10} textAnchor="start" className="fill-ink-muted text-[11px]">
              {adjIncomeLabel}
            </text>
          </g>
        )}

        {/* today marker */}
        {todayDay !== null && (
          <line x1={x(todayDay)} y1={PAD_TOP - 6} x2={x(todayDay)} y2={y(0)} className="stroke-accent/40" strokeWidth={1} strokeDasharray="2 3" />
        )}

        {/* stacked per-group make-up of the running total (donut colours & proportions) */}
        {bands.map((b) => (
          <path key={b.group.id} d={bandGen(b.pts) ?? ''} fill={b.group.color} fillOpacity={0.3} />
        ))}
        <path d={linePath} className="stroke-accent" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

        {/* final dot — hidden while hovering since the hover dot takes over */}
        {current > 0 && !hoveredPt && (
          <circle cx={x(series[series.length - 1].day)} cy={y(current)} r={3.5} className="fill-accent" />
        )}

        {/* hover: crosshair + dot + breakdown box (per-group make-up of the cumulative
           total, matching the stacked bands, with each group's own day delta) */}
        {hoveredPt && (() => {
          const hx = x(hoveredPt.day);
          const hy = y(hoveredPt.value);
          const boxX = hx > CHART_W / 2 ? hx - BOX_W - 10 : hx + 10;
          const boxY = Math.max(PAD_TOP + 4, Math.min(hy - boxH / 2, CHART_H - PAD_BOTTOM - boxH));
          return (
            <g>
              <line x1={hx} y1={PAD_TOP} x2={hx} y2={y(0)} className="stroke-ink/20" strokeWidth={1} />
              <circle cx={hx} cy={hy} r={4.5} className="fill-accent" stroke="var(--color-panel)" strokeWidth={2} />
              {/* Touch reads the values off the strip above; only the mouse sees the in-chart box. */}
              {!coarse && (
                <SvgBreakdownBox
                  x={boxX}
                  y={boxY}
                  title={`${hoveredPt.day} ${monthName}`}
                  big={formatGBP(hoveredPt.value)}
                  sub={`${delta !== null && delta > 0 ? '+' : ''}${formatGBP(delta ?? 0)}`}
                  subClass={delta !== null && delta > 0 ? 'fill-accent' : 'fill-ink-faint'}
                  rows={hoverByGroup.map((r) => ({
                    key: r.id,
                    color: r.color,
                    name: r.name,
                    value: formatGBP(r.value),
                    extra: r.delta !== 0 ? `${r.delta > 0 ? '+' : ''}${formatGBP(r.delta)}` : '—',
                    extraClass: r.delta > 0 ? 'fill-accent' : 'fill-ink-faint',
                  }))}
                />
              )}
            </g>
          );
        })()}

        {/* invisible overlay — must be last to sit on top. Mouse only: touch goes through the
           svg's scrub handlers instead, so a tap can't reveal anything by itself. */}
        <rect
          x={PAD_LEFT} y={PAD_TOP}
          width={INNER_W} height={INNER_H}
          fill="transparent"
          onPointerMove={(e) => { if (e.pointerType !== 'touch') handlePointer(e); }}
          onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHoveredDay(null); }}
        />
      </svg>
    </div>
  );
}
