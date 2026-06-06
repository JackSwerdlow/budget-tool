import { type FormEvent, useEffect, useState } from 'react';
import { evalSum, formatGBP, monthlyIncome, type LedgerData } from '@budget/core';
import { clearDefaultIncome, deleteIncome, setDefaultIncome, setIncome } from '../../api';
import { useData } from '../../data';
import { MonthPicker } from '../../components/ui';
import { monthLabel, todayISO } from '../../lib/dates';

export function ManageIncome({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const currentYm = todayISO().slice(0, 7);
  const [ym, setYm] = useState(currentYm);
  const [text, setText] = useState('');
  const [defaultText, setDefaultText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const explicit = monthlyIncome(data, ym);
  const usingDefault = explicit === null && data.defaultIncomePence != null && ym >= currentYm;

  useEffect(() => {
    // Prefill the month field from the EXPLICIT figure only (never the default — saving
    // it would silently freeze the default into an override).
    setText(explicit != null ? (explicit / 100).toFixed(2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, data]);

  useEffect(() => {
    setDefaultText(data.defaultIncomePence != null ? (data.defaultIncomePence / 100).toFixed(2) : '');
  }, [data.defaultIncomePence]);

  const onSaveDefault = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (defaultText.trim() === '') await clearDefaultIncome();
      else await setDefaultIncome(evalSum(defaultText));
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(5, 7));
    try {
      if (text.trim() === '') await deleteIncome(year, month);
      else await setIncome(year, month, evalSum(text));
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const clear = async (year: number, month: number) => {
    await deleteIncome(year, month);
    await refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSaveDefault} className="rounded-lg border border-hairline bg-panel p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="default-income" className="mb-1 block text-xs uppercase tracking-wide text-ink-faint">
              Default income
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">£</span>
              <input
                id="default-income"
                value={defaultText}
                onChange={(e) => setDefaultText(e.target.value)}
                inputMode="decimal"
                placeholder="none"
                className="w-40 rounded-md border border-hairline bg-paper py-2 pl-7 pr-3 text-sm text-ink outline-none focus:border-ink/40"
              />
            </div>
          </div>
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
            {defaultText.trim() === '' ? 'Clear default' : 'Save default'}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Auto-fills this month and future months you haven't set explicitly. Past months stay untouched, and any month
          you set below overrides it.
        </p>
      </form>

      <div>
        <h3 className="mb-3 font-serif text-base text-ink">Set a specific month</h3>
        <form onSubmit={onSave} className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-ink-faint">Month</label>
            <MonthPicker ym={ym} onChange={setYm} />
          </div>
          <div>
            <label htmlFor="income" className="mb-1 block text-xs uppercase tracking-wide text-ink-faint">Income</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">£</span>
              <input
                id="income"
                value={text}
                onChange={(e) => setText(e.target.value)}
                inputMode="decimal"
                placeholder={usingDefault ? (data.defaultIncomePence! / 100).toFixed(2) : '0.00'}
                className="w-40 rounded-md border border-hairline bg-paper py-2 pl-7 pr-3 text-sm text-ink outline-none focus:border-ink/40"
              />
            </div>
          </div>
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
            {text.trim() === '' ? 'Clear month' : 'Save income'}
          </button>
        </form>
        {usingDefault && (
          <p className="mt-2 text-xs text-ink-muted">
            Using the default ({formatGBP(data.defaultIncomePence!)}). Enter a value to override just this month.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-over">{error}</p>}

      <div>
        <h3 className="mb-2 font-serif text-base text-ink">Recorded income</h3>
        {data.income.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {data.defaultIncomePence != null
              ? `No months set explicitly — all use the default ${formatGBP(data.defaultIncomePence)}.`
              : 'No income recorded yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {data.income.map((row) => (
              <li key={`${row.year}-${row.month}`} className="flex items-center gap-3 py-2 text-sm">
                <span className="text-ink">{monthLabel(`${row.year}-${String(row.month).padStart(2, '0')}`)}</span>
                <span className="ml-auto tabular-nums text-ink">{formatGBP(row.amount_pence)}</span>
                <button type="button" onClick={() => clear(row.year, row.month)} aria-label="Clear" className="text-ink-faint hover:text-over">✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
