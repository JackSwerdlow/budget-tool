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
  const catTotals = categoryTotals(data, ym);
  const slices: Slice[] = data.groups
    .map((group) => {
      const value = data.categories
        .filter((c) => c.group_id === group.id && (!excludeRent || c.exclude_from_discretionary !== 1))
        .reduce((sum, c) => sum + (catTotals.get(c.id) ?? 0), 0);
      return { id: group.id, name: group.name, color: group.color, value };
    })
    .filter((s) => s.value > 0);

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">No spend recorded for this month yet.</p>
    );
  }

  const arcs = pie<Slice>().value((d) => d.value).sort(null)(slices);
  const arcGen = arc<(typeof arcs)[number]>().innerRadius(R_INNER).outerRadius(R_OUTER).padAngle(0.012).cornerRadius(2);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
      <svg viewBox="-104 -104 208 208" className="w-44 shrink-0" role="img" aria-label="Spend by group">
        {arcs.map((a) => (
          <path key={a.data.id} d={arcGen(a) ?? ''} fill={a.data.color} stroke="var(--color-panel)" strokeWidth={1} />
        ))}
        <text textAnchor="middle" y={-2} className="fill-ink font-serif text-[20px]">
          {formatGBP(total)}
        </text>
        <text textAnchor="middle" y={16} className="fill-ink-faint text-[10px] uppercase tracking-wide">
          {excludeRent ? 'ex-Rent' : 'total'}
        </text>
      </svg>

      <ul className="flex-1 space-y-1.5">
        {slices
          .slice()
          .sort((a, b) => b.value - a.value)
          .map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-ink">{s.name}</span>
              <span className="ml-auto tabular-nums text-ink">{formatGBP(s.value)}</span>
              <span className="w-10 text-right tabular-nums text-ink-faint">
                {Math.round((s.value / total) * 100)}%
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
