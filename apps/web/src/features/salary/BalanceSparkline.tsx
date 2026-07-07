import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { area, curveStepAfter, line } from 'd3-shape';
import { formatGBP, type StudentLoanResult } from '@budget/core';
import { useDismissOnOutsideTap } from '../../charts/kit';
import { monthLabel } from '../../lib/dates';

// Per-month balance sparkline for the student-loan tracker. The walk's series starts at the
// first-ever config, so months before the "Set balance" anchor are a flat £0 lead-in — trimmed
// here. Hovering shows a crosshair and swaps the strip below to that month's balance and its
// change vs the previous month (up = red, down = green — a growing loan is the bad case).
export function BalanceSparkline({ series }: { series: StudentLoanResult['series'] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsideTap(hoverIdx !== null, wrapRef, () => setHoverIdx(null));
  const startIdx = series.findIndex((p) => p.balancePence > 0);
  const pts = startIdx === -1 ? [] : series.slice(startIdx);
  if (pts.length < 2) return null;

  const W = 640, H = 64, PAD = 5;
  // The y-axis spans min→max, not 0→max: against a £40k+ balance a £60 monthly payment is
  // invisible on a zero-based scale, and the movement is the whole point of the sparkline.
  const max = Math.max(...pts.map((p) => p.balancePence));
  const min = Math.min(...pts.map((p) => p.balancePence));
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);

  type Pt = { i: number; v: number };
  const data: Pt[] = pts.map((p, i) => ({ i, v: p.balancePence }));
  // Step, not smoothed — same impulse-then-flat rendering as the Overview running chart.
  const linePath = line<Pt>().x((d) => x(d.i)).y((d) => y(d.v)).curve(curveStepAfter)(data) ?? '';
  const areaPath = area<Pt>().x((d) => x(d.i)).y0(H - PAD).y1((d) => y(d.v)).curve(curveStepAfter)(data) ?? '';

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((svgX - PAD) / (W - 2 * PAD)) * (pts.length - 1));
    setHoverIdx(Math.max(0, Math.min(i, pts.length - 1)));
  };

  const ymLabelOf = (p: StudentLoanResult['series'][number]) =>
    monthLabel(`${p.year}-${String(p.month).padStart(2, '0')}`);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const hovered = hoverIdx !== null ? pts[hoverIdx] : null;
  const hoverDelta = hoverIdx !== null && hoverIdx > 0 ? pts[hoverIdx].balancePence - pts[hoverIdx - 1].balancePence : null;

  return (
    <div ref={wrapRef} className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Student-loan balance by month">
        <path d={areaPath} className="fill-accent/10" />
        <path d={linePath} className="stroke-accent" strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {hoverIdx !== null && hovered ? (
          <>
            <line x1={x(hoverIdx)} y1={PAD} x2={x(hoverIdx)} y2={H - PAD} className="stroke-ink/20" strokeWidth={1} />
            <circle cx={x(hoverIdx)} cy={y(hovered.balancePence)} r={3.5} className="fill-accent" stroke="var(--color-panel)" strokeWidth={1.5} />
          </>
        ) : (
          <circle cx={x(data.length - 1)} cy={y(last.balancePence)} r={3} className="fill-accent" />
        )}
        <rect
          x={0} y={0} width={W} height={H} fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHoverIdx(null); }}
        />
      </svg>
      {hovered ? (
        <div className="mt-1 flex justify-between text-[10px]">
          <span className="text-ink-muted">
            {ymLabelOf(hovered)} · <span className="tabular-nums text-ink">{formatGBP(hovered.balancePence)}</span>
          </span>
          <span className={`tabular-nums ${hoverDelta === null || hoverDelta === 0 ? 'text-ink-faint' : hoverDelta > 0 ? 'text-over' : 'text-under'}`}>
            {hoverDelta === null ? '—' : `${hoverDelta > 0 ? '+' : ''}${formatGBP(hoverDelta)} vs prev month`}
          </span>
        </div>
      ) : (
        <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
          <span>{ymLabelOf(first)} · {formatGBP(first.balancePence)}</span>
          <span>{ymLabelOf(last)} · {formatGBP(last.balancePence)}</span>
        </div>
      )}
    </div>
  );
}
