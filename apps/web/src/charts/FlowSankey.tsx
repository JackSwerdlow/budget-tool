import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from 'react';
import { calcSalary, categoryTotals, formatGBP, income, type LedgerData, type SalaryConfig } from '@budget/core';
import { getAllSalaryConfigs } from '../api';
import { previewEmploymentStart, previewYtd, ymToYearMonth } from '../features/salary/salaryState';
import { monthLabel, todayISO } from '../lib/dates';
import { coarsePointer } from '../lib/pointer';
import { CHART_W, ellipsize, useChartFrame, useCursorPos, useDismissOnOutsideTap } from './kit';
import { ChartInspectStrip, CursorBreakdownBox } from './kitComponents';

// Money flow — a sankey for the viewed month. It draws only when the salary engine's net pay for
// the month exactly matches the recorded income (true by construction for months saved via the
// Salary tab); a month whose income doesn't reconcile has no payslip, so its chain simply starts at
// Net pay (TOP = 1) with nothing above to climb back to. A month that overspent gets a red "From
// savings" source beside Net pay filling the difference; one that didn't gets a green "Left over"
// band. Like Net Balance, this is real money: it ignores the category filter (hidden spend would
// otherwise masquerade as left over).
//
// **The chart is a chain of levels, one step at a time.** Each level's root is the level above's
// middle column, and its right column becomes the next level's middle — so going deeper is
// literally everything sliding one column left with a new layer arriving on the right. `[…]` marks
// an end node: money that stops there, at that depth.
//
//   L0  Gross pay → [Pension] [Income tax] [National Insurance] [Student loan] · Net pay → Spent · Left over
//   L1  Net pay → Spent · [Left over] → each group
//   L2  Spent → each group → each category
//   L3  Group → [its categories]
//
// A node's role therefore depends on where it sits, not on what it is: Left over leads onward at
// L0 (there's a layer under Spent beside it) and is an end node at L1. You can only ever move one
// level, in either direction — clicking a forward node descends, clicking the root column climbs
// back — because skipping from the top view into one group's categories drops every step that
// explains how you got there. Which forward node you click doesn't matter except at the last
// step, where the group you clicked (or the group owning the category you clicked) is the one L3
// roots at. Clicking an end node highlights it instead; every label carries its share of the
// current root, so the proportions re-base as you descend.
//
// The move is animated the way d3's zoomable sunburst/icicle does it: elements are keyed by
// identity, so a section present in both levels is the *same* node moving — Net pay slides into
// the left column and its ribbons follow it — while the layers that exist on only one side fade.
// Nothing interpolates path strings; the numbers behind a ribbon are interpolated and `ribbonPath`
// is re-run each frame, which is what `attrTween("d", …)` does in d3.

const NODE_W = 12;
const GAP = 6;
const PAD_Y = 10;

// Re-root transition. d3's default transition is 250ms and its zoomable sunburst uses 750ms for a
// whole-hierarchy zoom; this moves one level over a small frame, so it sits at the short end.
const ZOOM_MS = 300;
// Labels don't tween — a node changing column changes its anchor and its line count, and there's
// no meaningful in-between — so they fade back in over the tail of the move instead.
const LABEL_FADE_FROM = 0.55;

// Geometry per width mode. The gutters are **not** fixed here — they're measured per view from the
// labels that view actually shows (see `estTextPx` / the gutter block in the component), so the
// left and right margins shrink to their own labels rather than to the widest label of any view,
// and the right column always fits its names in full. The viewBox width is then just gutters +
// flow, so a view that needs little label room ends up narrower and — rendered at the container's
// width — proportionally taller.
//   FLOW_PX:  the horizontal span the ribbons themselves get, constant across views so ribbon
//             slopes read consistently.
//   MONEY_PX: pixel height of the tallest column's money (gaps come on top).
//   NAME_MAX: a safety cap on name length so one pathological label can't blow the gutter out;
//             gutters are sized to fit up to this, and it's generous rather than tight now.
//   rightTwoLine: the right column stacks name over its figure (only used where that column shows
//                 figures — the final level on desktop).
const SANKEY_GEOM = {
  desktop: { W: CHART_W, FLOW_PX: 520, MONEY_PX: 345, NAME_MAX: 22, rightTwoLine: false },
  compact: { W: 390, FLOW_PX: 250, MONEY_PX: 397, NAME_MAX: 18, rightTwoLine: true },
};

// Rough pixel width of a label string at a given font size — Hanken Grotesk averages ~0.58em per
// glyph. Only used to budget gutters, so an estimate with a margin is enough; the NAME_MAX cap and
// the per-side margin absorb the error.
const estTextPx = (s: string, fontPx: number) => s.length * fontPx * 0.58;

// The deductions ramp — a quiet warm-neutral family (deliberately near-monochrome so the
// group colours stay dominant), offset from the seeded group tokens.
const DEDUCTION_COLORS: Record<string, string> = {
  employeePension: '#a89578',
  incomeTax: '#6e6152',
  ni: '#85765f',
  sl: '#baa98c',
};
const DEDUCTION_LABELS: Record<string, string> = {
  employeePension: 'Pension',
  incomeTax: 'Income tax',
  ni: 'National Insurance',
  sl: 'Student loan',
};

