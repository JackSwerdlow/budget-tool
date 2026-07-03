import { useState } from 'react';
import { formatGBP, income, previousMonth, type LedgerData } from '@budget/core';
import { LineToggle } from '../components/LineToggle';
import { monthLabel, monthShort, todayISO } from '../lib/dates';
import { BOX_W, CHART_H, CHART_W, INNER_H, INNER_W, PAD_BOTTOM, PAD_LEFT, PAD_RIGHT, PAD_TOP, boxHeight, moneyScale } from './kit';
import { MoneyGrid, SvgBreakdownBox } from './kitComponents';

// Per-month stacked bars over the same range as the category×month matrix — the running
// chart's visual language (group colours/stack order, pill toggles, hover breakdown box)
// applied month-by-month instead of day-by-day.
export function TrendsBars({ data, months, totalsByMonth, hiddenCategoryIds, onOpenMonth }: {
  data: LedgerData;
  months: string[];
  // Shared with TrendsMatrix (computed once in OverviewTrends); includes the month
  // before the range as the first bar's vs-last-month baseline.
  totalsByMonth: ReadonlyMap<string, Map<number, number>>;
  hiddenCategoryIds: Set<number>;
  onOpenMonth: (ym: string) => void;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showAvg, setShowAvg] = useState(true);
  const [showIncome, setShowIncome] = useState(false);

  const currentYm = todayISO().slice(0, 7);

  if (months.length === 0) return null;

  // Per month: a groupId → pence map of the visible categories' spend (same maths as the matrix).
  const groupCats = data.groups.map((g) => ({
    g,
    cats: data.categories.filter((c) => c.group_id === g.id && !hiddenCategoryIds.has(c.id)),
  }));
  const monthGroupValues = months.map((m) => {
    const totals = totalsByMonth.get(m) ?? new Map<number, number>();
    const values = new Map<number, number>();
    for (const { g, cats } of groupCats) {
      const v = cats.reduce((s, c) => s + (totals.get(c.id) ?? 0), 0);
      if (v > 0) values.set(g.id, v);
    }
    return values;
  });
  const sumValues = (m: Map<number, number>) => {
    let s = 0;
    for (const v of m.values()) s += v;
    return s;
  };
  const monthTotals = monthGroupValues.map(sumValues);
  const stackGroups = data.groups.filter((g) => monthGroupValues.some((mv) => mv.has(g.id)));

  // Baseline for the first month's hover delta: the month before the displayed range
  // (same as the matrix's first-column %).
  const prevTotals = totalsByMonth.get(previousMonth(months[0])) ?? new Map<number, number>();
  const prevGroupValues = new Map<number, number>();
  for (const { g, cats } of groupCats) {
    const v = cats.reduce((s, c) => s + (prevTotals.get(c.id) ?? 0), 0);
    if (v > 0) prevGroupValues.set(g.id, v);
  }
  const prevMonthTotal = sumValues(prevGroupValues);

  const rangeTotal = monthTotals.reduce((s, t) => s + t, 0);
  if (rangeTotal === 0) return null;

  // Avg. Spend covers complete months only — a half-finished current month would drag it down.
  const completeTotals = monthTotals.filter((_, i) => months[i] !== currentYm);
  const avgSpend = completeTotals.length > 0
    ? Math.round(completeTotals.reduce((s, t) => s + t, 0) / completeTotals.length)
    : 0;
  const hasAvg = avgSpend > 0;

  // Income resolves per month (it genuinely changes), drawn as a dashed step line.
  const incomes = months.map((m) => income(data, m, currentYm));
  const hasIncome = incomes.some((v) => v > 0);
  const incomeRangeTotal = incomes.reduce((s, v) => s + v, 0);

  const avgVisible = showAvg && hasAvg;
  const incomeVisible = showIncome && hasIncome;

  const dataMax = Math.max(
    ...monthTotals,
    avgVisible ? avgSpend : 0,
    incomeVisible ? Math.max(...incomes) : 0,
  );
  const scale = moneyScale(dataMax);
  const { y } = scale;

  const band = INNER_W / months.length;
  const barW = Math.min(band * 0.62, 72);
  const barX = (i: number) => PAD_LEFT + i * band + (band - barW) / 2;
  // Thin the x labels when the range is long (the matrix scrolls; this chart is fixed-width).
  const labelStep = Math.ceil(months.length / 12);

  const hovered = hoveredIdx !== null
    ? (() => {
        const i = hoveredIdx;
        const values = monthGroupValues[i];
        const prev = i > 0 ? monthGroupValues[i - 1] : prevGroupValues;
        const prevTotal = i > 0 ? monthTotals[i - 1] : prevMonthTotal;
        return {
          i,
          ym: months[i],
          total: monthTotals[i],
          delta: monthTotals[i] - prevTotal,
          rows: stackGroups
            .filter((g) => values.has(g.id))
            .map((g) => ({
              id: g.id,
              name: g.name,
              color: g.color,
              value: values.get(g.id)!,
              delta: (values.get(g.id) ?? 0) - (prev.get(g.id) ?? 0),
            })),
        };
      })()
    : null;
  const boxH = boxHeight(hovered?.rows.length ?? 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-base text-ink">Spend by month</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {hasAvg && (
              <LineToggle
                label={`Avg. Spend: ${formatGBP(avgSpend)}`}
                pressed={showAvg}
                color="var(--color-accent)"
                onClick={() => setShowAvg((s) => !s)}
              />
            )}
            {hasIncome && (
              <LineToggle
                label="Income"
                pressed={showIncome}
                color={rangeTotal <= incomeRangeTotal ? 'var(--color-under)' : 'var(--color-over)'}
                onClick={() => setShowIncome((s) => !s)}
              />
            )}
          </div>
          <span className="text-sm text-ink-muted">
            {formatGBP(rangeTotal)} <span className="text-ink-faint">total</span>
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" role="img" aria-label={`Spend by month${hiddenCategoryIds.size > 0 ? ', filtered' : ''}`}>
        <MoneyGrid scale={scale} />

        {/* x labels (thinned on long ranges; the current month keeps the matrix's accent *) */}
        {months.map((m, i) => (
          (i % labelStep === 0 || i === months.length - 1) && (
            <text key={`x${m}`} x={barX(i) + barW / 2} y={CHART_H - 9} textAnchor="middle" className="fill-ink-faint text-[10px] tabular-nums">
              {monthShort(m)}
              {m === currentYm && <tspan className="fill-accent">*</tspan>}
            </text>
          )
        ))}

        {/* stacked bars — group colours/order matching the donut and the running chart's bands */}
        {months.map((m, i) => {
          const values = monthGroupValues[i];
          let acc = 0;
          return (
            <g key={m} className="transition-opacity" opacity={hoveredIdx !== null && hoveredIdx !== i ? 0.55 : 1}>
              {stackGroups.map((g) => {
                const v = values.get(g.id) ?? 0;
                if (v === 0) return null;
                const yTop = y(acc + v);
                const h = y(acc) - yTop;
                acc += v;
                return (
                  <rect
                    key={g.id}
                    x={barX(i)}
                    y={yTop}
                    width={barW}
                    height={h}
                    fill={g.color}
                    fillOpacity={0.55}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Avg. Spend — a straight line over complete months (dotted, running-chart style) */}
        {avgVisible && (
          <line
            x1={PAD_LEFT}
            y1={y(avgSpend)}
            x2={CHART_W - PAD_RIGHT}
            y2={y(avgSpend)}
            className="stroke-accent"
            strokeWidth={1}
            strokeLinecap="round"
            strokeDasharray="0.5 4"
          />
        )}

        {/* Income — a dashed step at each month's own resolved income (it changes month to
           month); each step is green while that month's bar is under it, red once over */}
        {incomeVisible && months.map((m, i) => {
          const x0 = PAD_LEFT + i * band;
          const x1 = x0 + band;
          return (
            <g key={`inc${m}`}>
              <line
                x1={x0}
                y1={y(incomes[i])}
                x2={x1}
                y2={y(incomes[i])}
                className={monthTotals[i] <= incomes[i] ? 'stroke-under' : 'stroke-over'}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              {i > 0 && incomes[i] !== incomes[i - 1] && (
                <line x1={x0} y1={y(incomes[i - 1])} x2={x0} y2={y(incomes[i])} className="stroke-ink/20" strokeWidth={1} />
              )}
            </g>
          );
        })}

        {/* hover tooltip — same column-aligned box as the running chart, month-granular;
           deltas here can go either way, so + is green and − red (matching the matrix) */}
        {hovered && (() => {
          const bx = barX(hovered.i);
          const boxX = bx + barW / 2 > CHART_W / 2 ? bx - BOX_W - 10 : bx + barW + 10;
          const topY = y(hovered.total);
          const boxY = Math.max(PAD_TOP + 4, Math.min(topY - boxH / 2, CHART_H - PAD_BOTTOM - boxH));
          const deltaClass = (d: number) => (d > 0 ? 'fill-under' : d < 0 ? 'fill-accent' : 'fill-ink-faint');
          return (
            <SvgBreakdownBox
              x={boxX}
              y={boxY}
              title={monthLabel(hovered.ym)}
              big={formatGBP(hovered.total)}
              sub={hovered.delta !== 0 ? `${hovered.delta > 0 ? '+' : ''}${formatGBP(hovered.delta)} vs last month` : '— vs last month'}
              subClass={deltaClass(hovered.delta)}
              rows={hovered.rows.map((r) => ({
                key: r.id,
                color: r.color,
                name: r.name,
                value: formatGBP(r.value),
                extra: r.delta !== 0 ? `${r.delta > 0 ? '+' : ''}${formatGBP(r.delta)}` : '—',
                extraClass: deltaClass(r.delta),
              }))}
            />
          );
        })()}

        {/* invisible per-month hover/click columns — last so they sit on top; clicking a
           month opens it in the Month view */}
        {months.map((m, i) => (
          <rect
            key={`h${m}`}
            x={PAD_LEFT + i * band}
            y={PAD_TOP}
            width={band}
            height={INNER_H}
            fill="transparent"
            className="cursor-pointer"
            role="button"
            aria-label={`Open ${monthLabel(m)} in the Month view`}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={() => onOpenMonth(m)}
          />
        ))}
      </svg>
    </div>
  );
}
