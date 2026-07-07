import { useEffect, useState } from 'react';
import { calcSalary, categoryTotals, formatGBP, income, type LedgerData, type SalaryConfig } from '@budget/core';
import { getAllSalaryConfigs } from '../api';
import { previewEmploymentStart, previewYtd, ymToYearMonth } from '../features/salary/salaryState';
import { monthLabel, todayISO } from '../lib/dates';
import { CHART_W, ellipsize, useChartFrame, useCursorPos, useDismissOnOutsideTap } from './kit';
import { CursorBreakdownBox } from './kitComponents';

// Money flow — a sankey for the viewed month. When the salary engine's net pay for the month
// exactly matches the recorded income (true by construction for months saved via the Salary
// tab), a gross stage leads: Gross pay (left) splits into the payslip deductions (terminal
// stubs) and Net pay (middle), which fans out into the month's groups (right); otherwise the
// chart falls back to the two-column Net pay → groups flow, so it never draws a join that
// doesn't add up. A month that spent past its income gets a red "From savings" source beside
// Net pay filling the difference; one that didn't gets a green "Left over" band. Like Net
// Balance, this is real money: it ignores the category filter (hidden spend would otherwise
// masquerade as left over). Clicking a group drills it into its categories in place.

const NODE_W = 12;
const GAP = 6;
const PAD_Y = 10;

// Frame + label-gutter geometry per width mode. Desktop keeps the original numbers exactly;
// compact shrinks the viewBox to ~1:1 pixels on a phone, narrows the gutters, and switches
// the right column's labels to two lines (name over value) so they fit the smaller gutter.
// L_GUTTER: two-line left labels (name over value) keep this narrow.
// MONEY_PX: pixel height of the tallest column's money (gaps come on top).
// NAME_MAX: ellipsize length for single-line node names.
const SANKEY_GEOM = {
  desktop: { W: CHART_W, L_GUTTER: 86, R_GUTTER: 132, MONEY_PX: 200, NAME_MAX: 14, rightTwoLine: false },
  compact: { W: 390, L_GUTTER: 64, R_GUTTER: 84, MONEY_PX: 230, NAME_MAX: 11, rightTwoLine: true },
};

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
  ni: 'National Ins.',
  sl: 'Student loan',
};

type FlowNode = {
  key: string;
  name: string;
  color: string;
  value: number;
  groupId?: number; // set on right-column group nodes (click to drill)
};
type Placed = FlowNode & { y: number; h: number };
type Link = { source: Placed; target: Placed; h: number; color: string; sy: number; ty: number };

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

// The gross stage's inputs for a month: the salary engine's payslip split, or null when no
// config covers the month. Values are integer pence and reconcile exactly (net = gross − Σ
// deductions) by construction in calcSalary.
function salaryStage(configs: SalaryConfig[], ym: string): { deductions: { key: string; value: number }[]; net: number } | null {
  const { year, month } = ymToYearMonth(ym);
  const at = configs
    .filter((c) => c.year < year || (c.year === year && c.month <= month))
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .at(-1);
  if (!at) return null;
  const cfg = { ...at, year, month };
  try {
    const breakdown = calcSalary(cfg, previewEmploymentStart(configs, cfg) ?? { year, month }, previewYtd(configs, cfg));
    const lines = breakdown.view.breakdown.find((l) => l.key === 'deductions')?.children ?? [];
    return {
      deductions: lines
        .map((l) => ({ key: l.key, value: -l.cell.monthly }))
        .filter((d) => d.value > 0),
      net: breakdown.netMonthlyPence,
    };
  } catch {
    return null;
  }
}

