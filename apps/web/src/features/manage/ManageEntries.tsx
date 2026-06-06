import { type FormEvent, useState } from 'react';
import { evalSum, formatGBP, listTotals, ymOf, type Entry, type LedgerData } from '@budget/core';
import { deleteEntry, deleteList, updateEntry } from '../../api';
import { useData } from '../../data';
import { MonthPicker } from '../../components/ui';
import { CategorySelect } from '../../components/CategorySelect';
import { todayISO } from '../../lib/dates';

export function ManageEntries({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const [editing, setEditing] = useState<number | null>(null);

  const cat = (id: number) => data.categories.find((c) => c.id === id);
  const entries = data.entries.filter((e) => ymOf(e.date) === ym);
  const lists = data.lists.filter((l) => ymOf(l.date) === ym);

  const onDeleteEntry = async (id: number) => {
    if (!window.confirm('Delete this entry?')) return;
    await deleteEntry(id);
    await refresh();
  };
  const onDeleteList = async (id: number) => {
    if (!window.confirm('Delete this list and its items?')) return;
    await deleteList(id);
    await refresh();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-base text-ink">Past entries</h3>
        <MonthPicker ym={ym} onChange={setYm} />
      </div>

      {entries.length === 0 && lists.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">Nothing recorded this month.</p>
      ) : (
        <div className="divide-y divide-hairline">
          {entries.map((e) =>
            editing === e.id ? (
              <EntryEditor key={e.id} entry={e} data={data} onDone={() => setEditing(null)} />
            ) : (
              <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-20 shrink-0 text-ink-faint tabular-nums">{e.date.slice(5)}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: cat(e.category_id)?.color }} />
                <span className="text-ink">{cat(e.category_id)?.name}</span>
                {e.note && <span className="truncate text-ink-muted">· {e.note}</span>}
                <span className="ml-auto shrink-0 tabular-nums text-ink">{formatGBP(e.amount_pence)}</span>
                <button type="button" onClick={() => setEditing(e.id)} className="shrink-0 text-xs text-ink-muted hover:text-ink">Edit</button>
                <button type="button" onClick={() => onDeleteEntry(e.id)} aria-label="Delete" className="shrink-0 text-ink-faint hover:text-over">✕</button>
              </div>
            ),
          )}
          {lists.map((l) => (
            <div key={`l${l.id}`} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-20 shrink-0 text-ink-faint tabular-nums">{l.date.slice(5)}</span>
              <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">list</span>
              <span className="truncate text-ink">{l.note || `${l.items.length} items`}</span>
              <span className="ml-auto shrink-0 tabular-nums text-ink">{formatGBP(listTotals(l).mine)}</span>
              <span className="shrink-0 text-xs text-ink-faint">edit on Add · List</span>
              <button type="button" onClick={() => onDeleteList(l.id)} aria-label="Delete list" className="shrink-0 text-ink-faint hover:text-over">✕</button>
            </div>
          ))}
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