type FlowNode = {
  key: string;
  name: string;
  color: string;
  value: number;
  groupId?: number; // set on group nodes — the sections with a layer below them
  ofGroup?: number; // set on category nodes: the group they belong to, so clicking one at L2
                    // knows which group L3 should root at
};
type Placed = FlowNode & { y: number; h: number };
type Link = { source: Placed; target: Placed; h: number; color: string; sy: number; ty: number };
// A column of placed nodes, plus how its labels are drawn at that position.
type Column = { placed: Placed[]; x: number; anchor: 'start' | 'end'; labelX: number; halo: boolean; twoLine: boolean };
type Stage = { links: Link[]; x0: number; x1: number };
type View = { columns: Column[]; stages: Stage[]; svgH: number; w: number };
// One painted frame: geometry resolved to numbers, each element carrying the opacity that fades
// it in or out when it exists in only one of the two views being moved between.
type RibbonGeom = { sy: number; ty: number; h: number; x0: number; x1: number };
type Frame = {
  svgH: number;
  w: number; // viewBox width — per-view (gutters vary), so it interpolates like svgH does
  nodes: { key: string; x: number; y: number; h: number; color: string; opacity: number }[];
  // `stage` is which gap the ribbon spans — 0 is the one arriving at the middle column, and a
  // ribbon arriving somewhere is that node's left-hand edge, which touch treats differently from
  // the node itself (see the render).
  ribbons: { key: string; geom: RibbonGeom; color: string; opacity: number; stage: number }[];
};

// Stack a column's nodes downward from `top`, GAP apart.
function placeColumn(nodes: FlowNode[], scale: number, top: number): Placed[] {
  let y = top;
  return nodes.map((n) => {
    const h = n.value * scale;
    const placed = { ...n, y, h };
    y += h + GAP;
    return placed;
  });
}

function columnPx(nodes: FlowNode[], scale: number): number {
  return nodes.reduce((s, n) => s + n.value * scale, 0) + Math.max(nodes.length - 1, 0) * GAP;
}

// Label y positions: node centres, nudged apart so thin adjacent nodes don't collide
// (forward pass pushes down, backward pass pulls back inside the frame).
function labelYs(nodes: Placed[], maxY: number, lineH: number): number[] {
  const ys = nodes.map((n) => n.y + n.h / 2 + 3);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + lineH);
  if (ys.length > 0) ys[ys.length - 1] = Math.min(ys[ys.length - 1], maxY);
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - lineH);
  return ys;
}

// Fan a source column out to a target column in display order — a target that straddles two
// sources simply gets a ribbon from each. Both columns carry the same total, so one scale
// keeps every ribbon's thickness equal at both ends.
function fanOut(sources: Placed[], targets: Placed[], scale: number, leftoverKey: string | null): Link[] {
  const links: Link[] = [];
  const sOff = new Map<string, number>();
  let si = 0;
  let sourceLeft = sources[0]?.value ?? 0;
  for (const t of targets) {
    let need = t.value;
    let tOff = 0;
    while (need > 0 && si < sources.length) {
      const take = Math.min(need, sourceLeft);
      const s = sources[si];
      const h = take * scale;
      links.push({
        source: s,
        target: t,
        h,
        color: t.key === leftoverKey ? 'var(--color-under)' : t.color,
        sy: s.y + (sOff.get(s.key) ?? 0),
        ty: t.y + tOff,
      });
      sOff.set(s.key, (sOff.get(s.key) ?? 0) + h);
      tOff += h;
      need -= take;
      sourceLeft -= take;
      if (sourceLeft === 0) {
        si += 1;
        sourceLeft = sources[si]?.value ?? 0;
      }
    }
  }
  return links;
}

