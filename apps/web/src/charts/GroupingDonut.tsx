import { useEffect, useState } from 'react';
import { arc, pie } from 'd3-shape';
import { categoryTotals, formatGBP, type LedgerData } from '@budget/core';
import { useCursorPos } from './kit';
import { CursorBreakdownBox } from './kitComponents';

type Slice = { id: number; name: string; color: string; value: number };

const R_OUTER = 96;
const R_INNER = 60;

export function GroupingDonut({
  data,
  ym,
  hiddenCategoryIds,
}: {
  data: LedgerData;
  ym: string;
  hiddenCategoryIds: Set<number>;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  // Cursor position (relative to the wrapper) for the hover breakdown box.
  const { wrapRef, pos, moveTo: onHoverMove, clear } = useCursorPos();
  useEffect(() => setExpanded(null), [ym, hiddenCategoryIds]);
  useEffect(() => setHoveredId(null), [expanded]);

  const clearHover = () => {
    setHoveredId(null);
    clear();
  };

  const catTotals = categoryTotals(data, ym);
  const groupValue = (groupId: number) =>
    data.categories
      .filter((c) => c.group_id === groupId && !hiddenCategoryIds.has(c.id))
      .reduce((sum, c) => sum + (catTotals.get(c.id) ?? 0), 0);

  const groupSlices: Slice[] = data.groups
    .map((g) => ({ id: g.id, name: g.name, color: g.color, value: groupValue(g.id) }))
    .filter((s) => s.value > 0);

  const expandedGroup = expanded !== null ? data.groups.find((g) => g.id === expanded) ?? null : null;
  const categorySlices: Slice[] = expandedGroup
    ? data.categories
        .filter((c) => c.group_id === expandedGroup.id && !hiddenCategoryIds.has(c.id) && (catTotals.get(c.id) ?? 0) > 0)
        .map((c) => ({ id: c.id, name: c.name, color: c.color, value: catTotals.get(c.id) ?? 0 }))
    : [];

  const drilled = expandedGroup !== null && categorySlices.length > 0;
  const slices = drilled ? categorySlices : groupSlices;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const allGroupsTotal = groupSlices.reduce((sum, s) => sum + s.value, 0);

  if (groupSlices.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">No spend recorded for this month yet.</p>;
  }

  const arcs = pie<Slice>().value((d) => d.value).sort(null)(slices);
  const arcGen = arc<(typeof arcs)[number]>().innerRadius(R_INNER).outerRadius(R_OUTER).padAngle(0.012).cornerRadius(2);

  const collapse = () => setExpanded(null);
  const hoveredSlice = hoveredId !== null ? slices.find((s) => s.id === hoveredId) ?? null : null;

  return (
    <div ref={wrapRef} className="relative flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
      <svg viewBox="-104 -104 208 208" className="w-44 shrink-0" role="img" aria-label="Spend by group">
        {arcs.map((a) => (
          <path
            key={a.data.id}
            d={arcGen(a) ?? ''}
            fill={a.data.color}
            stroke="var(--color-panel)"
            strokeWidth={1}
            className="cursor-pointer transition-opacity"
            style={{ opacity: hoveredId !== null && hoveredId !== a.data.id ? 0.35 : 1 }}
            onClick={() => (drilled ? collapse() : setExpanded(a.data.id))}
            onMouseEnter={() => setHoveredId(a.data.id)}
            onMouseMove={onHoverMove}
            onMouseLeave={clearHover}
          >
            <title>{a.data.name}</title>
          </path>
        ))}
        <text textAnchor="middle" y={-2} className="fill-ink font-serif text-[19px]">
          {hoveredSlice ? formatGBP(hoveredSlice.value) : formatGBP(total)}
        </text>
        <text textAnchor="middle" y={16} className="fill-ink-faint text-[10px] uppercase tracking-wide">
          {hoveredSlice
            ? `${hoveredSlice.name} · ${Math.round((hoveredSlice.value / total) * 100)}%`
            : drilled ? `${expandedGroup.name} · ${Math.round((total / allGroupsTotal) * 100)}%` : hiddenCategoryIds.size > 0 ? 'filtered' : 'total'}
        </text>
      </svg>

      <div className="flex-1">
        <ul className="overflow-hidden rounded">
          {drilled && (
            <li>
              <button type="button" onClick={collapse} className="flex w-full items-center gap-3 py-0.5 text-xs text-ink-muted transition-colors hover:text-accent hover:font-semibold bg-raised/40">
                <span className="shrink-0 pl-5">‹ all groups</span>
              </button>
            </li>
          )}
          {slices.map((s, index) => {
            const active = hoveredId === s.id;
            return (
              <li key={s.id} className={drilled || index > 0 ? 'border-t border-hairline' : ''}>
                <button
                  type="button"
                  onClick={() => (drilled ? collapse() : setExpanded(s.id))}
                  className="flex w-full items-center gap-3 py-1 text-left text-sm transition-opacity bg-raised/40"
                  style={{ opacity: hoveredId !== null && !active ? 0.45 : 1 }}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseMove={onHoverMove}
                  onMouseLeave={clearHover}
                >
                  <div className="flex w-32 shrink-0 items-center gap-1.5 text-sm text-ink">
                    <span className="w-3 shrink-0" />
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                    <span className={`truncate ${active ? 'font-semibold text-accent' : ''}`}>{s.name}</span>
                  </div>
                  <div className="flex-1" />
                  <div className="flex w-28 shrink-0 items-center pr-1 text-sm tabular-nums">
                    <span className={`w-8 text-right ${active ? 'font-semibold text-ink' : 'text-ink-faint'}`}>
                      {Math.round((s.value / total) * 100)}%
                    </span>
                    <span className={`ml-auto text-ink ${active ? (drilled ? 'font-semibold' : 'font-bold') : drilled ? 'font-medium' : 'font-semibold'}`}>{formatGBP(s.value)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Hovering a group (slice or legend row) shows its category make-up — the same
         column-aligned box as the vs-last-month bars. Drilled mode already IS the
         category level, so no box there. */}
      {!drilled && hoveredId !== null && pos !== null && (() => {
        const group = data.groups.find((g) => g.id === hoveredId);
        if (!group) return null;
        const cats = data.categories
          .filter((c) => c.group_id === group.id && !hiddenCategoryIds.has(c.id))
          .map((c) => ({ id: c.id, name: c.name, color: c.color, value: catTotals.get(c.id) ?? 0 }))
          .filter((c) => c.value > 0)
          .sort((a, b) => b.value - a.value);
        if (cats.length === 0) return null;
        const groupTotal = cats.reduce((s, c) => s + c.value, 0);
        return (
          <CursorBreakdownBox
            wrapRef={wrapRef}
            pos={pos}
            title={group.name}
            rows={cats.map((c) => ({
              key: c.id,
              color: c.color,
              name: c.name,
              value: formatGBP(c.value),
              right: `${Math.round((c.value / groupTotal) * 100)}%`,
              rightClass: 'w-9 text-[10px] text-ink-faint',
            }))}
          />
        );
      })()}
    </div>
  );
}
