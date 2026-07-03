import { useMemo, useState } from 'react';
import { formatGBP, listTotals, type BudgetList, type LedgerData } from '@budget/core';
import { createList } from '../api';
import { useData } from '../data';
import { todayISO } from '../lib/dates';
import { ListForm } from './ListForm';

export function AddList({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const [saved, setSaved] = useState<string | null>(null);
  // Remount the form after a successful save (or template pick) to reset every field.
  const [formKey, setFormKey] = useState(0);
  // "Start from a past list": seed the form with a previous list's items, dated today —
  // the weekly shop rarely changes much, so most rows just need a price check.
  const [template, setTemplate] = useState<BudgetList | null>(null);

  const recent = useMemo(
    () =>
      [...data.lists]
        .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
        .slice(0, 8),
    [data.lists],
  );

  const startFrom = (list: BudgetList) => {
    setTemplate({ ...list, date: todayISO() });
    setSaved(null);
    setFormKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      {saved && <p className="text-sm text-under">{saved}</p>}
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-faint">Start from</span>
          <select
            value=""
            aria-label="Start from a past list"
            onChange={(e) => {
              const list = recent.find((l) => l.id === Number(e.target.value));
              if (list) startFrom(list);
            }}
            className="rounded border border-hairline bg-panel px-1.5 py-0.5 text-xs text-ink"
          >
            <option value="">a past list…</option>
            {recent.map((l) => (
              <option key={l.id} value={l.id}>
                {l.date} · {l.note || `${l.items.length} items`} · {formatGBP(listTotals(l).mine)}
              </option>
            ))}
          </select>
          {template && (
            <button
              type="button"
              onClick={() => {
                setTemplate(null);
                setFormKey((k) => k + 1);
              }}
              className="text-ink-muted transition-colors hover:text-accent"
            >
              Clear
            </button>
          )}
        </div>
      )}
      <ListForm
        key={formKey}
        data={data}
        initial={template ?? undefined}
        submitLabel="Save list"
        onSubmit={async (input) => {
          const created = await createList(input);
          await refresh();
          setSaved(`Saved — ${formatGBP(listTotals(created).mine)} filed to your share.`);
          setTemplate(null);
          setFormKey((k) => k + 1);
        }}
      />
    </div>
  );
}
