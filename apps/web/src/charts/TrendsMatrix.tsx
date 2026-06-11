import { useEffect, useState } from 'react';
import {
  buildMatrix,
  categoryTotals,
  formatGBP,
  previousMonth,
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

function heatRGB(heat: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, heat)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  const f = t - i;
  const ch = (k: number) => Math.round(RAMP[i][k] + (RAMP[i + 1][k] - RAMP[i][k]) * f);
  return [ch(0), ch(1), ch(2)];
}

function heatColor(heat: number | null, alpha = 1): string {
  // rgba literal = --color-raised (#ece3cf) as RGB channels, needed for alpha support in inline styles
  if (heat === null) return alpha < 1 ? `rgba(236,227,207,${alpha})` : 'var(--color-raised)';
  const [r, g, b] = heatRGB(heat);
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r} ${g} ${b})`;
}

function compactGBP(pence: number): string {
  if (pence === 0) return '–';
  return `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
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

export function TrendsMatrix({ data, defaultRent = 'excl' }: { data: LedgerData; defaultRent?: 'incl' | 'excl' }) {
  const [rent, setRent] = useState<'incl' | 'excl'>(defaultRent);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useEffect(() => setRent(defaultRent), [defaultRent]);
  const excludeRent = rent === 'excl';

  const [showRange, setShowRange] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const currentYm = todayISO().slice(0, 7);

  let defaultStart = currentYm;
  for (let i = 0; i < 5; i++) defaultStart = previousMonth(defaultStart);

  const displayStart = rangeStart ?? defaultStart;
  const displayEnd = rangeEnd ?? currentYm;
  const months = monthsRange(displayStart, displayEnd, 60);

  let optStart = currentYm;
  for (let i = 0; i < 47; i++) optStart = previousMonth(optStart);
  const monthOptions = monthsRange(optStart, currentYm, 48);

  const isCustomRange = rangeStart !== null || rangeEnd !== null;
  const resetRange = () => { setRangeStart(null); setRangeEnd(null); };

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

  const expandableIds = visibleGroups.filter((x) => x.cats.length > 1).map((x) => x.g.id);
  const hasExpandable = expandableIds.length > 0;
  const allExpanded = hasExpandable && expandableIds.every((id) => expanded.has(id));
  const expandAll = () => setExpanded(new Set(expandableIds));
  const collapseAll = () => setExpanded(new Set());

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
        rows.push({ key: `c${cd.c.id}`, name: cd.c.name, color: cd.c.color, strong: false, expandable: false, open: false, groupId: x.g.id, cells: catMatrix[ci].cells }),
      );
    }
    return rows;
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-base text-ink">Category × month</h3>
          {hasExpandable && (
            <button
              type="button"
              className="text-xs text-ink-muted transition-colors hover:text-accent"
              onClick={allExpanded ? collapseAll : expandAll}
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          )}
          <button
            type="button"
            className={`text-xs transition-colors hover:text-accent ${isCustomRange ? 'text-accent' : 'text-ink-muted'}`}
            onClick={() => setShowRange((s) => !s)}
          >
            {isCustomRange ? 'Custom range' : '6 months'} {showRange ? '▴' : '▾'}
          </button>
        </div>
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

      {showRange && (
        <div className="mb-3 flex items-center gap-2 text-xs text-ink-muted">
          <span>From</span>
          <select
            value={displayStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className="rounded border border-hairline bg-panel px-1.5 py-0.5 text-xs text-ink"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <span>to</span>
          <select
            value={displayEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="rounded border border-hairline bg-panel px-1.5 py-0.5 text-xs text-ink"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          {isCustomRange && (
            <button type="button" onClick={resetRange} className="text-ink-muted transition-colors hover:text-accent">
              Reset
            </button>
          )}
        </div>
      )}

      {visibleGroups.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No spend recorded yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-max gap-0"
              // Column 1 (11.5px): invisible indent spacer for subcategory rows.
              // Column 2 (remainder): label content. Group rows span both with col-span-2.
              style={{ gridTemplateColumns: `11.5px calc(10.5rem - 11.5px) repeat(${months.length}, minmax(88px, 1fr))` }}
            >
              <div className="col-span-2 flex h-9 items-center justify-center bg-panel px-2 text-[11px] uppercase tracking-wide text-ink-faint border-r-[1.75px] border-hairline">
                Group
              </div>
              {months.map((m) => (
                <div key={m} className={`flex h-9 items-center justify-center bg-panel text-xs text-ink-faint ${m !== months[months.length - 1] ? 'border-r-[1.75px] border-hairline' : ''}`}>
                  {monthShort(m)}
                  {m === currentYm && <span className="ml-0.5 text-accent">*</span>}
                </div>
              ))}

              {renderRows.map((row, i) => {
                const isLast = i === renderRows.length - 1;
                const prevIsSubcat = i > 0 && !renderRows[i - 1].strong;
                const nextIsGroup = !isLast && renderRows[i + 1].strong;
                const topBorder = row.strong && (prevIsSubcat || i === 0);
                const bottomBorder = row.strong ? true : (!nextIsGroup && !isLast);
                return (
                  <Row key={row.key} row={row} months={months} onToggle={() => row.groupId && toggle(row.groupId)} topBorder={topBorder} bottomBorder={bottomBorder} />
                );
              })}
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

function Row({ row, months, onToggle, topBorder, bottomBorder }: { row: RenderRow; months: string[]; onToggle: () => void; topBorder: boolean; bottomBorder: boolean }) {
  const [hovered, setHovered] = useState(false);
  const isClickable = row.expandable || !row.strong;

  const rowHandlers = isClickable
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {};

  const labelBg = row.strong
    ? hovered ? 'bg-raised' : 'bg-panel'
    : hovered ? 'bg-raised/40' : 'bg-panel/100';

  const labelContent = (
    <>
      <span className="w-[1ch] shrink-0 text-center leading-none text-ink-faint">
        {row.expandable ? (row.open ? '▾' : '▸') : ''}
      </span>
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
      <span className={`truncate ${hovered ? 'text-accent' : 'text-ink'} ${row.strong ? (hovered ? 'font-bold' : 'font-semibold') : (hovered ? 'font-semibold' : 'font-medium')}`}>
        {row.name}
      </span>
    </>
  );

  const groupBorder = [
    'border-r-[1.75px] border-black',
    topBorder ? 'border-t-[1.75px]' : '',
    bottomBorder ? 'border-b-[1.75px]' : '',
  ].filter(Boolean).join(' ');
  const subcatBorder = [
    'border-r-[1.75px] border-ink-muted',
    bottomBorder ? 'border-b-[1.0px] border-ink-muted' : '',
  ].filter(Boolean).join(' ');

  const labelClass = [
    `flex ${row.strong ? 'h-14' : 'h-10'} w-full items-center gap-1.5 transition-colors`,
    row.strong ? `col-span-2 px-2 text-[15px] border-l-[1.75px] border-black ${groupBorder}` : `px-2 text-sm ${subcatBorder}`,
    isClickable ? 'cursor-pointer' : '',
    labelBg,
  ].join(' ');

  return (
    <>
      {/* Indent spacer: occupies the first grid column for subcategory rows, paper background so it's invisible */}
      {!row.strong && (
        <div className="h-10" style={{ backgroundColor: 'var(--color-paper)' }} />
      )}
      {isClickable ? (
        <button type="button" onClick={onToggle} {...rowHandlers} className={labelClass}>
          {labelContent}
        </button>
      ) : (
        <div className={labelClass}>
          {labelContent}
        </div>
      )}
      {row.cells.map((cell, j) => {
        const isLastSubcat = !row.strong && j === months.length - 1;
        const subcatBorderClasses = j < months.length - 1
          ? ['border-r-[1.75px] border-ink-muted', bottomBorder ? 'border-b-[1.0px]' : ''].filter(Boolean).join(' ')
          : '';
        return (
          <div
            key={months[j]}
            {...rowHandlers}
            onClick={isClickable ? onToggle : undefined}
            className={`flex ${row.strong ? 'h-14' : 'h-10'} relative items-center justify-center px-1.5 text-center transition-[filter] ${row.strong ? groupBorder : subcatBorderClasses} ${isClickable ? 'cursor-pointer' : ''} ${hovered ? 'brightness-95' : ''}`}
            style={isLastSubcat ? undefined : { backgroundColor: heatColor(cell.heat, row.strong ? 1 : 0.8) }}
            title={`${row.name} · ${monthLabel(months[j])}: ${formatGBP(cell.amountPence)}`}
          >
            {/* Right-trim: coloured background stops 1.75px short so the last subcat cell visually indents on the right */}
            {isLastSubcat && (
              <div
                className={`absolute inset-y-0 left-0 -z-10 ${bottomBorder ? 'border-b-[1.0px] border-ink-muted' : ''}`}
                style={{ right: '1.75px', backgroundColor: heatColor(cell.heat, 0.8) }}
              />
            )}
            <CellContent cell={cell} strong={row.strong} hovered={hovered} />
          </div>
        );
      })}
    </>
  );
}

function CellContent({ cell, strong, hovered }: { cell: MatrixCell; strong: boolean; hovered: boolean }) {
  // Infinity = previous month was zero (can't divide); treat as "new" entry rather than a numeric %.
  const pct = cell.pctVsPrevMonth ?? (cell.amountPence > 0 ? Infinity : null);
  const priceSpan = (
    <span className={`leading-none tabular-nums ${strong ? `text-[15px] ${hovered ? 'font-bold' : 'font-semibold'}` : `text-[14px] ${hovered ? 'font-bold' : 'font-semibold'}`}`}>
      {compactGBP(cell.amountPence)}
    </span>
  );

  if (pct === null) return priceSpan;

  if (pct === Infinity) return (
    <>
      <div className="flex flex-col items-center gap-0.5">
        {priceSpan}
        <span className="leading-none font-semibold" style={{ fontSize: 12 }}>+-%</span>
      </div>
      <div className="absolute left-[-1px] w-8 inset-y-0 flex items-center justify-center">
        <span className="leading-none font-semibold" style={{ fontSize: 24, color: '#1a7a3c' }}>↑</span>
      </div>
    </>
  );

  const up = pct > 0;
  const symbol = pct === 0
    ? <span className="leading-none font-bold text-ink" style={{ fontSize: 8 }}>→</span>
    : <span className="leading-none font-semibold" style={{ fontSize: Math.min(24, 8 + Math.abs(pct) * 0.16), color: up ? '#1a7a3c' : '#a8432f' }}>{up ? '↑' : '↓'}</span>;

  return (
    <>
      <div className="flex flex-col items-center gap-0.5">
        {priceSpan}
        <span className={`leading-none font-semibold`} style={{ fontSize: 12 }}>
          {pct === 0 ? '+0%' : `${up ? '+' : ''}${pct}%`}
        </span>
      </div>
      <div className="absolute left-[-1px] w-8 inset-y-0 flex items-center justify-center">{symbol}</div>
    </>
  );
}
