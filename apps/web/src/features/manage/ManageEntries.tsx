import { type FormEvent, useState } from 'react';
import { evalSum, formatGBP, listTotals, ymOf, type BudgetList, type Entry, type LedgerData } from '@budget/core';
import { deleteEntry, deleteList, updateEntry, updateList } from '../../api';
import { useData } from '../../data';
import { MonthPicker, Segmented } from '../../components/ui';
import { CategorySelect } from '../../components/CategorySelect';
import { CategoryVisibilityPanel } from '../../components/CategoryVisibilityPanel';
import { ConfirmButton } from '../../components/ConfirmButton';
import { ListForm } from '../ListForm';
import { dayHeading, monthLabel } from '../../lib/dates';
import { useEscape } from '../../lib/useEscape';

type EntryRow = { kind: 'entry'; date: string; created_at: string; entry: Entry };
type ListRow = { kind: 'list'; date: string; created_at: string; list: BudgetList };
type DayRow = EntryRow | ListRow;

export function ManageEntries({ data, ym, onYmChange }: { data: LedgerData; ym: string; onYmChange: (ym: string) => void }) {
  const { refresh } = useData();
  const [editing, setEditing] = useState<number | null>(null);
  const [editingList, setEditingList] = useState<number | null>(null);
  const [hiddenCats, setHiddenCats] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'month' | 'all'>('month');
  const [showCatPicker, setShowCatPicker] = useState(false);
  // Multi-select bulk edit: checkboxes on entry rows (lists stay per-row — they hold many
  // categories), then recategorise or delete the whole selection in one go.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCat, setBulkCat] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const cat = (id: number) => data.categories.find((c) => c.id === id);

  // Escape dismisses the unfolding category filter panel, matching Overview.
  useEscape(() => setShowCatPicker(false), showCatPicker);

  // A filter or search stays scoped to the picked month by default (so the term persists while
  // browsing months), with an "All months" scope for finding an entry whose month is unknown.
  const term = search.trim().toLowerCase();
  const filtering = hiddenCats.size > 0;
  const searching = filtering || term !== '';
  const allMonths = searching && scope === 'all';

  const entryMatches = (e: Entry): boolean => {
    if (filtering && hiddenCats.has(e.category_id)) return false;
    if (term && !(e.note ?? '').toLowerCase().includes(term)) return false;
    return true;
  };
  const listMatches = (l: BudgetList): boolean => {
    if (filtering && !(l.items.some((it) => !hiddenCats.has(it.category_id)) || !hiddenCats.has(l.delivery_category_id))) {
      return false;
    }
    if (term && !((l.note ?? '').toLowerCase().includes(term) || l.items.some((it) => it.name.toLowerCase().includes(term)))) {
      return false;
    }
    return true;
  };

  // Entries and lists share one date-ordered stream, newest day first; within a day,
  // most recently added first.
  const rows: DayRow[] = [
    ...(allMonths ? data.entries : data.entries.filter((e) => ymOf(e.date) === ym))
      .filter(entryMatches)
      .map((e): EntryRow => ({ kind: 'entry', date: e.date, created_at: e.created_at, entry: e })),
    ...(allMonths ? data.lists : data.lists.filter((l) => ymOf(l.date) === ym))
      .filter(listMatches)
      .map((l): ListRow => ({ kind: 'list', date: l.date, created_at: l.created_at, list: l })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

  const days: { date: string; rows: DayRow[] }[] = [];
  for (const r of rows) {
    const last = days[days.length - 1];
    if (last && last.date === r.date) last.rows.push(r);
    else days.push({ date: r.date, rows: [r] });
  }

  const onDeleteEntry = async (id: number) => {
    await deleteEntry(id);
    await refresh();
  };
  const onDeleteList = async (id: number) => {
    await deleteList(id);
    await refresh();
  };

  const clearFilters = () => {
    setHiddenCats(new Set());
    setSearch('');
    setScope('month');
  };

  const visibleEntryIds = rows.filter((r) => r.kind === 'entry').map((r) => r.entry.id);
  const allVisibleSelected = visibleEntryIds.length > 0 && visibleEntryIds.every((id) => selected.has(id));
  const toggleSelected = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const endSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // Bulk ops loop the existing per-entry operations, then refresh once — no new data
  // operation, so web and desktop stay in sync for free.
  const bulkRecategorise = async () => {
    if (bulkCat === null || selected.size === 0) return;
    setBulkBusy(true);
    try {
      for (const e of data.entries) {
        if (!selected.has(e.id)) continue;
        await updateEntry(e.id, { amount_pence: e.amount_pence, category_id: bulkCat, date: e.date, note: e.note });
      }
      await refresh();
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      for (const id of selected) await deleteEntry(id);
      await refresh();
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-base text-ink">Past entries</h3>
        {!allMonths && <MonthPicker ym={ym} onChange={onYmChange} />}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowCatPicker((s) => !s)}
          aria-expanded={showCatPicker}
          aria-label="Filter by category"
          className={`text-xs transition-colors hover:text-accent ${filtering ? 'text-accent' : 'text-ink-muted'}`}
        >
          Categories {showCatPicker ? '▴' : '▾'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (selecting) endSelecting();
            else {
              setSelecting(true);
              setBulkCat((c) => c ?? data.categories[0]?.id ?? null);
            }
          }}
          className={`text-xs transition-colors hover:text-accent ${selecting ? 'text-accent' : 'text-ink-muted'}`}
        >
          {selecting ? 'Done' : 'Edit Multiple'}
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes & items…"
          aria-label="Search notes and list items"
          className="min-w-[10rem] max-w-xs flex-1 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm text-ink outline-none focus:border-ink/40"
        />
        {searching && (
          <>
            <Segmented
              size="sm"
              value={scope}
              onChange={setScope}
              options={[
                { id: 'month', label: 'This month' },
                { id: 'all', label: 'All months' },
              ]}
            />
            <button type="button" onClick={clearFilters} className="text-xs text-ink-muted transition-colors hover:text-accent">
              Clear
            </button>
            <span className="text-xs text-ink-faint">
              {rows.length} {rows.length === 1 ? 'result' : 'results'} {allMonths ? 'across all months' : `in ${monthLabel(ym)}`}
            </span>
          </>
        )}
      </div>

      {/* The same unfolding filter panel as Overview's: multi-select, pressed = shown. */}
      {showCatPicker && (
        <div className="mb-4">
          <CategoryVisibilityPanel data={data} hiddenCategoryIds={hiddenCats} onChange={setHiddenCats} />
        </div>
      )}

      {/* Bulk action bar — recategorise or delete every ticked entry in one go */}
      {selecting && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-raised/40 px-3 py-2">
          <span className="text-xs tabular-nums text-ink-muted">
            {selected.size} {selected.size === 1 ? 'entry' : 'entries'} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visibleEntryIds))}
            className="text-xs text-ink-muted transition-colors hover:text-accent"
          >
            {allVisibleSelected ? 'Clear' : 'Select all shown'}
          </button>
          {selected.size > 0 && bulkCat !== null && (
            <>
              <div className="ml-2 w-44">
                <CategorySelect groups={data.groups} categories={data.categories} value={bulkCat} onChange={setBulkCat} />
              </div>
              <button
                type="button"
                onClick={() => void bulkRecategorise()}
                disabled={bulkBusy}
                className="rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
              >
                {bulkBusy ? 'Working…' : 'Set category'}
              </button>
              <ConfirmButton
                onConfirm={() => void bulkDelete()}
                idleLabel="Delete"
                confirmLabel={`Delete ${selected.size}?`}
                ariaLabel="Delete selected entries"
                idleClassName="rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-over"
                confirmClassName="rounded-md border border-hairline px-2.5 py-1 text-xs font-medium text-over"
              />
            </>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          {searching
            ? `No entries match this filter${allMonths ? '' : ` in ${monthLabel(ym)}`}.`
            : 'Nothing recorded this month.'}
        </p>
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const dayTotal = day.rows.reduce(
              (sum, r) => sum + (r.kind === 'entry' ? r.entry.amount_pence : listTotals(r.list).mine),
              0,
            );
            return (
            <div key={day.date} className="overflow-hidden rounded-lg border border-hairline bg-panel">
              <div className="flex items-center justify-between gap-3 border-b border-hairline bg-raised/40 px-3 py-1.5 text-xs uppercase tracking-wide text-ink-faint">
                <span>{dayHeading(day.date)}</span>
                <span className="tabular-nums text-ink-muted">{formatGBP(dayTotal)}</span>
              </div>
              <div className="divide-y divide-hairline px-3">
                {day.rows.map((r) =>
                  r.kind === 'entry' ? (
                    editing === r.entry.id ? (
                      <EntryEditor key={r.entry.id} entry={r.entry} data={data} onDone={() => setEditing(null)} />
                    ) : (
                      <div
                        key={r.entry.id}
                        onClick={selecting ? () => toggleSelected(r.entry.id) : undefined}
                        className={`flex items-center gap-3 py-2 text-sm ${selecting ? 'cursor-pointer' : ''}`}
                      >
                        {/* whole row toggles while selecting; the checkbox is just the indicator */}
                        {selecting && (
                          <input
                            type="checkbox"
                            checked={selected.has(r.entry.id)}
                            readOnly
                            className="pointer-events-none shrink-0 accent-[var(--color-accent)]"
                            aria-label={`Select ${cat(r.entry.category_id)?.name ?? 'entry'} ${formatGBP(r.entry.amount_pence)}`}
                          />
                        )}
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: cat(r.entry.category_id)?.color }} />
                        <span className="text-ink">{cat(r.entry.category_id)?.name}</span>
                        {r.entry.note && <span className="truncate text-ink-muted">· {r.entry.note}</span>}
                        <span className="ml-auto shrink-0 tabular-nums text-ink">{formatGBP(r.entry.amount_pence)}</span>
                        {!selecting && (
                          <>
                            <button type="button" onClick={() => setEditing(r.entry.id)} className="-m-2 shrink-0 p-2 text-xs text-ink-muted hover:text-ink">Edit</button>
                            <ConfirmButton
                              onConfirm={() => onDeleteEntry(r.entry.id)}
                              idleLabel="✕"
                              confirmLabel="Delete?"
                              ariaLabel="Delete"
                              idleClassName="-m-2 shrink-0 p-2 text-ink-faint transition-colors hover:text-over"
                              confirmClassName="shrink-0 text-xs font-medium text-over"
                            />
                          </>
                        )}
                      </div>
                    )
                  ) : editingList === r.list.id ? (
                    <div key={`l${r.list.id}`} className="py-3">
                      <ListForm
                        data={data}
                        initial={r.list}
                        submitLabel="Save changes"
                        onSubmit={async (input) => {
                          await updateList(r.list.id, input);
                          await refresh();
                          setEditingList(null);
                        }}
                        onCancel={() => setEditingList(null)}
                      />
                    </div>
                  ) : (
                    <div key={`l${r.list.id}`} className="flex items-center gap-3 py-2 text-sm">
                      <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">list</span>
                      <span className="truncate text-ink">{r.list.note || `${r.list.items.length} items`}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-ink">{formatGBP(listTotals(r.list).mine)}</span>
                      <button type="button" onClick={() => setEditingList(r.list.id)} className="-m-2 shrink-0 p-2 text-xs text-ink-muted hover:text-ink">Edit</button>
                      <ConfirmButton
                        onConfirm={() => onDeleteList(r.list.id)}
                        idleLabel="✕"
                        confirmLabel="Delete?"
                        ariaLabel="Delete list"
                        idleClassName="-m-2 shrink-0 p-2 text-ink-faint transition-colors hover:text-over"
                        confirmClassName="shrink-0 text-xs font-medium text-over"
                      />
                    </div>
                  ),
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EntryEditor({ entry, data, onDone }: { entry: Entry; data: LedgerData; onDone: () => void }) {
  const { refresh } = useData();
  const [amountText, setAmountText] = useState((entry.amount_pence / 100).toFixed(2));
  const [categoryId, setCategoryId] = useState(entry.category_id);
  const [date, setDate] = useState(entry.date);
  const [note, setNote] = useState(entry.note ?? '');

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    let amount: number;
    try {
      amount = evalSum(amountText);
    } catch {
      return;
    }
    await updateEntry(entry.id, { amount_pence: amount, category_id: categoryId, date, note: note.trim() || null });
    await refresh();
    onDone();
  };

  return (
    <form onSubmit={onSave} className="flex flex-wrap items-center gap-2 bg-raised/40 py-2">
      <div className="relative w-28">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint">£</span>
        <input value={amountText} onChange={(ev) => setAmountText(ev.target.value)} inputMode="decimal" className="w-full rounded-md border border-hairline bg-paper py-1.5 pl-5 pr-2 text-sm text-ink outline-none focus:border-ink/40" />
      </div>
      <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} className="rounded-md border border-hairline bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-ink/40" />
      <div className="w-44">
        <CategorySelect groups={data.groups} categories={data.categories} value={categoryId} onChange={setCategoryId} />
      </div>
      <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="note" className="min-w-[8rem] flex-1 rounded-md border border-hairline bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-ink/40" />
      <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:opacity-90">Save</button>
      <button type="button" onClick={onDone} className="text-sm text-ink-muted hover:text-ink">Cancel</button>
    </form>
  );
}