function ribbonPath(g: RibbonGeom): string {
  const mx = (g.x0 + g.x1) / 2;
  return [
    `M ${g.x0} ${g.sy}`,
    `C ${mx} ${g.sy}, ${mx} ${g.ty}, ${g.x1} ${g.ty}`,
    `L ${g.x1} ${g.ty + g.h}`,
    `C ${mx} ${g.ty + g.h}, ${mx} ${g.sy + g.h}, ${g.x0} ${g.sy + g.h} Z`,
  ].join(' ');
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Flatten a view into a frame: every node and ribbon at its own geometry, fully opaque.
function frameOf(v: View): Frame {
  return {
    svgH: v.svgH,
    w: v.w,
    nodes: v.columns.flatMap((c) => c.placed.map((n) => ({ key: n.key, x: c.x, y: n.y, h: n.h, color: n.color, opacity: 1 }))),
    ribbons: v.stages.flatMap((s, stage) =>
      s.links.map((l) => ({
        key: `${l.source.key}-${l.target.key}`,
        geom: { sy: l.sy, ty: l.ty, h: l.h, x0: s.x0, x1: s.x1 },
        color: l.color,
        opacity: 1,
        stage,
      })),
    ),
  };
}

// One frame between two views: anything keyed in both moves, anything in only one fades. What's
// interpolated is a ribbon's five numbers — the path is regenerated from them, never blended as a
// string, so a ribbon can change shape as freely as it changes position.
function tweenFrames(from: Frame, to: Frame, t: number): Frame {
  const fromNodes = new Map(from.nodes.map((n) => [n.key, n]));
  const nodes: Frame['nodes'] = [];
  for (const b of to.nodes) {
    const a = fromNodes.get(b.key);
    nodes.push(a ? { ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: lerp(a.h, b.h, t) } : { ...b, opacity: t });
    fromNodes.delete(b.key);
  }
  for (const a of fromNodes.values()) nodes.push({ ...a, opacity: 1 - t });

  const fromRibbons = new Map(from.ribbons.map((r) => [r.key, r]));
  const ribbons: Frame['ribbons'] = [];
  for (const b of to.ribbons) {
    const a = fromRibbons.get(b.key);
    ribbons.push(a
      ? {
          ...b,
          geom: {
            sy: lerp(a.geom.sy, b.geom.sy, t),
            ty: lerp(a.geom.ty, b.geom.ty, t),
            h: lerp(a.geom.h, b.geom.h, t),
            x0: lerp(a.geom.x0, b.geom.x0, t),
            x1: lerp(a.geom.x1, b.geom.x1, t),
          },
        }
      : { ...b, opacity: t });
    fromRibbons.delete(b.key);
  }
  for (const a of fromRibbons.values()) ribbons.push({ ...a, opacity: 1 - t });

  return { svgH: lerp(from.svgH, to.svgH, t), w: lerp(from.w, to.w, t), nodes, ribbons };
}

// The gross stage's inputs for a month: the salary engine's payslip split, or null when no
// config covers the month. Values are integer pence and reconcile exactly (net = gross +
// untaxed − Σ deductions) by construction in calcSalary. One-off untaxed income belongs only
// to its explicitly saved month, so it's zeroed when the resolved config is inherited.
function salaryStage(configs: SalaryConfig[], ym: string): { deductions: { key: string; value: number }[]; net: number; untaxed: number } | null {
  const { year, month } = ymToYearMonth(ym);
  const at = configs
    .filter((c) => c.year < year || (c.year === year && c.month <= month))
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .at(-1);
  if (!at) return null;
  const isExact = at.year === year && at.month === month;
  const cfg = { ...at, year, month, untaxed_income_pence: isExact ? at.untaxed_income_pence ?? 0 : 0 };
  try {
    const breakdown = calcSalary(cfg, previewEmploymentStart(configs, cfg) ?? { year, month }, previewYtd(configs, cfg));
    const lines = breakdown.view.breakdown.find((l) => l.key === 'deductions')?.children ?? [];
    return {
      deductions: lines
        .map((l) => ({ key: l.key, value: -l.cell.monthly }))
        .filter((d) => d.value > 0),
      net: breakdown.netMonthlyPence,
      untaxed: Math.max(0, cfg.untaxed_income_pence),
    };
  } catch {
    return null;
  }
}

export function FlowSankey({ data, ym, filterActive }: { data: LedgerData; ym: string; filterActive: boolean }) {
  // How deep the chain is, and — only at the last level — which group it's rooted at. A level is
  // only ever changed by one, in either direction.
  const [level, setLevel] = useState(0);
  const [rootGroup, setRootGroup] = useState<number | null>(null);
  // An end node the user clicked: highlighted, and the phone's strip reads from it.
  const [picked, setPicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [configs, setConfigs] = useState<SalaryConfig[]>([]);
  // The geometry a level change is moving away from, and how far through that move we are.
  const [zoomFrom, setZoomFrom] = useState<Frame | null>(null);
  const [t, setT] = useState(1);
  const { wrapRef, pos, moveTo, clear } = useCursorPos();
  const { ref: frameRef, frame } = useChartFrame();
  const compact = frame.W < 480;
  const geom = compact ? SANKEY_GEOM.compact : SANKEY_GEOM.desktop;
  const { MONEY_PX, NAME_MAX } = geom;
  const coarse = coarsePointer();
  // A month change redraws every node, so the chain restarts at its top (`depth` clamps a level 0
  // up to the first level a fallback month actually has).
  useEffect(() => { setLevel(0); setRootGroup(null); setPicked(null); setZoomFrom(null); }, [ym]);
  useEffect(() => {
    let stale = false;
    getAllSalaryConfigs().then((rows) => {
      if (!stale) setConfigs(rows);
    }).catch(() => {});
    return () => {
      stale = true;
    };
  }, [data]);

  // One clock for the whole move, so nothing drifts out of step with anything else.
  useEffect(() => {
    if (zoomFrom === null) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ZOOM_MS);
      setT(easeInOut(p));
      if (p < 1) raf = requestAnimationFrame(step);
      else setZoomFrom(null);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [zoomFrom]);

  const clearHover = (e?: { pointerType?: string }) => {
    if (e?.pointerType === 'touch') return; // touch dismissal = outside tap/scroll (kit)
    setHovered(null);
    clear();
  };
  // A tap outside the chart, or a scroll, drops the inspect state — the highlight and what the
  // strip is reading. The level you've drilled to is separate state and deliberately survives:
  // it's navigation, not a tooltip.
  useDismissOnOutsideTap(hovered !== null || picked !== null, wrapRef, () => {
    setPicked(null);
    setHovered(null);
    clear();
  });

  // Memoised because a level change re-renders this component on every animation frame: an
  // un-memoised `calcSalary` + ledger aggregation per frame is exactly the kind of work that turns
  // a 300ms move into a judder on a phone. The layout maths below is small-array work and is fine
  // to redo per frame.
  const currentYm = todayISO().slice(0, 7);
  const inc = useMemo(() => income(data, ym, currentYm), [data, ym, currentYm]);
  const catTotals = useMemo(() => categoryTotals(data, ym), [data, ym]);
  const groupCats = (groupId: number) =>
    data.categories.filter((c) => c.group_id === groupId && (catTotals.get(c.id) ?? 0) > 0);
  const catNodes = (groupId: number): FlowNode[] =>
    groupCats(groupId).map((c) => ({ key: `c${c.id}`, name: c.name, color: c.color, value: catTotals.get(c.id) ?? 0, ofGroup: groupId }));

  const groupNodes: FlowNode[] = [];
  for (const g of data.groups) {
    const value = groupCats(g.id).reduce((s, c) => s + (catTotals.get(c.id) ?? 0), 0);
    if (value > 0) groupNodes.push({ key: `g${g.id}`, name: g.name, color: g.color, value, groupId: g.id });
  }
  const spend = groupNodes.reduce((s, n) => s + n.value, 0);
  const leftOver = Math.max(inc - spend, 0);
  const fromSavings = Math.max(spend - inc, 0);
  // "Spent" is one node standing for the whole spend column — what makes the top level readable
  // as a payslip rather than as fifteen destinations at once. Its parts arrive a level down.
  const sinkNodes: FlowNode[] = [
    ...(spend > 0 ? [{ key: 'spent', name: 'Spent', color: 'var(--color-ink-muted)', value: spend }] : []),
    ...(leftOver > 0 ? [{ key: 'leftover', name: 'Left over', color: 'var(--color-under)', value: leftOver }] : []),
  ];

  // The gross stage joins only when the engine's net IS the recorded income — a hand-edited
  // income month falls back rather than drawing a flow that doesn't reconcile.
  const salary = useMemo(() => salaryStage(configs, ym), [configs, ym]);
  const hasGrossStage = salary !== null && inc > 0 && salary.net === inc;
  // Payroll gross excludes one-off untaxed income (gifts aren't earnings); untaxed enters as its
  // own left-column source feeding Net pay, so gross + untaxed = Σdeductions + net exactly.
  const untaxedIn = hasGrossStage ? salary.untaxed : 0;
  const gross = hasGrossStage ? salary.deductions.reduce((s, d) => s + d.value, salary.net - untaxedIn) : 0;

  const deductionNodes: FlowNode[] = hasGrossStage
    ? salary.deductions.map((d) => ({
        key: d.key,
        name: DEDUCTION_LABELS[d.key] ?? d.key,
        color: DEDUCTION_COLORS[d.key] ?? 'var(--color-ink-faint)',
        value: d.value,
      }))
    : [];
  // Net pay, plus the savings top-up when the month overspent: it has to travel with Net pay or
  // the column feeding Spent would be smaller than Spent itself.
  const netNodes: FlowNode[] = [
    ...(inc > 0 ? [{ key: 'income', name: 'Net pay', color: 'var(--color-ink-muted)', value: inc }] : []),
    ...(fromSavings > 0 ? [{ key: 'savings', name: 'From savings', color: 'var(--color-over)', value: fromSavings }] : []),
  ];

  if (inc === 0 && spend === 0) {
    return (
      <>
        <h3 className="font-serif text-base text-ink">Money flow</h3>
        <p className="py-8 text-center text-sm text-ink-muted">No income or spend recorded for {monthLabel(ym)} yet.</p>
      </>
    );
  }

  const grossNodes: FlowNode[] = hasGrossStage
    ? [
        ...(gross > 0 ? [{ key: 'gross', name: 'Gross pay', color: 'var(--color-ink-muted)', value: gross }] : []),
        ...(untaxedIn > 0 ? [{ key: 'untaxed', name: 'Untaxed', color: 'var(--color-under)', value: untaxedIn }] : []),
      ]
    : [];

  // A month whose income doesn't reconcile has no payslip to show, so its chain starts one level
  // in — at Net pay — and there is nothing above that to climb back to.
  const TOP = hasGrossStage ? 0 : 1;
  const depth = Math.max(level, TOP);
  const rootGroupId = rootGroup ?? groupNodes[0]?.groupId ?? null;
  const totalOf = (nodes: FlowNode[]) => nodes.reduce((s, n) => s + n.value, 0);
  // A group holding a single category is drawn as a terminal stub: splitting it would draw one
  // ribbon to one node of identical value, spending a row of vertical space and a label to say
  // nothing. Dropping those is what leaves L2's right column room to label the rest properly.
  const splits = (groupId: number | undefined) => groupId !== undefined && groupCats(groupId).length > 1;

  // The root (left) and outer (right) columns of this level, membership only — enough to budget the
  // gutters and know a node's share before anything is placed.
  const leftColNodes: FlowNode[] =
    depth <= 0 ? grossNodes
      : depth === 1 ? netNodes
        : depth === 2 ? sinkNodes.filter((n) => n.key === 'spent')
          : groupNodes.filter((n) => n.groupId === rootGroupId);
  const rightColNodes: FlowNode[] =
    depth <= 0 ? sinkNodes
      : depth === 1 ? groupNodes
        : depth === 2 ? groupNodes.flatMap((g) => (splits(g.groupId) ? catNodes(g.groupId!) : []))
          : catNodes(rootGroupId ?? -1);
  const rootTotal = totalOf(leftColNodes);
  const rootKeys = new Set(leftColNodes.map((n) => n.key));
  const share = (n: FlowNode) => (rootTotal > 0 ? Math.round((n.value / rootTotal) * 100) : 0);
  // A share is only meaningful for money that arrived *from* the root. Root nodes are the base, and
  // "From savings" enters beside Net pay rather than out of it — both are sources, not shares.
  const fedFromRoot = (key: string) => !rootKeys.has(key) && key !== 'savings';

  // Where a click on a node goes: down a level, up a level, or nowhere (an end node, highlighted
  // instead). Defined here because the label rules below need to know which right-column nodes are
  // terminal (they keep their figures) versus previews of the level under them (names only).
  const stepOf = (n: FlowNode): { level: number; group?: number } | null => {
    if (rootKeys.has(n.key)) return depth > TOP ? { level: depth - 1 } : null;
    if (depth === 0) return n.key === 'income' || n.key === 'savings' || n.key === 'spent' || n.key === 'leftover' ? { level: 1 } : null;
    if (depth === 1) return n.key === 'spent' || n.groupId !== undefined ? { level: 2 } : null;
    if (depth === 2) {
      if (splits(n.groupId)) return { level: 3, group: n.groupId };
      if (n.ofGroup !== undefined && splits(n.ofGroup)) return { level: 3, group: n.ofGroup };
      return null;
    }
    return null;
  };

  // What each label reads. Names are full except where they'd run off a tight edge (the ellipsised
  // right column, and the middle column on a phone). Secondary text is per position and per
  // platform: the root shows its spend; the middle shows "£x · y%" on desktop but just "y%" on a
  // phone (room for the share, not the amount); the right column stays names-only while it's a
  // preview of the level below, and prints figures only where it's terminal or it's the last level.
  const nameFor = (name: string, colIndex: number, isLast: boolean): string =>
    isLast || (compact && colIndex !== 0) ? ellipsize(name, NAME_MAX) : name;
  const secondaryText = (n: FlowNode, colIndex: number, isLast: boolean): string | null => {
    if (colIndex === 0) return formatGBP(n.value);
    if (isLast) {
      // Names-only while the column is a preview of the level below; figures once it's terminal —
      // i.e. the final level, whose leaves have nothing under them. That's the one place a phone's
      // right column earns its figures (the gutter is measured from this, so it makes its own room).
      if (depth < 3 && stepOf(n) !== null) return null;
      return fedFromRoot(n.key) ? `${formatGBP(n.value)} · ${share(n)}%` : formatGBP(n.value);
    }
    if (compact) return fedFromRoot(n.key) ? `${share(n)}%` : null;
    return fedFromRoot(n.key) ? `${formatGBP(n.value)} · ${share(n)}%` : formatGBP(n.value);
  };

  // Gutters measured from *this* view's outermost labels, so each side shrinks to its own content
  // rather than to the widest label of any level, and the right column always fits its names. The
  // flow span between them is constant (geom.FLOW_PX), so the viewBox width is gutters + flow — a
  // level that needs little label room is narrower, and rendered at the container's width, taller.
  const NODE_PAD = 8;
  const EDGE = 4;
  const labelPx = (n: FlowNode, colIndex: number, isLast: boolean, twoLine: boolean) => {
    const nameW = estTextPx(nameFor(n.name, colIndex, isLast), 9.5);
    const sec = secondaryText(n, colIndex, isLast);
    if (!sec) return nameW;
    return twoLine ? Math.max(nameW, estTextPx(sec, 8.5)) : nameW + 6 + estTextPx(sec, 8.5);
  };
  const leftLabelW = Math.max(0, ...leftColNodes.map((n) => labelPx(n, 0, false, true)));
  const rightLabelW = Math.max(0, ...rightColNodes.map((n) => labelPx(n, 1, true, geom.rightTwoLine)));
  const X_LEFT = Math.ceil(leftLabelW) + NODE_PAD + EDGE;
  const X_RIGHT = X_LEFT + geom.FLOW_PX;
  const X_MID = Math.round((X_LEFT + X_RIGHT) / 2);
  const W = X_RIGHT + NODE_W + NODE_PAD + Math.ceil(rightLabelW) + EDGE;

  // Label treatment by position: the leftmost column stacks name over value, a middle column sits
  // over ribbon space so it wears a halo, and the last column runs single-line (two on a phone,
  // where the right names-only labels stack under nothing but keep the taller row spacing).
  const leftCol = (placed: Placed[], x: number): Column => ({ placed, x, anchor: 'end', labelX: x - NODE_PAD, halo: false, twoLine: true });
  const midCol = (placed: Placed[], x: number): Column => ({ placed, x, anchor: 'start', labelX: x + NODE_W + 6, halo: true, twoLine: false });
  const rightCol = (placed: Placed[], x: number): Column => ({ placed, x, anchor: 'start', labelX: x + NODE_W + NODE_PAD, halo: false, twoLine: geom.rightTwoLine });

  const viewOf = (columns: Column[], stages: Stage[]): View => ({
    columns,
    stages,
    svgH: Math.max(...columns.flatMap((c) => c.placed.map((n) => n.y + n.h))) + PAD_Y,
    w: W,
  });
  // Centre every column on one axis — the layout every level but the top one uses.
  const centred = (cols: FlowNode[][], scale: number) => {
    const maxColH = MONEY_PX + (Math.max(...cols.map((c) => c.length)) - 1) * GAP;
    return cols.map((nodes) => placeColumn(nodes, scale, PAD_Y + (maxColH - columnPx(nodes, scale)) / 2));
  };

  function buildView(at: number): View {
    if (at >= 3 && rootGroupId !== null) {
      // Group → its categories. The deepest level: nothing sits below a category.
      const root = groupNodes.filter((n) => n.groupId === rootGroupId);
      const cats = catNodes(rootGroupId);
      const scale = MONEY_PX / Math.max(root[0]?.value ?? 1, 1);
      const [rootPlaced, catPlaced] = centred([root, cats], scale);
      return viewOf(
        [leftCol(rootPlaced, X_LEFT), rightCol(catPlaced, X_RIGHT)],
        [{ links: fanOut(rootPlaced, catPlaced, scale, null), x0: X_LEFT + NODE_W, x1: X_RIGHT }],
      );
    }
    if (at === 2) {
      // Spent → groups → categories.
      const root = sinkNodes.filter((n) => n.key === 'spent');
      const cats = groupNodes.flatMap((g) => (splits(g.groupId) ? catNodes(g.groupId!) : []));
      const scale = MONEY_PX / Math.max(spend, 1);
      const [rootPlaced, groupPlaced, catPlaced] = centred([root, groupNodes, cats], scale);
      return viewOf(
        [leftCol(rootPlaced, X_LEFT), midCol(groupPlaced, X_MID), rightCol(catPlaced, X_RIGHT)],
        [
          { links: fanOut(rootPlaced, groupPlaced, scale, null), x0: X_LEFT + NODE_W, x1: X_MID },
          {
            // Per group, and only for the ones that split — a single-category group simply ends
            // here, the way a deduction stub ends at L0.
            links: groupPlaced.flatMap((g) => {
              if (!splits(g.groupId)) return [];
              const keys = new Set(catNodes(g.groupId!).map((c) => c.key));
              return fanOut([g], catPlaced.filter((c) => keys.has(c.key)), scale, null);
            }),
            x0: X_MID + NODE_W,
            x1: X_RIGHT,
          },
        ],
      );
    }
    if (at === 1) {
      // Net pay → Spent · [Left over] → groups. Left over stops here; only Spent carries on.
      const scale = MONEY_PX / Math.max(totalOf(netNodes), totalOf(sinkNodes), 1);
      const [netPlaced, sinkPlaced, groupPlaced] = centred([netNodes, sinkNodes, groupNodes], scale);
      const spentPlaced = sinkPlaced.filter((n) => n.key === 'spent');
      return viewOf(
        [leftCol(netPlaced, X_LEFT), midCol(sinkPlaced, X_MID), rightCol(groupPlaced, X_RIGHT)],
        [
          { links: fanOut(netPlaced, sinkPlaced, scale, 'leftover'), x0: X_LEFT + NODE_W, x1: X_MID },
          { links: fanOut(spentPlaced, groupPlaced, scale, null), x0: X_MID + NODE_W, x1: X_RIGHT },
        ],
      );
    }
    // L0 — the payslip. Columns are NOT centred here: the middle column hangs from the top and the
    // sink column's top aligns with Net pay's top edge, so no ribbon ever rises into the deduction
    // -label zone — the space right of the deduction stubs stays ribbon-free and their labels never
    // overlap the drawing.
    const midNodes = [...deductionNodes, ...netNodes];
    const scale = MONEY_PX / Math.max(gross + untaxedIn, totalOf(midNodes), totalOf(sinkNodes));
    const midPlaced = placeColumn(midNodes, scale, PAD_Y);
    const aNodes = midPlaced.filter((n) => n.key !== 'savings');
    const aTop = aNodes[0].y;
    const aBottom = aNodes[aNodes.length - 1].y + aNodes[aNodes.length - 1].h;
    const grossPlaced = placeColumn(grossNodes, scale, aTop + (aBottom - aTop - columnPx(grossNodes, scale)) / 2);
    const sinkPlaced = placeColumn(sinkNodes, scale, midPlaced.find((n) => n.key === 'income')!.y);
    return viewOf(
      [leftCol(grossPlaced, X_LEFT), midCol(midPlaced, X_MID), rightCol(sinkPlaced, X_RIGHT)],
      [
        { links: fanOut(grossPlaced, aNodes, scale, null), x0: X_LEFT + NODE_W, x1: X_MID },
        {
          links: fanOut(midPlaced.filter((n) => n.key === 'income' || n.key === 'savings'), sinkPlaced, scale, 'leftover'),
          x0: X_MID + NODE_W,
          x1: X_RIGHT,
        },
      ],
    );
  }

  const view = buildView(depth);
  const allPlaced = view.columns.flatMap((c) => c.placed);
  const nodeByKey = new Map(allPlaced.map((n) => [n.key, n]));
  const painted = zoomFrom ? tweenFrames(zoomFrom, frameOf(view), t) : frameOf(view);
  const labelOpacity = zoomFrom ? Math.max(0, (t - LABEL_FADE_FROM) / (1 - LABEL_FADE_FROM)) : 1;

  const goTo = (step: { level: number; group?: number }) => {
    // Motion is the point of the move, but it's still motion: honour the OS setting and land
    // straight on the new level. A click mid-flight starts from what's on screen, not from the
    // level being animated towards, so a quick second click doesn't snap backwards first.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setZoomFrom(reduced ? null : painted);
    setT(reduced ? 1 : 0);
    setLevel(step.level);
    if (step.group !== undefined) setRootGroup(step.group);
    setPicked(null);
    setHovered(null);
    clear();
  };
  // Light a node and put its figures in the strip. Touch only: on a mouse, hovering already shows
  // all of this and lets go of it again, so a click that pinned a highlight would only be
  // something else to undo.
  const pick = (key: string) => { if (coarse) setPicked((was) => (was === key ? null : key)); };
  const onNodeClick = (n: FlowNode | undefined) => {
    if (!n) return;
    const step = stepOf(n);
    if (step) goTo(step);
    else pick(n.key);
  };
  const release = () => { setPicked(null); setHovered(null); clear(); };

  const boxRow = (n: { key: string | number; color: string; name: string; value: number }, of: number, plus = false) => ({
    key: n.key,
    color: n.color,
    name: n.name,
    value: formatGBP(n.value),
    // `plus` marks a row that *adds* to the total rather than being a slice of it — "From savings"
    // tops the gross column up rather than coming out of it, so a bare "5%" reads wrong; "+5%" says
    // it's extra.
    right: `${plus ? '+' : ''}${Math.round((Math.min(n.value, of) / of) * 100)}%`,
    rightClass: 'w-9 text-[10px] text-ink-faint',
  });
  // Desktop hover boxes, matching the donut/bars idiom: whatever the hovered section is made of.
  const hoverRows = (() => {
    if (hovered === null) return null;
    const node = nodeByKey.get(hovered);
    if (!node) return null;
    if (hovered === 'gross') return { title: 'Gross pay', rows: [...deductionNodes, ...netNodes].map((n) => boxRow({ ...n, key: n.key }, gross + untaxedIn, n.key === 'savings')) };
    if (hovered === 'income') return { title: 'Net pay', rows: sinkNodes.map((n) => boxRow({ ...n, key: n.key }, inc)) };
    if (hovered === 'spent') return { title: 'Spent', rows: groupNodes.map((n) => boxRow({ ...n, key: n.key }, spend)) };
    if (node.groupId !== undefined) {
      const cats = catNodes(node.groupId).sort((a, b) => b.value - a.value);
      return { title: node.name, rows: cats.map((c) => boxRow({ ...c, key: c.key }, node.value)) };
    }
    return null;
  })();

  // Hovering a node lights it, its ribbons, and the nodes at their far ends; a picked end node
  // stays lit until it's released.
  const lit = hovered ?? picked;
  const activeKeys =
    lit === null
      ? null
      : new Set(
          [lit].concat(
            view.stages.flatMap((s) => s.links)
              .filter((l) => l.source.key === lit || l.target.key === lit)
              .flatMap((l) => [l.source.key, l.target.key]),
          ),
        );
  const linkKeyActive = (key: string) => lit === null || key.split('-').includes(lit);

  // The phone's strip: the level's root, or the end node last tapped. One line, always — the layer
  // to the right of a section is its breakdown now, and a list of rows that grew and shrank with
  // the section moved the chart under the finger tapping it.
  const stripNode = (picked !== null ? nodeByKey.get(picked) : null) ?? null;
  const stripRoot = view.columns[0].placed;

  return (
    <div ref={frameRef}>
    {/* select-none: a press on a label used to start a text selection rather than read as a
        click. No touch-action here on purpose — the sankey claims no drag, so a horizontal swipe
        across it still pages the sub-tabs. */}
    <div ref={wrapRef} className="relative select-none">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h3 className="font-serif text-base text-ink">Money flow</h3>
          {/* Jumps straight back to the top view, animating the whole way. Styled like MonthPicker's
              "Today" and, like it, shown only when there's somewhere to go back to. */}
          {depth > TOP && (
            <button
              type="button"
              onClick={() => goTo({ level: TOP })}
              className="text-xs text-ink-muted transition-colors hover:text-accent"
            >
              Reset view
            </button>
          )}
        </div>
        {filterActive && <span className="text-[11px] text-ink-faint">all money — ignores the category filter</span>}
      </div>

      {coarse && (
        <ChartInspectStrip
          active={stripNode !== null}
          title={stripNode ? stripNode.name : stripRoot.map((n) => n.name).join(' + ')}
          value={
            stripNode === null || !fedFromRoot(stripNode.key)
              ? formatGBP(stripNode ? stripNode.value : rootTotal)
              : `${formatGBP(stripNode.value)} · ${share(stripNode)}%`
          }
        />
      )}

      <svg
        viewBox={`0 0 ${painted.w} ${painted.svgH}`}
        className="w-full"
        // Background click releases the picked node — both the strip's figures and the highlight,
        // which is a lingering `hovered` on touch, where nothing else clears it. It deliberately
        // doesn't climb a level: the root column is the one way back, so a stray tap can't lose
        // your place.
        onClick={release}
        role="img"
        aria-label={hasGrossStage ? "Money flow: gross pay through deductions and net pay into the month's groups" : "Money flow: net pay into the month's groups"}
      >
        {/* Ribbons and nodes are painted from the frame, so the ones that exist in only one of the
            two levels can fade out on their own geometry instead of vanishing. Interaction hangs
            off the live view: a shape on its way out isn't a target. */}
        {painted.ribbons.map((r) => {
          const target = nodeByKey.get(r.key.slice(r.key.indexOf('-') + 1));
          // A ribbon into the middle column is that node's left-hand edge. On touch, tapping it
          // *selects* the node it feeds rather than stepping — otherwise the middle column's own
          // shares would be unreachable on a phone, since tapping the node steps past them and
          // there's no hover to fall back on. Everything further right still steps, and a mouse
          // steps everywhere, because hovering already shows what a tap here is for.
          const selects = coarse && r.stage === 0;
          return (
            <path
              key={r.key}
              d={ribbonPath(r.geom)}
              fill={r.color}
              stroke="var(--color-panel)"
              strokeWidth={1}
              className={target && (selects || stepOf(target)) ? 'cursor-pointer' : ''}
              style={{
                opacity: r.opacity * (linkKeyActive(r.key) ? (lit === null ? 0.5 : 0.75) : 0.15),
                transition: zoomFrom ? undefined : 'opacity 150ms',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!target) return;
                if (selects) pick(target.key);
                else onNodeClick(target);
              }}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse' && target) setHovered(target.key); }}
              onPointerMove={(e) => { if (e.pointerType === 'mouse') moveTo(e); }}
              onPointerDown={(e) => { if (e.pointerType !== 'touch' && target) { setHovered(target.key); moveTo(e); } }}
              onPointerLeave={clearHover}
            >
              {target && <title>{target.name}</title>}
            </path>
          );
        })}

        {painted.nodes.map((p) => {
          const n = nodeByKey.get(p.key);
          const step = n && stepOf(n);
          return (
            <g
              key={p.key}
              className={n ? 'cursor-pointer' : ''}
              style={{ opacity: p.opacity * (activeKeys !== null && !activeKeys.has(p.key) ? 0.35 : 1), transition: zoomFrom ? undefined : 'opacity 150ms' }}
              onClick={(e) => { e.stopPropagation(); onNodeClick(n); }}
              // Touch sets nothing on the way down: the highlight there is `picked`, set by the
              // click, so it can be released again. A lingering `hovered` had no way to clear.
              onPointerEnter={(e) => { if (e.pointerType === 'mouse' && n) setHovered(n.key); }}
              onPointerMove={(e) => { if (e.pointerType === 'mouse') moveTo(e); }}
              onPointerDown={(e) => { if (e.pointerType !== 'touch' && n) { setHovered(n.key); moveTo(e); } }}
              onPointerLeave={clearHover}
            >
              <rect x={p.x} y={p.y} width={NODE_W} height={Math.max(p.h, 1.5)} rx={2} fill={p.color} stroke="var(--color-panel)" strokeWidth={1}>
                {n && (
                  <title>
                    {step === null
                      ? n.name
                      : rootKeys.has(n.key)
                        ? `${n.name} — click to go back`
                        : `${n.name} — click to go deeper`}
                  </title>
                )}
              </rect>
            </g>
          );
        })}

        {/* Labels sit at the settled positions and fade in over the tail of a move — a node
            changing column changes its anchor and line count, which has no useful in-between. */}
        <g style={{ opacity: labelOpacity }}>
          {view.columns.map((col, colIndex) => {
            const isLast = colIndex === view.columns.length - 1;
            // Two lines only when this column actually has a secondary line to show — a names-only
            // right column (a preview level, or any right column on a phone) keeps single-line
            // spacing so it doesn't float above empty space.
            const twoLine = col.twoLine && col.placed.some((n) => secondaryText(n, colIndex, isLast) !== null);
            const ys = labelYs(col.placed, view.svgH - (twoLine ? 12 : 4), twoLine ? 23 : 11);
            // Only the root label is a click target: it's the way back a level, the same as
            // clicking the node, so the whole name is a hit area rather than a 12px bar. Every
            // other label stays inert so the ribbons and nodes beneath them take the events.
            const backable = colIndex === 0 && depth > TOP;
            const labelProps = backable
              ? { className: 'cursor-pointer', onClick: (e: ReactMouseEvent) => { e.stopPropagation(); onNodeClick(nodeByKey.get(col.placed[0].key)); } }
              : { pointerEvents: 'none' as const };
            return col.placed.map((n, i) => {
              const sec = secondaryText(n, colIndex, isLast);
              const name = nameFor(n.name, colIndex, isLast);
              return twoLine ? (
                <g key={n.key} {...labelProps}>
                  <text
                    x={col.labelX}
                    y={sec === null ? ys[i] : ys[i] - 5}
                    textAnchor={col.anchor}
                    className={`fill-ink text-[9.5px] ${lit === n.key ? 'font-semibold' : ''}`}
                  >
                    {name}
                  </text>
                  {sec !== null && (
                    <text x={col.labelX} y={ys[i] + 6} textAnchor={col.anchor} className="fill-ink-faint text-[8.5px] tabular-nums">
                      {sec}
                    </text>
                  )}
                </g>
              ) : (
                <text
                  key={n.key}
                  x={col.labelX}
                  y={ys[i]}
                  textAnchor={col.anchor}
                  style={col.halo ? { paintOrder: 'stroke', stroke: 'var(--color-panel)', strokeWidth: 3 } : undefined}
                  {...labelProps}
                >
                  <tspan className={`fill-ink text-[9.5px] ${lit === n.key ? 'font-semibold' : ''}`}>{name}</tspan>
                  {sec !== null && (
                    <tspan className="fill-ink-faint text-[8.5px] tabular-nums" dx={6}>
                      {sec}
                    </tspan>
                  )}
                </text>
              );
            });
          })}
        </g>
      </svg>

      {!coarse && hoverRows !== null && pos !== null && hoverRows.rows.length > 0 && (
        <CursorBreakdownBox wrapRef={wrapRef} pos={pos} title={hoverRows.title} rows={hoverRows.rows} />
      )}
    </div>
    </div>
  );
}
