import { useState } from 'react';
import {
  categoryTotals,
  comparePct,
  formatGBP,
  previousMonth,
  type Category,
  type LedgerData,
} from '@budget/core';
import { Segmented } from '../components/ui';

type Row = { id: number; name: string; color: string; thisPence: number; lastFullPence: number };

export function ComparisonBars({ data, ym }: { data: LedgerData; ym: string }) {
  const [rent, setRent] = useState<'incl' | 'excl'>('excl');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const excludeRent = rent === 'excl';

  const thisCat = categoryTotals(data, ym);
  const lastCat = categoryTotals(data, previousMonth(ym));
  const visible = (c: Category) => !excludeRent || c.exclude_from_discretionary !== 1;

  const groupRows: Row[] = data.groups
    .map((g) => {
      const cats = data.categories.filter((c) => c.group_id === g.id && visible(c));
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        thisPence: cats.reduce((s, c) => s + (thisCat.get(c.id) ?? 0), 0),
        lastFullPence: cats.reduce((s, c) => s + (lastCat.get(c.id) ?? 0), 0),
      };
    })
    .filter((r) => r.thisPence > 0 || r.lastFullPence > 0);

  const categoryRows = (groupId: number): Row[] =>
    data.categories
      .filter((c) => c.group_id === groupId && visible(c))
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        thisPence: thisCat.get(c.id) ?? 0,
        lastFullPence: lastCat.get(c.id) ?? 0,
      }))
      .filter((r) => r.thisPence > 0 || r.lastFullPence > 0);

  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-base text-ink">Vs last month</h3>
        <Segmented
          size="sm"
          value={rent}
          onChange={setRent}
          options={[
            { id: 'incl', label: 'incl. Rent' },
            { id: 'excl', label: 'excl. Rent' },
          ]}
        />
      </div>

      {groupRows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">Nothing to compare yet.</p>
      ) : (
        <div className="space-y-0.5">
          {groupRows.map((row) => {
            const open = expanded.has(row.id);
            const cats = categoryRows(row.id);
            return (
              <div key={row.id} className="overflow-hidden rounded-lg border border-hairline bg-raised">
                <BarRow row={row} strong expandable={cats.length > 1} open={open} onToggle={ cats.length > 1 ? () => toggle(row.id) : undefined} />
                {open && (
                  <div className="bg-panel">
                    {cats.map((c) => (
                      <BarRow key={c.id} row={c} onToggle={() => toggle(row.id)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BarRow({
  row,
  strong,
  expandable,
  open,
  onToggle,
}: {
  row: Row;
  strong?: boolean;
  expandable?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const pct = comparePct(row.thisPence, row.lastFullPence);
  const over = pct !== null && pct > 100;
  const warn = pct !== null && pct >= 75 && pct <= 100;
  const fill = pct === null ? 0 : Math.min(pct, 100);

  const label = (
    <>
      <span className="w-3 shrink-0 text-center text-base leading-none text-ink-faint">
        {expandable ? (open ? '▾' : '▸') : ''}
      </span>
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
      <span className={`truncate ${strong ? 'font-semibold group-hover:font-bold' : 'group-hover:font-semibold'} ${expandable ? 'group-hover:text-accent' : ''}`}>{row.name}</span>
    </>
  );

  return (
    <button
      type="button"
      className="group flex w-full items-center gap-3 py-1 text-left"
      onClick={onToggle}
      aria-expanded={expandable ? open : undefined}
      aria-label={expandable ? `${open ? 'Collapse' : 'Expand'} ${row.name}` : undefined}
    >
      <div className="flex w-32 shrink-0 items-center gap-1.5 text-sm text-ink">{label}</div>

      <div className={`relative h-2.5 flex-1 rounded-full ${strong ? 'bg-ink/10' : 'bg-ink/8'} group-hover:opacity-80`}>
        {pct !== null && (
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-over' : warn ? 'bg-warn' : 'bg-under'}`}
            style={{ width: `${fill}%` }}
          />
        )}
        <div className="absolute inset-y-[-2px] right-0 w-px bg-ink/40" title="100% of last month" />
      </div>

      <div className="w-28 shrink-0 text-right text-sm tabular-nums group-hover:font-semibold pr-1">
        <span className={`text-ink ${expandable ? 'group-hover:text-accent' : ''}`}>{formatGBP(row.thisPence)}</span>{' '}
        {pct === null ? (
          <span className="rounded bg-raised px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">new</span>
        ) : (
          <span className={over ? 'text-over' : 'text-under'}>{pct}%</span>
        )}
      </div>
    </button>
  );
}
