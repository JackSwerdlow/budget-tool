import { area, curveMonotoneX, line } from 'd3-shape';
import {
  formatGBP,
  monthTotal,
  previousMonth,
  runningCumulative,
  type LedgerData,
} from '@budget/core';
import { dayOfMonth, daysInMonth, todayISO } from '../lib/dates';

type Pt = { day: number; value: number };

const W = 720;
const H = 230;
const PAD_LEFT = 46;
const PAD_RIGHT = 16;
const PAD_TOP = 22;
const PAD_BOTTOM = 28;
const INNER_W = W - PAD_LEFT - PAD_RIGHT;
const INNER_H = H - PAD_TOP - PAD_BOTTOM;

function axisGBP(pence: number): string {
  return `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
}

// Round "nice" y-axis ticks (0, £250, £500, …) spanning up to maxPence.
function niceTicks(maxPence: number, count: number): number[] {
  if (maxPence <= 0) return [0];
  const rawStep = maxPence / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = nice * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= maxPence; v += step) ticks.push(v);
  return ticks;
}

// Weekly x ticks (1, 8, 15, …) with the last one snapped to the month's final day.
function dayTicks(days: number): number[] {
  const ticks: number[] = [];
  for (let d = 1; d <= days; d += 7) ticks.push(d);
  const last = ticks[ticks.length - 1];
  if (days - last >= 3) ticks.push(days);
  else ticks[ticks.length - 1] = days;
  return ticks;
}

export function RunningChart({ data, ym }: { data: LedgerData; ym: string }) {
  const points = runningCumulative(data, ym);
  const target = monthTotal(data, previousMonth(ym), { excludeRent: true });
  const days = daysInMonth(ym);
  const current = points.length > 0 ? points[points.length - 1].cumulativePence : 0;

  const dataMax = Math.max(target, current);
  const yMax = Math.max(dataMax, 1) * 1.15;
  const x = (day: number) => PAD_LEFT + ((day - 1) / Math.max(days - 1, 1)) * INNER_W;
  const y = (value: number) => PAD_TOP + INNER_H - (value / yMax) * INNER_H;

  const yTicks = dataMax > 0 ? niceTicks(yMax, 5) : [0];
  const xTicks = dayTicks(days);

  const series: Pt[] = [{ day: 1, value: 0 }, ...points.map((p) => ({ day: dayOfMonth(p.date), value: p.cumulativePence }))];

  const lineGen = line<Pt>().x((d) => x(d.day)).y((d) => y(d.value)).curve(curveMonotoneX);
  const areaGen = area<Pt>().x((d) => x(d.day)).y0(y(0)).y1((d) => y(d.value)).curve(curveMonotoneX);
  const linePath = lineGen(series) ?? '';
  const areaPath = areaGen(series) ?? '';

  const isCurrentMonth = ym === todayISO().slice(0, 7);
  const todayDay = isCurrentMonth ? dayOfMonth(todayISO()) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-base text-ink">Running total <span className="text-ink-faint">· ex-Rent</span></h3>
        <span className="text-sm text-ink-muted">
          {formatGBP(current)} <span className="text-ink-faint">so far</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Running total this month, excluding Rent">
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

        {/* last month's ex-Rent target */}
        {target > 0 && (
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
            <text x={W - PAD_RIGHT} y={y(target) - 6} textAnchor="end" className="fill-ink-muted text-[11px]">
              last month {formatGBP(target)}
            </text>
          </>
        )}

        {/* today marker */}
        {todayDay !== null && (
          <line x1={x(todayDay)} y1={PAD_TOP - 6} x2={x(todayDay)} y2={y(0)} className="stroke-accent/40" strokeWidth={1} strokeDasharray="2 3" />
        )}

        <path d={areaPath} className="fill-accent/10" />
        <path d={linePath} className="stroke-accent" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

        {/* final dot */}
        {current > 0 && <circle cx={x(series[series.length - 1].day)} cy={y(current)} r={3.5} className="fill-accent" />}
      </svg>
    </div>
  );
}
