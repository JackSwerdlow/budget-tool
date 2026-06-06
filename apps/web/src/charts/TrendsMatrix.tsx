import { useState } from 'react';
import {
  activeMonths,
  buildMatrix,
  categoryTotals,
  formatGBP,
  type LedgerData,
  type MatrixCell,
} from '@budget/core';
import { Segmented } from '../components/ui';
import { monthLabel, monthShort, monthsRange, todayISO } from '../lib/dates';

// §6.0 heat ramp (less -> more spend, per row).
const RAMP = [
  [138, 168, 97],
  [174, 193, 136],
  [234, 223, 200],
  [227, 195, 179],
  [192, 122, 92],
];

function heatColor(heat: number | null): string {
  if (heat === null) return 'var(--color-raised)';
  const t = Math.max(0, Math.min(1, heat)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  const f = t - i;
  const ch = (k: number) => Math.round(RAMP[i][k] + (RAMP[i + 1][k] - RAMP[i][k]) * f);
  return `rgb(${ch(0)} ${ch(1)} ${ch(2)})`;
}

function compactGBP(pence: number): string {
  if (pence === 0) return '–';
  return `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
}

function DeltaArrow({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  if (pct === 0) return <span className="text-ink-muted" style={{ fontSize: 11 }}>0%</span>;
  const up = pct > 0;
  const size = Math.min(19, 11 + Math.abs(pct) / 25);
  return (
    <span className="leading-none text-ink" style={{ fontSize: size }}>
      {up ? '↗' : '↘'}
      {up ? '+' : ''}
      {pct}%
    </span>
  );
}

type RenderRow = {
  key: string;
  name: string;
  color: string;
  strong: boolean;
  expandable: boolean;
  open: boolean;
  groupId?: number;
  cells: MatrixCell[];
};

export function TrendsMatrix({ data }: { data: LedgerData }) {
  const [rent, setRent] = useState<'incl' | 'excl'>('excl');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const excludeRent = rent === 'excl';

  const currentYm = todayISO().slice(0, 7);
  const active = activeMonths(data);
  const first = active.length && active[0] < currentYm ? active[0] : currentYm;
  const last = active.length && active[active.length - 1] > currentYm ? active[active.length - 1] : currentYm;
  const months = monthsRange(first, last, 12);

  const totalsByMonth = new Map(months.map((m) => [m, categoryTotals(data, m)]));
  const visible = (excludeFromDiscretionary: number) => !excludeRent || excludeFromDiscretionary !== 1;

  const visibleGroups = data.groups
    .map((g) => {
      const cats = data.categories.filter((c) => c.group_id === g.id && visible(c.exclude_from_discretionary));
      const amounts = months.map((m) => cats.reduce((s, c) => s + (totalsByMonth.get(m)?.get(c.id) ?? 0), 0));
      return { g, cats, amounts };
    })
    .filter((x) => x.amounts.some((a) => a > 0));

  const groupMatrix = buildMatrix(visibleGroups.map((x) => ({ id: x.g.id, amounts: x.amounts })));

  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const renderRows: RenderRow[] = visibleGroups.flatMap((x, gi) => {
    const expandable = x.cats.length > 1;
    const open = expanded.has(x.g.id);
    const rows: RenderRow[] = [
      { key: `g${x.g.id}`, name: x.g.name, color: x.g.color, strong: true, expandable, open, groupId: x.g.id, cells: groupMatrix[gi].cells },
    ];
    if (open && expandable) {
      const catData = x.cats
        .map((c) => ({ c, amounts: months.map((m) => totalsByMonth.get(m)?.get(c.id) ?? 0) }))
        .filter((cd) => cd.amounts.some((a) => a > 0));
      const catMatrix = buildMatrix(catData.map((cd) => ({ id: cd.c.id, amounts: cd.amounts })));
      catData.forEach((cd, ci) =>
        rows.push({ key: `c${cd.c.id}`, name: cd.c.name, color: cd.c.color, strong: false, expandable: false, open: false, cells: catMatrix[ci].cells }),
      );
    }
    return rows;
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-base text-ink">Category × month</h3>
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

      {visibleGroups.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No spend recorded yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-max gap-px bg-hairline"
              style={{ gridTemplateColumns: `10.5rem repeat(${months.length}, minmax(88px, 1fr))` }}
            >
              <div className="flex h-9 items-center bg-panel px-2 text-[11px] uppercase tracking-wide text-ink-faint">
                Group
              </div>
              {months.map((m) => (
                <div key={m} className="flex h-9 items-center justify-center bg-panel text-xs text-ink-faint">
                  {monthShort(m)}
                  {m === currentYm && <span className="ml-0.5 text-accent">*</span>}
                </div>
              ))}

              {renderRows.map((row) => (
                <Row key={row.key} row={row} months={months} onToggle={() => row.groupId && toggle(row.groupId)} />
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Colour = how heavy each month was for that row · <span className="text-accent">*</span> month-to-date · arrow = change vs the previous month
          </p>
        </>
      )}
    </div>
  );
}

function Row({ row, months, onToggle }: { row: RenderRow; months: string[]; onToggle: () => void }) {
  return (
    <>
      <div className="flex h-14 items-center gap-1.5 bg-panel px-2 text-[15px]">
        {row.expandable ? (
          <button type="button" onClick={onToggle} aria-label="Expand row" className="text-ink-faint hover:text-ink">
            {row.open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="inline-block w-[1ch]" />
        )}
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
        <span className={`truncate text-ink ${row.strong ? 'font-medium' : ''}`}>{row.name}</span>
      </div>
      {row.cells.map((cell, j) => (
        <div
          key={months[j]}
          className="flex h-14 items-center justify-center gap-1.5 px-1.5 text-center"
          style={{ backgroundColor: heatColor(cell.heat) }}
          title={`${row.name} · ${monthLabel(months[j])}: ${formatGBP(cell.amountPence)}`}
        >
          <span className="text-[13px] leading-none text-ink tabular-nums">{compactGBP(cell.amountPence)}</span>
          <DeltaArrow pct={cell.pctVsPrevMonth} />
        </div>
      ))}
    </>
  );
}
