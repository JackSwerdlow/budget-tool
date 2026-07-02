import { useState, type MouseEvent } from 'react';
import { area, curveStepAfter, line } from 'd3-shape';
import {
  formatGBP,
  income,
  monthTotal,
  previousMonth,
  runningCumulativeByGroup,
  type LedgerData,
} from '@budget/core';
import { dayOfMonth, daysInMonth, todayISO } from '../lib/dates';

type Pt = { day: number; value: number };
type StackPt = { day: number; byGroup: Map<number, number>; total: number };
type BandPt = { day: number; lower: number; upper: number };

const W = 720;
const H = 230;
const PAD_LEFT = 46;
const PAD_RIGHT = 16;
const PAD_TOP = 22;
const PAD_BOTTOM = 28;
const INNER_W = W - PAD_LEFT - PAD_RIGHT;
const INNER_H = H - PAD_TOP - PAD_BOTTOM;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const BOX_W = 170;
const BOX_H = 58; // grows by 13 per group line in the hover breakdown

function axisGBP(pence: number): string {
  return `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
}

// Same pressed/idle look as the category-filter buttons (CategoryVisibilityPanel).
function LineToggle({ label, pressed, color, onClick }: {
  label: string; pressed: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`px-2.5 py-1 text-xs transition-all duration-100 ${
        pressed ? 'rounded-full text-ink' : 'rounded-md text-ink-faint hover:text-ink-muted'
      }`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} ${pressed ? 32 : 8}%, var(--color-panel))`,
        boxShadow: pressed ? `inset 0 0 0 1px ${color}` : undefined,
      }}
    >
      {label}
    </button>
  );
}

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
  // The reference lines are toggleable: hiding one also releases the y-axis from its value
  // (useful when a filtered-down total sits far below income).
  const [showTarget, setShowTarget] = useState(true);
  const [showIncome, setShowIncome] = useState(true);

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

  const targetVisible = showTarget && target > 0;
  const incomeVisible = showIncome && incomePence > 0;

  const dataMax = Math.max(current, targetVisible ? target : 0, incomeVisible ? incomePence : 0);
  // Always scale to the next £500 ceiling so grid lines stay consistent across months.
  const yMax = Math.ceil(Math.max(dataMax, 1) / 50000) * 50000;
  const x = (day: number) => PAD_LEFT + (day / days) * INNER_W;
  const y = (value: number) => PAD_TOP + INNER_H - (value / yMax) * INNER_H;

  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += 50000) yTicks.push(v);
  const xTicks = dayTicks(days);

  // Both reference labels sit at the left end (away from the line, which is highest on the
  // right); when the two lines run close together, the Income label slides right past the
  // Last Month one instead of overlapping it.
  const targetLabel = `Last Month:  ${formatGBP(target)}`;
  const targetLabelW = Math.ceil(targetLabel.length * 5.35);
  const incomeLabel = `Income:  ${formatGBP(incomePence)}`;
  const incomeLabelW = Math.ceil(incomeLabel.length * 5.35);
  const labelsCollide = targetVisible && Math.abs(y(target) - y(incomePence)) < 18;
  const incomeLabelX = PAD_LEFT + 3.5 + (labelsCollide ? targetLabelW + 8 : 0);

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

  const handleMouseMove = (e: MouseEvent<SVGRectElement>) => {
    const svgEl = e.currentTarget.closest('svg')!;
    const rect = svgEl.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const rawDay = ((svgX - PAD_LEFT) / INNER_W) * days;
    setHoveredDay(Math.max(1, Math.min(Math.round(rawDay), maxHoverDay)));
  };

  const hoveredPt = hoveredDay !== null ? { day: hoveredDay, value: denseByDay[hoveredDay] } : null;
  // Day 1's baseline is £0, so its delta is simply that day's cumulative.
  const delta = hoveredDay !== null
    ? denseByDay[hoveredDay] - (hoveredDay > 1 ? denseByDay[hoveredDay - 1] : 0)
    : null;

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
  const hoverByGroup = hoveredDay !== null
    ? (() => {
        const m = byGroupAt(hoveredDay);
        const prev = hoveredDay > 1 ? byGroupAt(hoveredDay - 1) : new Map<number, number>();
        return stackGroups
          .map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            value: m.get(g.id) ?? 0,
            delta: (m.get(g.id) ?? 0) - (prev.get(g.id) ?? 0),
          }))
          .filter((r) => r.value > 0);
      })()
    : [];
  const boxH = hoverByGroup.length > 0 ? 62 + hoverByGroup.length * 13 : BOX_H;

  const monthName = MONTH_NAMES[parseInt(ym.split('-')[1]) - 1];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-base text-ink">Running total</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {target > 0 && (
              <LineToggle label="Last Month" pressed={showTarget} color="var(--color-ink-faint)" onClick={() => setShowTarget((s) => !s)} />
            )}
            {incomePence > 0 && (
              <LineToggle
                label="Income"
                pressed={showIncome}
                color={current <= incomePence ? 'var(--color-under)' : 'var(--color-over)'}
                onClick={() => setShowIncome((s) => !s)}
              />
            )}
          </div>
          <span className="text-sm text-ink-muted">
            {formatGBP(current)} <span className="text-ink-faint">so far</span>
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Running total this month${hiddenCategoryIds.size > 0 ? ', filtered' : ''}`}>
        {/* y-axis gridlines + £ labels */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD_LEFT} y1={y(t)} x2={W - PAD_RIGHT} y2={y(t)} className="stroke-hairline/60" strokeWidth={1} />
            <text x={PAD_LEFT - 8} y={y(t) + 3} textAnchor="end" className="fill-ink-faint text-[10px] tabular-nums">
              {axisGBP(t)}
            </text>
          </g>
        ))}

        {/* x-axis day ticks + labels */}
        {xTicks.map((d) => (
          <g key={`x${d}`}>
            <line x1={x(d)} y1={PAD_TOP} x2={x(d)} y2={y(0)} className="stroke-hairline/40" strokeWidth={1} />
            <text x={x(d)} y={H - 9} textAnchor="middle" className="fill-ink-faint text-[10px] tabular-nums">{d}</text>
          </g>
        ))}

        {/* last month's target — label sits at the left end to avoid overlapping the running line */}
        {targetVisible && (
          <>
            <line
              x1={PAD_LEFT}
              y1={y(target)}
              x2={W - PAD_RIGHT}
              y2={y(target)}
              className="stroke-ink-faint"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <g transform={`translate(${PAD_LEFT + 3.5}, ${y(target) + 2.5})`}>
              <rect x={0} y={0} width={targetLabelW} height={14} rx={6} fill="var(--color-raised)" />
              <text x={4.5} y={10} textAnchor="start" className="fill-ink-muted text-[11px]">
                {targetLabel}
              </text>
            </g>
          </>
        )}

        {/* income pace line — green while spend-so-far is under it, red once over */}
        {incomeVisible && (
          <>
            <line
              x1={PAD_LEFT}
              y1={y(incomePence)}
              x2={W - PAD_RIGHT}
              y2={y(incomePence)}
              className={current <= incomePence ? 'stroke-under' : 'stroke-over'}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <g transform={`translate(${incomeLabelX}, ${y(incomePence) + 2.5})`}>
              <rect x={0} y={0} width={incomeLabelW} height={14} rx={6} fill="var(--color-raised)" />
              <text x={4.5} y={10} textAnchor="start" className="fill-ink-muted text-[11px]">
                {incomeLabel}
              </text>
            </g>
          </>
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

        {/* hover: crosshair + dot + tooltip */}
        {hoveredPt && (() => {
          const hx = x(hoveredPt.day);
          const hy = y(hoveredPt.value);
          const boxX = hx > W / 2 ? hx - BOX_W - 10 : hx + 10;
          const boxY = Math.max(PAD_TOP + 4, Math.min(hy - boxH / 2, H - PAD_BOTTOM - boxH));
          return (
            <g>
              <line x1={hx} y1={PAD_TOP} x2={hx} y2={y(0)} className="stroke-ink/20" strokeWidth={1} />
              <circle cx={hx} cy={hy} r={4.5} className="fill-accent" stroke="var(--color-panel)" strokeWidth={2} />
              <g transform={`translate(${boxX},${boxY})`}>
                <rect width={BOX_W} height={boxH} rx={4} fill="var(--color-raised)" className="stroke-hairline" strokeWidth={1} />
                <text x={10} y={16} className="fill-ink-faint text-[10px] uppercase tracking-wide">{hoveredPt.day} {monthName}</text>
                <text x={10} y={35} className="fill-ink text-[14px] tabular-nums" fontWeight={600}>{formatGBP(hoveredPt.value)}</text>
                {delta !== null && (
                  <text x={10} y={51} className={`text-[10px] tabular-nums ${delta > 0 ? 'fill-accent' : 'fill-ink-faint'}`}>
                    {delta > 0 ? '+' : ''}{formatGBP(delta)}
                  </text>
                )}
                {/* per-group make-up of the cumulative total (matches the stacked bands),
                   with the group's own day delta when it moved */}
                {hoverByGroup.map((r, i) => (
                  <g key={r.id}>
                    <rect x={10} y={66 + i * 13 - 7} width={6} height={6} rx={1} fill={r.color} />
                    <text x={20} y={66 + i * 13} className="fill-ink-faint text-[9.5px]">{r.name}</text>
                    <text x={BOX_W - 10} y={66 + i * 13} textAnchor="end" className="tabular-nums">
                      <tspan className="fill-ink-muted text-[9.5px]">{formatGBP(r.value)}</tspan>
                      {r.delta !== 0 && (
                        <tspan className={`text-[8.5px] ${r.delta > 0 ? 'fill-accent' : 'fill-ink-faint'}`}>
                          {'  '}{r.delta > 0 ? '+' : ''}{formatGBP(r.delta)}
                        </tspan>
                      )}
                    </text>
                  </g>
                ))}
              </g>
            </g>
          );
        })()}

        {/* invisible overlay — must be last to sit on top */}
        <rect
          x={PAD_LEFT} y={PAD_TOP}
          width={INNER_W} height={INNER_H}
          fill="transparent"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredDay(null)}
        />
      </svg>
    </div>
  );
}
