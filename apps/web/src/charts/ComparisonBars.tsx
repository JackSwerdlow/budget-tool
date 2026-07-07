import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  categoryTotals,
  comparePct,
  formatGBP,
  previousMonth,
  type Category,
  type LedgerData,
} from '@budget/core';
import { useCursorPos, useDismissOnOutsideTap } from './kit';
import { CursorBreakdownBox } from './kitComponents';

type Row = { id: number; name: string; color: string; thisPence: number; lastFullPence: number };

export function ComparisonBars({ data, ym, hiddenCategoryIds }: { data: LedgerData; ym: string; hiddenCategoryIds: Set<number> }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // The Total row hovers to a per-group breakdown; group rows to per-category (id 0 = Total).
  const [hoverId, setHoverId] = useState<number | null>(null);
  const { wrapRef, pos, moveTo, clear } = useCursorPos();

  const thisCat = categoryTotals(data, ym);
  const lastCat = categoryTotals(data, previousMonth(ym));
  const visible = (c: Category) => !hiddenCategoryIds.has(c.id);

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

  const groupCatCount = (groupId: number): number =>
    data.categories.filter((c) => c.group_id === groupId && visible(c)).length;

  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const expandableIds = groupRows.filter((r) => groupCatCount(r.id) > 1).map((r) => r.id);
  const hasExpandable = expandableIds.length > 0;
  const allExpanded = hasExpandable && expandableIds.every((id) => expanded.has(id));
  const expandAll = () => setExpanded(new Set(expandableIds));
  const collapseAll = () => setExpanded(new Set());

  const totalThis = groupRows.reduce((s, r) => s + r.thisPence, 0);
  const totalLast = groupRows.reduce((s, r) => s + r.lastFullPence, 0);

  const onRowHover = (e: ReactPointerEvent, id: number) => {
    setHoverId(id);
    moveTo(e);
  };
  const endHover = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') return; // touch dismissal = outside tap/scroll (kit)
    setHoverId(null);
    clear();
  };
  useDismissOnOutsideTap(hoverId !== null, wrapRef, () => setHoverId(null));

  // Same box as the running chart's tooltip: rows column-aligned, totals to one edge, the
  // smaller vs-last % in its own column with a "new" dash when there's no baseline.
  const hoverRows: Row[] = hoverId === null ? [] : hoverId === 0 ? groupRows : categoryRows(hoverId);
  const hoverTitle = hoverId === null ? '' : hoverId === 0 ? 'By group' : data.groups.find((g) => g.id === hoverId)?.name ?? '';

  return (
    <div ref={wrapRef} className="relative">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-base text-ink">Vs last month</h3>
          {hasExpandable && (
            <button
              type="button"
              className="text-xs text-ink-muted transition-colors hover:text-accent"
              onClick={allExpanded ? collapseAll : expandAll}
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
      </div>

      {groupRows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">Nothing to compare yet.</p>
      ) : (
        <>
          <div
            className="overflow-hidden rounded-t"
            onPointerMove={(e) => onRowHover(e, 0)}
            onPointerDown={(e) => onRowHover(e, 0)}
            onPointerLeave={endHover}
          >
            <TotalRow thisPence={totalThis} lastFullPence={totalLast} />
          </div>
          <div>
            {groupRows.map((row, index) => {
              const open = expanded.has(row.id);
              const cats = categoryRows(row.id);
              return (
                <div key={row.id} className={`overflow-hidden border-t border-hairline ${index === groupRows.length - 1 ? 'rounded-b' : ''}`}>
                  <div onPointerMove={(e) => onRowHover(e, row.id)} onPointerDown={(e) => onRowHover(e, row.id)} onPointerLeave={endHover}>
                    <BarRow row={row} strong expandable={groupCatCount(row.id) > 1} open={open} onToggle={groupCatCount(row.id) > 1 ? () => toggle(row.id) : undefined} />
                  </div>
                  {open && (
                    <div>
                      {cats.map((c) => (
                        <BarRow key={c.id} row={c} onToggle={() => toggle(row.id)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {hoverId !== null && pos !== null && hoverRows.length > 0 && (
        <CursorBreakdownBox
          wrapRef={wrapRef}
          pos={pos}
          title={hoverTitle}
          rows={hoverRows.map((r) => {
            const pct = comparePct(r.thisPence, r.lastFullPence);
            const over = pct !== null && pct > 100;
            const warn = pct !== null && pct >= 75 && pct <= 100;
            return {
              key: r.id,
              color: r.color,
              name: r.name,
              value: formatGBP(r.thisPence),
              right: pct === null ? '—' : `${pct}%`,
              rightClass: `w-11 text-[10px] ${pct === null ? 'text-ink-faint' : over ? 'text-over' : warn ? 'text-warn' : 'text-under'}`,
            };
          })}
        />
      )}
    </div>
  );
}

function TotalRow({ thisPence, lastFullPence }: { thisPence: number; lastFullPence: number }) {
  const pct = comparePct(thisPence, lastFullPence);
  const over = pct !== null && pct > 100;
  const warn = pct !== null && pct >= 75 && pct <= 100;
  const fill = pct === null ? 0 : Math.min(pct, 100);

  return (
    <div className="flex w-full items-center gap-3 py-0.5 text-left bg-raised">
      <div className="flex w-32 shrink-0 items-center gap-1.5 text-sm text-ink">
        <span className="w-3 shrink-0" />
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: 'black' }} />
        <span className="truncate font-extrabold tracking-wide">Total</span>
      </div>

      <div className="relative h-2.5 flex-1 rounded-full bg-ink/10">
        {pct !== null && (
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-over' : warn ? 'bg-warn' : 'bg-under'}`}
            style={{ width: `${fill}%` }}
          />
        )}
        <div className="absolute inset-y-[-2px] right-0 w-px bg-ink/40" title="100% of last month" />
      </div>

      <div className="w-28 shrink-0 pr-1 flex items-center text-sm tabular-nums">
        {pct === null ? (
          <span className="rounded bg-raised px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">new</span>
        ) : (
          <span className={`w-8 text-right ${over ? 'text-over' : warn ? 'text-warn' : 'text-under'}`}>{pct}%</span>
        )}
        <span className="ml-auto text-ink font-extrabold">{formatGBP(thisPence)}</span>
      </div>
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
      <span className={`truncate ${strong ? 'font-semibold group-hover:font-bold' : 'group-hover:font-bold'} ${expandable ? 'group-hover:text-accent' : ''}`}>{row.name}</span>
    </>
  );

  return (
    <button
      type="button"
      className={`group flex w-full items-center gap-3 py-1 text-left ${strong ? 'bg-raised/50' : 'bg-raised/25'}`}
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

      <div className="w-28 shrink-0 pr-1 flex items-center text-sm tabular-nums group-hover:font-semibold">
        {pct === null ? (
          <span className="rounded bg-raised px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">new</span>
        ) : (
          <span className={`w-8 text-right ${over ? 'text-over' : warn ? 'text-warn' : 'text-under'}`}>{pct}%</span>
        )}
        <span className={`ml-auto text-ink ${strong ? 'font-semibold' : ''} ${expandable ? 'group-hover:text-accent' : ''}`}>{formatGBP(row.thisPence)}</span>
      </div>
    </button>
  );
}
