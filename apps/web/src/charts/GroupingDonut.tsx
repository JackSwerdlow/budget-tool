import { useEffect, useState } from 'react';
import { arc, pie } from 'd3-shape';
import { categoryTotals, formatGBP, type LedgerData } from '@budget/core';

type Slice = { id: number; name: string; color: string; value: number };

const R_OUTER = 96;
const R_INNER = 60;

export function GroupingDonut({
  data,
  ym,
  excludeRent,
}: {
  data: LedgerData;
  ym: string;
  excludeRent: boolean;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  useEffect(() => setExpanded(null), [ym, excludeRent]);

  const catTotals = categoryTotals(data, ym);
  const groupValue = (groupId: number) =>
    data.categories
      .filter((c) => c.group_id === groupId && (!excludeRent || c.exclude_from_discretionary !== 1))
      .reduce((sum, c) => sum + (catTotals.get(c.id) ?? 0), 0);

  const groupSlices: Slice[] = data.groups
    .map((g) => ({ id: g.id, name: g.name, color: g.color, value: groupValue(g.id) }))
    .filter((s) => s.value > 0);

  const expandedGroup = expanded !== null ? data.groups.find((g) => g.id === expanded) ?? null : null;
  const categorySlices: Slice[] = expandedGroup
    ? data.categories
        .filter(
          (c) =>
            c.group_id === expandedGroup.id &&
            (!excludeRent || c.exclude_from_discretionary !== 1) &&
            (catTotals.get(c.id) ?? 0) > 0,
        )
        .map((c) => ({ id: c.id, name: c.name, color: c.color, value: catTotals.get(c.id) ?? 0 }))
    : [];

  const drilled = expandedGroup !== null && categorySlices.length > 0;
  const slices = drilled ? categorySlices : groupSlices;
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (groupSlices.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">No spend recorded for this month yet.</p>;
  }

  const arcs = pie<Slice>().value((d) => d.value).sort(null)(slices);
  const arcGen = arc<(typeof arcs)[number]>().innerRadius(R_INNER).outerRadius(R_OUTER).padAngle(0.012).cornerRadius(2);

  const collapse = () => setExpanded(null);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
      <svg viewBox="-104 -104 208 208" className="w-44 shrink-0" role="img" aria-label="Spend by group">
        {arcs.map((a) => (
          <path
            key={a.data.id}
            d={arcGen(a) ?? ''}
            fill={a.data.color}
            stroke="var(--color-panel)"
            strokeWidth={1}
            className="cursor-pointer transition-opacity hover:opacity-85"
            onClick={() => (drilled ? collapse() : setExpanded(a.data.id))}
          >
            <title>{a.data.name}</title>
          </path>
        ))}
        <text textAnchor="middle" y={-2} className="fill-ink font-serif text-[19px]">{formatGBP(total)}</text>
        <text textAnchor="middle" y={16} className="fill-ink-faint text-[10px] uppercase tracking-wide">
          {drilled ? expandedGroup.name : excludeRent ? 'ex-Rent' : 'total'}
        </text>
      </svg>

      <ul className="flex-1 space-y-1.5">
        {drilled && (
          <li>
            <button type="button" onClick={collapse} className="mb-1 text-xs text-ink-muted transition-colors hover:text-ink">
              ‹ all groups
            </button>
          </li>
        )}
        {slices
          .slice()
          .sort((a, b) => b.value - a.value)
          .map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => (drilled ? collapse() : setExpanded(s.id))}
                className="flex w-full items-center gap-2 text-left text-sm"
              >
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="text-ink">{s.name}</span>
                <span className="ml-auto tabular-nums text-ink">{formatGBP(s.value)}</span>
                <span className="w-10 text-right tabular-nums text-ink-faint">
                  {Math.round((s.value / total) * 100)}%
                </span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
