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
const H = 220;
const PAD_X = 18;
const PAD_TOP = 22;
const PAD_BOTTOM = 26;
const INNER_W = W - PAD_X * 2;
const INNER_H = H - PAD_TOP - PAD_BOTTOM;

export function RunningChart({ data, ym }: { data: LedgerData; ym: string }) {
  const points = runningCumulative(data, ym);
  const target = monthTotal(data, previousMonth(ym), { excludeRent: true });
  const days = daysInMonth(ym);
  const current = points.length > 0 ? points[points.length - 1].cumulativePence : 0;

  const yMax = Math.max(target, current, 1) * 1.15;
  const x = (day: number) => PAD_X + ((day - 1) / Math.max(days - 1, 1)) * INNER_W;
  const y = (value: number) => PAD_TOP + INNER_H - (value / yMax) * INNER_H;

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
        {/* baseline */}
        <line x1={PAD_X} y1={y(0)} x2={W - PAD_X} y2={y(0)} className="stroke-hairline" strokeWidth={1} />

        {/* last month's ex-Rent target */}
        {target > 0 && (
          <>
            <line
              x1={PAD_X}
              y1={y(target)}
              x2={W - PAD_X}
              y2={y(target)}
              className="stroke-ink-faint"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text x={W - PAD_X} y={y(target) - 6} textAnchor="end" className="fill-ink-muted text-[11px]">
              last month {formatGBP(target)}
            </text>
          </>
        )}

        {/* today marker */}
        {todayDay !== null && (
          <line x1={x(todayDay)} y1={PAD_TOP - 6} x2={x(todayDay)} y2={y(0)} className="stroke-hairline" strokeWidth={1} strokeDasharray="2 3" />
        )}

        <path d={areaPath} className="fill-accent/10" />
        <path d={linePath} className="stroke-accent" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

        {/* final dot */}
        {current > 0 && <circle cx={x(series[series.length - 1].day)} cy={y(current)} r={3.5} className="fill-accent" />}

        {/* day axis ends */}
        <text x={PAD_X} y={H - 8} className="fill-ink-faint text-[11px]">1</text>
        <text x={W - PAD_X} y={H - 8} textAnchor="end" className="fill-ink-faint text-[11px]">{days}</text>
      </svg>
    </div>
  );
}
