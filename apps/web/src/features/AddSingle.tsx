import { type FormEvent, useMemo, useRef, useState } from 'react';
import { evalSum, formatGBP, type Entry, type LedgerData } from '@budget/core';
import { createEntry, deleteEntry } from '../api';
import { useData } from '../data';
import { todayISO } from '../lib/dates';
import { coarsePointer } from '../lib/pointer';
import { CategoryGrid } from '../components/CategoryGrid';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function AddSingle({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [session, setSession] = useState<Entry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  const filterMatches = data.categories.filter(
    (c) => categoryFilter.trim() === '' || c.name.toLowerCase().includes(categoryFilter.trim().toLowerCase()),
  );

  const amountPence = useMemo(() => {
    if (amountText.trim() === '') return null;
    try {
      return evalSum(amountText);
    } catch {
      return null;
    }
  }, [amountText]);

  const categoryById = (id: number) => data.categories.find((c) => c.id === id);
  const canSave =
    amountPence !== null && amountPence > 0 && categoryId !== null && DATE_RE.test(date) && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || categoryId === null || amountPence === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const entry = await createEntry({
        amount_pence: amountPence,
        category_id: categoryId,
        date,
        note: note.trim() || null,
      });
      setSession((prev) => [entry, ...prev]);
      setAmountText('');
      setNote('');
      await refresh();
      amountRef.current?.focus();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onUndo(id: number) {
    try {
      await deleteEntry(id);
      setSession((prev) => prev.filter((e) => e.id !== id));
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <div>
          <label htmlFor="amount" className="mb-1 block text-xs uppercase tracking-wide text-ink-faint">
            Amount
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">£</span>
              <input
                id="amount"
                ref={amountRef}
                // Focus on mount for a mouse desktop (keyboard-first entry), but not on touch —
                // an autofocus there summons the phone keyboard the instant the Add tab opens.
                autoFocus={!coarsePointer()}
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="8+8+8+5"
                className="w-full rounded-md border border-hairline bg-paper py-2 pl-7 pr-3 font-serif text-xl text-ink outline-none focus:border-ink/40"
              />
            </div>
            <div className="min-w-[6.5rem] text-right font-serif text-xl">
              {amountText.trim() === '' ? (
                <span className="text-ink-faint">—</span>
              ) : amountPence === null ? (
                <span className="text-sm text-over">invalid</span>
              ) : (
                <span className="text-ink">{formatGBP(amountPence)}</span>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            Type a sum like <code className="rounded bg-raised px-1 py-0.5 font-mono">(8*5)/3 + 5</code> — brackets,
            +, -, *, / all work, and it totals as you go.
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs uppercase tracking-wide text-ink-faint">Category</span>
            <input
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              onKeyDown={(e) => {
                // Enter selects the (first) filtered match — type "nic" ⏎ → Nicotine.
                if (e.key === 'Enter' && filterMatches.length > 0) {
                  e.preventDefault();
                  setCategoryId(filterMatches[0].id);
                  setCategoryFilter('');
                }
              }}
              aria-label="Filter categories"
              placeholder="type to filter…"
              className="w-40 rounded-md border border-hairline bg-paper px-2 py-1 text-xs text-ink outline-none focus:border-ink/40"
            />
          </div>
          <CategoryGrid
            groups={data.groups}
            categories={data.categories}
            selectedId={categoryId}
            onSelect={setCategoryId}
            filter={categoryFilter}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="date" className="mb-1 block text-xs uppercase tracking-wide text-ink-faint">
              Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink/40"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="note" className="mb-1 block text-xs uppercase tracking-wide text-ink-faint">
              Note <span className="normal-case text-ink-faint">(optional)</span>
            </label>
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. new shoes"
              className="w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink/40"
            />
          </div>
        </div>

        {error && <p className="text-sm text-over">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save entry'}
          </button>
          <span className="text-xs text-ink-faint">
            Press <kbd className="rounded bg-raised px-1 py-0.5 font-mono">Enter</kbd> to save &amp; clear for the next line.
          </span>
        </div>
      </form>

      <aside>
        <h3 className="mb-2 font-serif text-base text-ink">Added just now</h3>
        {session.length === 0 ? (
          <p className="text-sm text-ink-muted">Saved entries from this session appear here.</p>
        ) : (
          <ul className="space-y-1.5">
            {session.map((entry) => {
              const cat = categoryById(entry.category_id);
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-3 py-2 text-sm"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: cat?.color }} />
                  <span className="min-w-0 truncate text-ink">
                    {cat?.name}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-ink">{formatGBP(entry.amount_pence)}</span>
                  <button
                    type="button"
                    onClick={() => onUndo(entry.id)}
                    aria-label="Undo this entry"
                    className="shrink-0 text-ink-faint transition-colors hover:text-over"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
