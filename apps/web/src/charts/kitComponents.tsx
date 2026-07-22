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

export type StripRow = { key: number | string; color: string; name: string; value: string };

// Placeholder for a series with nothing in it at the scrubbed point. Rows are never dropped —
// see ChartInspectStrip on why the row set has to stay constant.
export const STRIP_EMPTY = '–';

// Touch "inspect strip": a compact header above a chart (see MOBILE.md). It shows the headline
// plus the per-group breakdown below it — so the breakdown never covers the chart the way a
// follow-finger box does. Idle it describes the chart's most recent point; while a finger scrubs,
// the same fields track the finger, and `active` only lifts the border/background.
//
// **Nothing in here may move while scrubbing** — dragging across a month should change the
// glyphs and nothing else, or the strip becomes unreadable at speed. That rules the layout:
//
//   - Rows render whether or not it's active, and callers pass **every** series every time
//     (a dash where there's no spend), so the row set — and the strip's height — is constant.
//   - Figures are `tabular-nums` (equal-width digits) and **right-aligned**, so £99.00 → £100.00
//     grows leftwards instead of pushing anything sideways.
//   - The total and the delta are **stacked**, each pinned to an edge of its own row (label left,
//     figure right). Side by side, the delta's width would set where the total could start, so
//     the total drifted whenever the sign or digit count changed.
//   - The breakdown is a fixed 2-column grid, not `flex-wrap`, so a longer name can't reflow a
//     row onto the next line.
//
// `deltaLabel` names what the delta is measured against ("vs last month"), since a bare signed
// figure under a total is ambiguous. Mouse keeps the in-chart hover boxes; callers render this
// only for a coarse pointer.
export function ChartInspectStrip({ title, value, delta, deltaLabel, deltaClass = 'text-ink-faint', active, rows }: {
  title: string;
  value: string;
  delta?: string;
  deltaLabel?: string;
  deltaClass?: string;
  active: boolean;
  rows?: StripRow[];
}) {
  return (
    <div
      className={`mb-2 rounded-md border px-2.5 py-1.5 transition-colors ${
        active ? 'border-hairline bg-raised/60' : 'border-transparent bg-raised/25'
      }`}
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] uppercase tracking-wide text-ink-faint">{title}</span>
        <span className="shrink-0 text-sm font-medium tabular-nums text-ink">{value}</span>
      </div>
      {delta && (
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[10px] text-ink-faint">{deltaLabel}</span>
          <span className={`shrink-0 text-[11px] tabular-nums ${deltaClass}`}>{delta}</span>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-hairline/60 pt-1">
          {rows.map((r) => (
            <span key={r.key} className="flex items-center gap-1 text-[11px] text-ink-muted">
              <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
              <span className="truncate">{r.name}</span>
              <span className="ml-auto shrink-0 tabular-nums text-ink">{r.value}</span>
            </span>
          ))}
        </div>
      )}
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