export function FlowSankey({ data, ym, filterActive }: { data: LedgerData; ym: string; filterActive: boolean }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [configs, setConfigs] = useState<SalaryConfig[]>([]);
  const { wrapRef, pos, moveTo, clear } = useCursorPos();
  const { ref: frameRef, frame } = useChartFrame();
  const geom = frame.W < 480 ? SANKEY_GEOM.compact : SANKEY_GEOM.desktop;
  const { W, L_GUTTER, R_GUTTER, MONEY_PX, NAME_MAX } = geom;
  const X_LEFT = L_GUTTER;
  const X_RIGHT = W - R_GUTTER - NODE_W;
  const X_MID = Math.round((X_LEFT + X_RIGHT) / 2);
  useEffect(() => setExpanded(null), [ym]);
  useEffect(() => {
    let stale = false;
    getAllSalaryConfigs().then((rows) => {
      if (!stale) setConfigs(rows);
    }).catch(() => {});
    return () => {
      stale = true;
    };
  }, [data]);

  const clearHover = (e?: { pointerType?: string }) => {
    if (e?.pointerType === 'touch') return; // touch dismissal = outside tap/scroll (kit)
    setHovered(null);
    clear();
  };
  useDismissOnOutsideTap(hovered !== null, wrapRef, () => setHovered(null));

  const currentYm = todayISO().slice(0, 7);
  const inc = income(data, ym, currentYm);
  const catTotals = categoryTotals(data, ym);
  const groupCats = (groupId: number) =>
    data.categories.filter((c) => c.group_id === groupId && (catTotals.get(c.id) ?? 0) > 0);

  const spendNodes: FlowNode[] = [];
  for (const g of data.groups) {
    const cats = groupCats(g.id);
    const value = cats.reduce((s, c) => s + (catTotals.get(c.id) ?? 0), 0);
    if (value === 0) continue;
    if (expanded === g.id) {
      for (const c of cats) spendNodes.push({ key: `c${c.id}`, name: c.name, color: c.color, value: catTotals.get(c.id) ?? 0 });
    } else {
      spendNodes.push({ key: `g${g.id}`, name: g.name, color: g.color, value, groupId: g.id });
    }
  }
  const spend = spendNodes.reduce((s, n) => s + n.value, 0);
  const leftOver = Math.max(inc - spend, 0);
  const fromSavings = Math.max(spend - inc, 0);
  if (leftOver > 0) spendNodes.push({ key: 'leftover', name: 'Left over', color: 'var(--color-under)', value: leftOver });

  // The gross stage joins only when the engine's net IS the recorded income — a hand-edited
  // income month falls back rather than drawing a flow that doesn't reconcile.
  const salary = salaryStage(configs, ym);
  const hasGrossStage = salary !== null && inc > 0 && salary.net === inc;
  const gross = hasGrossStage ? salary.deductions.reduce((s, d) => s + d.value, salary.net) : 0;

  const midNodes: FlowNode[] = [];
  if (hasGrossStage) {
    for (const d of salary.deductions) {
      midNodes.push({ key: d.key, name: DEDUCTION_LABELS[d.key] ?? d.key, color: DEDUCTION_COLORS[d.key] ?? 'var(--color-ink-faint)', value: d.value });
    }
  }
  if (inc > 0) midNodes.push({ key: 'income', name: 'Net pay', color: 'var(--color-ink-muted)', value: inc });
  if (fromSavings > 0) midNodes.push({ key: 'savings', name: 'From savings', color: 'var(--color-over)', value: fromSavings });

  if (inc === 0 && spend === 0) {
    return (
      <>
        <h3 className="font-serif text-base text-ink">Money flow</h3>
        <p className="py-8 text-center text-sm text-ink-muted">No income or spend recorded for {monthLabel(ym)} yet.</p>
      </>
    );
  }

  const grossNodes: FlowNode[] = hasGrossStage ? [{ key: 'gross', name: 'Gross pay', color: 'var(--color-ink-muted)', value: gross }] : [];

  // One money→pixel scale across every column, sized by the tallest column's total.
  const midTotal = midNodes.reduce((s, n) => s + n.value, 0);
  const spendTotal = spendNodes.reduce((s, n) => s + n.value, 0);
  const total = Math.max(gross, midTotal, spendTotal);
  const scale = MONEY_PX / total;

  // Vertical layout. With the gross stage, columns are NOT centred: the middle column hangs
  // from the top and the spend column's top aligns with Net pay's top edge, so no spend ribbon
  // ever rises into the deduction-label zone — the space right of the deduction stubs stays
  // ribbon-free and their labels never overlap the drawing. Without it, both columns centre.
  let grossPlaced: Placed[] = [];
  let midPlaced: Placed[];
  let spendPlaced: Placed[];
  if (hasGrossStage) {
    midPlaced = placeColumn(midNodes, scale, PAD_Y);
    const aNodes = midPlaced.filter((n) => n.key !== 'savings');
    const aTop = aNodes[0].y;
    const aBottom = aNodes[aNodes.length - 1].y + aNodes[aNodes.length - 1].h;
    grossPlaced = placeColumn(grossNodes, scale, aTop + (aBottom - aTop - columnPx(grossNodes, scale)) / 2);
    spendPlaced = placeColumn(spendNodes, scale, midPlaced.find((n) => n.key === 'income')!.y);
  } else {
    const maxColH = MONEY_PX + (Math.max(midNodes.length, spendNodes.length) - 1) * GAP;
    midPlaced = placeColumn(midNodes, scale, PAD_Y + (maxColH - columnPx(midNodes, scale)) / 2);
    spendPlaced = placeColumn(spendNodes, scale, PAD_Y + (maxColH - columnPx(spendNodes, scale)) / 2);
  }
  const svgH = Math.max(...[...grossPlaced, ...midPlaced, ...spendPlaced].map((n) => n.y + n.h)) + PAD_Y;

  const xMid = hasGrossStage ? X_MID : X_LEFT;

  // Stage A: gross → deductions + net. Stage B: net (+ savings) → groups (+ left over).
  const stageA = hasGrossStage
    ? fanOut(grossPlaced, midPlaced.filter((n) => n.key !== 'savings'), scale, null)
    : [];
  const stageB = fanOut(midPlaced.filter((n) => n.key === 'income' || n.key === 'savings'), spendPlaced, scale, 'leftover');

  const ribbonPath = (l: Link, x0: number, x1: number) => {
    const mx = (x0 + x1) / 2;
    return [
      `M ${x0} ${l.sy}`,
      `C ${mx} ${l.sy}, ${mx} ${l.ty}, ${x1} ${l.ty}`,
      `L ${x1} ${l.ty + l.h}`,
      `C ${mx} ${l.ty + l.h}, ${mx} ${l.sy + l.h}, ${x0} ${l.sy + l.h} Z`,
    ].join(' ');
  };

  // Hovering a node lights it, its ribbons, and the nodes at their far ends.
  const allLinks = stageA.concat(stageB);
  const activeKeys =
    hovered === null
      ? null
      : new Set(
          [hovered].concat(
            allLinks.filter((l) => l.source.key === hovered || l.target.key === hovered).flatMap((l) => [l.source.key, l.target.key]),
          ),
        );
  const linkActive = (l: Link) => hovered === null || l.source.key === hovered || l.target.key === hovered;

  const drilled = expanded !== null;
  const onNodeClick = (n: FlowNode) => {
    if (drilled) setExpanded(null);
    else if (n.groupId !== undefined) setExpanded(n.groupId);
  };

  // The left column stacks name over value (a narrow gutter); mid/right labels are single-line.
  // Mid labels can sit over ribbon space (Net pay / From savings), so they wear a halo.
  const halo = { paintOrder: 'stroke' as const, stroke: 'var(--color-panel)', strokeWidth: 3 };
  const columns = [
    ...(hasGrossStage
      ? [{ placed: grossPlaced, x: X_LEFT, anchor: 'end' as const, labelX: X_LEFT - 8, halo: false, twoLine: true }]
      : []),
    {
      placed: midPlaced,
      x: xMid,
      anchor: hasGrossStage ? ('start' as const) : ('end' as const),
      labelX: hasGrossStage ? xMid + NODE_W + 6 : xMid - 8,
      halo: hasGrossStage,
      twoLine: !hasGrossStage,
    },
    { placed: spendPlaced, x: X_RIGHT, anchor: 'start' as const, labelX: X_RIGHT + NODE_W + 8, halo: false, twoLine: geom.rightTwoLine },
  ];

  const hoveredGroup = hovered?.startsWith('g') ? data.groups.find((g) => `g${g.id}` === hovered) ?? null : null;
  const boxRow = (n: { key: string | number; color: string; name: string; value: number }, of: number) => ({
    key: n.key,
    color: n.color,
    name: n.name,
    value: formatGBP(n.value),
    right: `${Math.round((Math.min(n.value, of) / of) * 100)}%`,
    rightClass: 'w-9 text-[10px] text-ink-faint',
  });

  return (
    <div ref={frameRef}>
    <div ref={wrapRef} className="relative">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h3 className="font-serif text-base text-ink">Money flow</h3>
          {drilled && (
            <button type="button" onClick={() => setExpanded(null)} className="text-xs text-ink-muted transition-colors hover:text-accent hover:font-semibold">
              ‹ all groups
            </button>
          )}
        </div>
        {filterActive && <span className="text-[11px] text-ink-faint">all money — ignores the category filter</span>}
      </div>

      <svg
        viewBox={`0 0 ${W} ${svgH}`}
        className="w-full"
        role="img"
        aria-label={hasGrossStage ? "Money flow: gross pay through deductions and net pay into the month's groups" : "Money flow: net pay into the month's groups"}
      >
        {[
          { links: stageA, x0: X_LEFT + NODE_W, x1: xMid },
          { links: stageB, x0: xMid + NODE_W, x1: X_RIGHT },
        ].map((stage) =>
          stage.links.map((l) => (
            <path
              key={`${l.source.key}-${l.target.key}`}
              d={ribbonPath(l, stage.x0, stage.x1)}
              fill={l.color}
              stroke="var(--color-panel)"
              strokeWidth={1}
              className={l.target.groupId !== undefined || drilled ? 'cursor-pointer' : ''}
              style={{ opacity: linkActive(l) ? (hovered === null ? 0.5 : 0.75) : 0.15, transition: 'opacity 150ms' }}
              onClick={() => onNodeClick(l.target)}
              onPointerEnter={() => setHovered(l.target.key)}
              onPointerMove={moveTo}
              onPointerDown={(e) => { setHovered(l.target.key); moveTo(e); }}
              onPointerLeave={clearHover}
            >
              <title>{`${l.source.name} → ${l.target.name}`}</title>
            </path>
          )),
        )}

        {columns.map((col) => {
          const ys = labelYs(col.placed, svgH - (col.twoLine ? 14 : 4), col.twoLine ? 27 : 13);
          return col.placed.map((n, i) => (
            <g
              key={n.key}
              className={n.groupId !== undefined || drilled ? 'cursor-pointer' : ''}
              style={{ opacity: activeKeys !== null && !activeKeys.has(n.key) ? 0.35 : 1, transition: 'opacity 150ms' }}
              onClick={() => onNodeClick(n)}
              onPointerEnter={() => setHovered(n.key)}
              onPointerMove={moveTo}
              onPointerDown={(e) => { setHovered(n.key); moveTo(e); }}
              onPointerLeave={clearHover}
            >
              <rect x={col.x} y={n.y} width={NODE_W} height={Math.max(n.h, 1.5)} rx={2} fill={n.color} stroke="var(--color-panel)" strokeWidth={1}>
                <title>{n.name}</title>
              </rect>
              {col.twoLine ? (
                <>
                  <text x={col.labelX} y={ys[i] - 6} textAnchor={col.anchor} className={`fill-ink text-[11px] ${hovered === n.key ? 'font-semibold' : ''}`}>
                    {n.name}
                  </text>
                  <text x={col.labelX} y={ys[i] + 7} textAnchor={col.anchor} className="fill-ink-faint text-[10px] tabular-nums">
                    {formatGBP(n.value)}
                  </text>
                </>
              ) : (
                <text x={col.labelX} y={ys[i]} textAnchor={col.anchor} style={col.halo ? halo : undefined}>
                  <tspan className={`fill-ink text-[11px] ${hovered === n.key ? 'font-semibold' : ''}`}>{ellipsize(n.name, NAME_MAX)}</tspan>
                  <tspan className="fill-ink-faint text-[10px] tabular-nums" dx={6}>
                    {formatGBP(n.value)}
                  </tspan>
                </text>
              )}
            </g>
          ));
        })}
      </svg>

      {/* Hover boxes, matching the donut/bars idiom: a group shows its category make-up,
         Net pay shows where it all went, Gross pay shows the payslip split. */}
      {hoveredGroup !== null && pos !== null && !drilled && (() => {
        const cats = groupCats(hoveredGroup.id)
          .map((c) => ({ key: c.id, name: c.name, color: c.color, value: catTotals.get(c.id) ?? 0 }))
          .sort((a, b) => b.value - a.value);
        const groupTotal = cats.reduce((s, c) => s + c.value, 0);
        if (groupTotal === 0) return null;
        return <CursorBreakdownBox wrapRef={wrapRef} pos={pos} title={hoveredGroup.name} rows={cats.map((c) => boxRow(c, groupTotal))} />;
      })()}
      {hovered === 'income' && pos !== null && (
        <CursorBreakdownBox wrapRef={wrapRef} pos={pos} title="Net pay" rows={spendPlaced.map((n) => boxRow(n, inc))} />
      )}
      {hovered === 'gross' && pos !== null && (
        <CursorBreakdownBox
          wrapRef={wrapRef}
          pos={pos}
          title="Gross pay"
          rows={midPlaced.filter((n) => n.key !== 'savings').map((n) => boxRow(n, gross))}
        />
      )}
    </div>
    </div>
  );
}
