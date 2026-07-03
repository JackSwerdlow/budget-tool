import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

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

export function axisGBP(pence: number): string {
  return `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
}

export type MoneyScale = { yMax: number; y: (value: number) => number; ticks: number[] };

// Always scale to the next dataCeiling ceiling so grid lines stay consistent across months.
export function moneyScale(dataMax: number, dataCeiling: number): MoneyScale {
  const yMax = Math.ceil(Math.max(dataMax, 1) / dataCeiling) * dataCeiling;
  const y = (value: number) => PAD_TOP + INNER_H - (value / yMax) * INNER_H;
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += dataCeiling) ticks.push(v);
  return { yMax, y, ticks };
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

// Cursor position relative to a `position: relative` wrapper, for anchoring the box.
export function useCursorPos() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const moveTo = (e: ReactMouseEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const clear = () => setPos(null);
  return { wrapRef, pos, moveTo, clear };
}
