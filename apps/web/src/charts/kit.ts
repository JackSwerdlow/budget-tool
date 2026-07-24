import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

// Shared chart primitives (values & hooks) — the visual language the Overview/Trends charts
// have in common. The matching components (MoneyGrid, the breakdown boxes) live in
// kitComponents.tsx; layout lives in the kit, each chart formats its own strings.

// ---- SVG frame (full-width money charts: RunningChart, TrendsBars) ----

export const CHART_W = 720;
export const CHART_H = 230;
export const PAD_LEFT = 46;
export const PAD_RIGHT = 16;
export const PAD_TOP = 22;
export const PAD_BOTTOM = 28;
export const INNER_W = CHART_W - PAD_LEFT - PAD_RIGHT;
export const INNER_H = CHART_H - PAD_TOP - PAD_BOTTOM;

// A chart's viewBox geometry. Charts historically hardcoded the 720×230 frame; on a phone
// that scales SVG text below legibility, so width-aware charts pick a frame from their
// measured CSS width instead (COMPACT is ~1:1 viewBox-to-pixel on a 360–412px phone).
export type ChartFrame = {
  W: number;
  H: number;
  PAD_LEFT: number;
  PAD_RIGHT: number;
  PAD_TOP: number;
  PAD_BOTTOM: number;
  INNER_W: number;
  INNER_H: number;
};

export const DESKTOP_FRAME: ChartFrame = {
  W: CHART_W, H: CHART_H, PAD_LEFT, PAD_RIGHT, PAD_TOP, PAD_BOTTOM, INNER_W, INNER_H,
};

export const COMPACT_FRAME: ChartFrame = {
  W: 390, H: 250, PAD_LEFT: 46, PAD_RIGHT: 12, PAD_TOP: 22, PAD_BOTTOM: 28,
  INNER_W: 390 - 46 - 12, INNER_H: 250 - 22 - 28,
};

// Frame chosen from the ref'd element's measured CSS width (ResizeObserver). Defaults to
// DESKTOP_FRAME before the first measurement so SSR-less first paint matches the old output.
//
// The observer follows the *current* node rather than being attached once on mount, because a
// chart's wrapper is unmounted and later remounted as a different node whenever the chart has
// nothing to draw (step onto a month with no data and FlowSankey renders nothing). A one-shot
// mount effect kept observing the detached node, and since removing an observed element reports a
// 0×0 resize, the chart latched into COMPACT and re-mounted at phone geometry on a desktop-width
// container — a sankey at double height that no later resize could fix. Hence both halves here:
// re-observe on node change, and never let a zero width decide the frame.
export function useChartFrame<T extends HTMLElement = HTMLDivElement>(): {
  ref: RefObject<T | null>;
  frame: ChartFrame;
} {
  const [compact, setCompact] = useState(false);
  const attached = useRef<{ node: T | null; ro: ResizeObserver | null }>({ node: null, ro: null });

  // A ref object with a setter, not useRef: React assigns `.current` on mount *and* unmount, which
  // is the signal to move the observer. Still a RefObject to callers (useDismissOnOutsideTap).
  const refBox = useRef<RefObject<T | null> | null>(null);
  if (!refBox.current) {
    refBox.current = {
      get current() {
        return attached.current.node;
      },
      set current(node: T | null) {
        const state = attached.current;
        if (node === state.node) return;
        state.ro?.disconnect();
        state.node = node;
        if (!node) {
          state.ro = null;
          return;
        }
        const ro = new ResizeObserver((entries) => {
          const w = entries[0].contentRect.width;
          // 0 = detached, or laid out inside a hidden panel — not a measurement of anything.
          if (w > 0) setCompact(w < 480);
        });
        ro.observe(node);
        state.ro = ro;
      },
    } as RefObject<T | null>;
  }

  useEffect(() => () => attached.current.ro?.disconnect(), []);
  return { ref: refBox.current, frame: compact ? COMPACT_FRAME : DESKTOP_FRAME };
}

export function axisGBP(pence: number): string {
  return `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
}

export type MoneyScale = {
  yMax: number;
  y: (value: number) => number;
  ticks: number[];
  format: (pence: number) => string; // tick labels: whole £ normally, 2dp on sub-£1 grids
};

const MAX_INTERVALS = 6;

// The smallest "nice" gridline step — 1, 2, or 5 × a power of ten (pence) — that keeps the
// chart to at most MAX_INTERVALS intervals.
function niceStep(max: number): number {
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const m of [1, 2, 5]) {
      const step = m * magnitude;
      if (max / step <= MAX_INTERVALS) return step;
    }
  }
}

// Dynamic money y-axis: the ceiling is the next multiple of a nice step chosen from the
// data, so a 4p item history gets a 1p grid while a £2,000 month keeps a £500 one — a fixed
// step either drowns small charts (one line) or big ones (dozens). An empty chart keeps the
// old £0–£500 frame rather than a silly 1p axis.
export function moneyScale(dataMax: number, frame: ChartFrame = DESKTOP_FRAME): MoneyScale {
  const step = dataMax > 0 ? niceStep(dataMax) : 50000;
  const yMax = Math.max(Math.ceil(dataMax / step) * step, step);
  const y = (value: number) => frame.PAD_TOP + frame.INNER_H - (value / yMax) * frame.INNER_H;
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);
  const format = step < 100 ? (pence: number) => `£${(pence / 100).toFixed(2)}` : axisGBP;
  return { yMax, y, ticks, format };
}

// ---- SVG hover-breakdown box (see SvgBreakdownBox) ----

export const BOX_W = 178;

export function boxHeight(rowCount: number): number {
  return rowCount > 0 ? 62 + rowCount * 13 : 58;
}

// Long names are ellipsised so they can never run into the totals column.
export function ellipsize(name: string, max = 12): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

// ---- Cursor-following HTML breakdown box (see CursorBreakdownBox) ----

// While `active`, a pointer-down outside `ref` (or any scroll) dismisses via `clear` — the
// touch counterpart of mouseleave, so a tap-revealed tooltip doesn't stick around forever.
export function useDismissOnOutsideTap(active: boolean, ref: RefObject<Element | null>, clear: () => void) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) clear();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', clear, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', clear, { capture: true });
    };
  }, [active, ref, clear]);
}

// Cursor position relative to a `position: relative` wrapper, for anchoring the box.
// Pointer-events so touch works: wire `onPointerMove/onPointerDown → moveTo` (a tap reveals)
// and `onPointerLeave → leave` (mouse-only — touch "leaves" on finger-up, which would kill a
// just-tapped box; outside-tap/scroll dismissal handles touch instead).
export function useCursorPos() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const moveTo = (e: ReactPointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const clear = () => setPos(null);
  const leave = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') setPos(null);
  };
  useDismissOnOutsideTap(pos !== null, wrapRef, clear);
  return { wrapRef, pos, moveTo, leave, clear };
}
