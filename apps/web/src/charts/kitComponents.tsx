import type { RefObject } from 'react';
import { BOX_W, DESKTOP_FRAME, boxHeight, ellipsize, type ChartFrame, type MoneyScale } from './kit';

// Shared chart components — see kit.ts for the values/hooks half.

// Horizontal gridlines + right-aligned £ labels for a money y-axis. Pass the same frame the
// scale was built with (width-aware charts) — the default keeps fixed-frame charts unchanged.
export function MoneyGrid({ scale, frame = DESKTOP_FRAME }: { scale: MoneyScale; frame?: ChartFrame }) {
  return (
    <>
      {scale.ticks.map((t) => (
        <g key={`y${t}`}>
          <line x1={frame.PAD_LEFT} y1={scale.y(t)} x2={frame.W - frame.PAD_RIGHT} y2={scale.y(t)} className="stroke-hairline/60" strokeWidth={1} />
          <text x={frame.PAD_LEFT - 8} y={scale.y(t) + 3} textAnchor="end" className="fill-ink-faint text-[10px] tabular-nums">
            {scale.format(t)}
          </text>
        </g>
      ))}
    </>
  );
}

export type SvgBoxRow = {
  key: number | string;
  color: string;
  name: string;
  value: string; // pre-formatted (right-aligned in the totals column)
  extra: string; // pre-formatted delta/percent (smaller, right-aligned at the edge)
  extraClass: string;
};

// Title / big figure / sub line, then colour-dotted rows in two fixed columns so every
// value ends at the same x. The extra column is sized for a four-figure "+£1,234.56"
// so the two columns never collide.
export function SvgBreakdownBox({ x, y, title, big, sub, subClass, rows }: {
  x: number;
  y: number;
  title: string;
  big: string;
  sub: string;
  subClass: string;
  rows: SvgBoxRow[];
}) {
  return (
    <g transform={`translate(${x},${y})`} className="pointer-events-none">
      <rect width={BOX_W} height={boxHeight(rows.length)} rx={4} fill="var(--color-raised)" className="stroke-hairline" strokeWidth={1} />
      <text x={10} y={16} className="fill-ink-faint text-[10px] uppercase tracking-wide">{title}</text>
      <text x={10} y={35} className="fill-ink text-[14px] tabular-nums" fontWeight={600}>{big}</text>
      <text x={10} y={51} className={`text-[10px] tabular-nums ${subClass}`}>{sub}</text>
      {rows.map((r, i) => (
        <g key={r.key}>
          <rect x={10} y={66 + i * 13 - 7} width={6} height={6} rx={1} fill={r.color} />
          <text x={20} y={66 + i * 13} className="fill-ink-faint text-[9.5px]">{ellipsize(r.name)}</text>
          <text x={BOX_W - 58} y={66 + i * 13} textAnchor="end" className="fill-ink-muted text-[9.5px] tabular-nums">
            {r.value}
          </text>
          <text x={BOX_W - 10} y={66 + i * 13} textAnchor="end" className={`text-[8.5px] tabular-nums ${r.extraClass}`}>
            {r.extra}
          </text>
        </g>
      ))}
    </g>
  );
}

// Touch "inspect strip": a persistent single-line header above a chart (see MOBILE.md). Idle it
// shows the chart's headline; while a finger presses & scrubs the chart it updates live to the
// point under the finger — so the breakdown never covers the chart the way a follow-finger box
// does. Mouse keeps the in-chart hover boxes; callers render this only for a coarse pointer.
export function ChartInspectStrip({ title, value, delta, deltaClass = 'text-ink-faint', active }: {
  title: string;
  value: string;
  delta?: string;
  deltaClass?: string;
  active: boolean;
}) {
  return (
    <div
      className={`mb-3 flex items-baseline gap-2 rounded-md border px-3 py-2 transition-colors ${
        active ? 'border-hairline bg-raised/60' : 'border-transparent bg-raised/25'
      }`}
      aria-live="polite"
    >
      <span className="truncate text-xs uppercase tracking-wide text-ink-faint">{title}</span>
      <span className="ml-auto shrink-0 font-serif text-base tabular-nums text-ink">{value}</span>
      {delta && <span className={`shrink-0 text-xs tabular-nums ${deltaClass}`}>{delta}</span>}
    </div>
  );
}

export type HtmlBoxRow = {
  key: number | string;
  color: string;
  name: string;
  value: string;
  right: string; // smaller right-edge column (percent etc.); class carries width/size/colour
  rightClass: string;
};

export function CursorBreakdownBox({ wrapRef, pos, title, rows, boxW = 230 }: {
  wrapRef: RefObject<HTMLDivElement | null>;
  pos: { x: number; y: number };
  title: string;
  rows: HtmlBoxRow[];
  boxW?: number;
}) {
  const width = wrapRef.current?.clientWidth ?? boxW;
  const left = Math.min(Math.max(pos.x + 14, 0), width - boxW);
  return (
    <div
      className="pointer-events-none absolute z-10 rounded border border-hairline bg-raised px-3 py-2 shadow-sm"
      style={{ left, top: pos.y + 14, width: boxW }}
    >
      <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">{title}</div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-1.5 py-0.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">{r.name}</span>
          <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-ink-muted">{r.value}</span>
          <span className={`shrink-0 text-right tabular-nums ${r.rightClass}`}>{r.right}</span>
        </div>
      ))}
    </div>
  );
}
