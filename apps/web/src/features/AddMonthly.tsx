import { useMemo, useState } from 'react';
import {
  evalSum, formatGBP, recurringChecklist, recurringProgress,
  type LedgerData, type RecurringChecklistRow, type RecurringTemplate,
} from '@budget/core';
import {
  confirmRecurring, createRecurringTemplate, deleteEntry, deleteRecurringTemplate,
  skipRecurring, unskipRecurring, updateRecurringTemplate,
} from '../api';
import { useData } from '../data';
import { fullDate, todayISO } from '../lib/dates';
import { CategorySelect } from '../components/CategorySelect';
import { MonthPicker } from '../components/ui';

function penceToText(pence: number): string {
  return (pence / 100).toFixed(2);
}

function parsePence(text: string): number | null {
  if (text.trim() === '') return null;
  try {
    return evalSum(text);
  } catch {
    return null;
  }
}

export function AddMonthly({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const [ym, setYm] = useState<string>(todayISO().slice(0, 7));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => recurringChecklist(data.recurringTemplates, data.recurringMonths, data.entries, ym),
    [data, ym],
  );
  const progress = recurringProgress(rows);

  const run = async (op: () => Promise<unknown>) => {
    setError(null);
    try {
      await op();
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <MonthPicker ym={ym} onChange={setYm} />
          {rows.length > 0 && (
            <span className="text-sm text-ink-muted">
              {progress.done} of {progress.total} done
            </span>
          )}
        </div>
        {data.recurringTemplates.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={`text-xs transition-colors hover:text-accent ${editing ? 'text-accent' : 'text-ink-muted'}`}
          >
            {editing ? 'done editing' : 'edit items'}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-over">{error}</p>}

      {rows.length === 0 && !editing ? (
        <p className="mb-6 text-sm text-ink-muted">
          No recurring items yet. Add the spends that arrive every month — rent, bills,
          subscriptions — and each month becomes a quick confirm-the-amount checklist instead
          of retyping them.
        </p>
      ) : (
        <ul className="mb-6 space-y-1.5" key={ym}>
          {rows.map((row) =>
            editing ? (
              <TemplateEditRow key={row.template.id} data={data} template={row.template} run={run} />
            ) : (
              <ChecklistRow key={row.template.id} data={data} row={row} ym={ym} run={run} />
            ),
          )}
        </ul>
      )}

      {(editing || data.recurringTemplates.length === 0) && <NewTemplateForm data={data} run={run} />}
    </div>
  );
}

function ChecklistRow({
  data, row, ym, run,
}: {
  data: LedgerData;
  row: RecurringChecklistRow;
  ym: string;
  run: (op: () => Promise<unknown>) => Promise<void>;
}) {
  const { template, status, entry, prefillPence } = row;
  const today = todayISO();
  const [amountText, setAmountText] = useState(penceToText(prefillPence));
  const [date, setDate] = useState(today.slice(0, 7) === ym ? today : `${ym}-01`);
  const category = data.categories.find((c) => c.id === template.category_id);
  const amountPence = parsePence(amountText);
  const canConfirm = amountPence !== null && amountPence > 0;

  const confirm = () =>
    run(() =>
      confirmRecurring(template.id, {
        amount_pence: amountPence!,
        date,
        // The category already names same-named items (e.g. Rent); a distinct template
        // name (e.g. Netflix) is worth keeping on the entry.
        note: template.name.toLowerCase() === category?.name.toLowerCase() ? null : template.name,
      }),
    );

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-hairline bg-panel px-3 py-2 text-sm">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: category?.color }} />
      <span className="min-w-0 flex-1 truncate">
        <span className={status === 'skipped' ? 'text-ink-faint line-through' : 'text-ink'}>{template.name}</span>
        <span className="ml-2 text-xs text-ink-faint">{category?.name}</span>
      </span>

      {status === 'confirmed' && entry ? (
        <>
          <span className="text-xs text-ink-faint">{fullDate(entry.date)}</span>
          <span className="tabular-nums text-ink">{formatGBP(entry.amount_pence)}</span>
          <span className="text-xs text-under">✓ done</span>
          <button
            type="button"
            onClick={() => run(() => deleteEntry(entry.id))}
            aria-label={`Undo ${template.name}`}
            className="text-ink-faint transition-colors hover:text-over"
          >
            ✕
          </button>
        </>
      ) : status === 'skipped' ? (
        <>
          <span className="text-xs text-ink-faint">skipped this month</span>
          <button
            type="button"
            onClick={() => run(() => unskipRecurring(template.id, ym))}
            className="text-xs text-ink-muted transition-colors hover:text-accent"
          >
            undo
          </button>
        </>
      ) : (
        <>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={`${template.name} date`}
            className="rounded-md border border-hairline bg-paper px-2 py-1 text-xs text-ink outline-none focus:border-ink/40"
          />
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint">£</span>
            <input
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) void confirm();
              }}
              aria-label={`${template.name} amount`}
              className={`w-24 rounded-md border bg-paper py-1 pl-5 pr-2 text-right text-sm tabular-nums text-ink outline-none focus:border-ink/40 ${
                amountPence === null ? 'border-over' : 'border-hairline'
              }`}
            />
          </div>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => void confirm()}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => run(() => skipRecurring(template.id, ym))}
            className="text-xs text-ink-muted transition-colors hover:text-ink"
          >
            skip
          </button>
        </>
      )}
    </li>
  );
}

function TemplateEditRow({
  data, template, run,
}: {
  data: LedgerData;
  template: RecurringTemplate;
  run: (op: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(template.name);
  const [categoryId, setCategoryId] = useState(template.category_id);
  const [amountText, setAmountText] = useState(penceToText(template.amount_pence));
  const [armed, setArmed] = useState(false);
  const amountPence = parsePence(amountText);

  const dirty =
    name.trim() !== template.name ||
    categoryId !== template.category_id ||
    (amountPence !== null && amountPence !== template.amount_pence);
  const canSave = dirty && name.trim() !== '' && amountPence !== null && amountPence > 0;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-hairline bg-panel px-3 py-2 text-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Recurring item name"
        className="w-36 rounded-md border border-hairline bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-ink/40"
      />
      <div className="w-40">
        <CategorySelect groups={data.groups} categories={data.categories} value={categoryId} onChange={setCategoryId} />
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint">£</span>
        <input
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          aria-label="Default amount"
          className="w-24 rounded-md border border-hairline bg-paper py-1 pl-5 pr-2 text-right text-sm tabular-nums text-ink outline-none focus:border-ink/40"
        />
      </div>
      <button
        type="button"
        disabled={!canSave}
        onClick={() =>
          run(() =>
            updateRecurringTemplate(template.id, {
              name: name.trim(),
              category_id: categoryId,
              amount_pence: amountPence!,
            }),
          )
        }
        className="text-xs text-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => (armed ? void run(() => deleteRecurringTemplate(template.id)) : setArmed(true))}
        onBlur={() => setArmed(false)}
        className={`ml-auto text-xs transition-colors ${armed ? 'text-over' : 'text-ink-muted hover:text-over'}`}
      >
        {armed ? 'Really delete?' : 'Delete'}
      </button>
    </li>
  );
}

function NewTemplateForm({
  data, run,
}: {
  data: LedgerData;
  run: (op: () => Promise<unknown>) => Promise<void>;
}) {
  const defaultCategoryId = data.categories[0]?.id ?? null;
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(defaultCategoryId);
  const [amountText, setAmountText] = useState('');
  const amountPence = parsePence(amountText);
  const canAdd = name.trim() !== '' && categoryId !== null && amountPence !== null && amountPence > 0;

  if (defaultCategoryId === null) {
    return <p className="text-sm text-ink-muted">Create a category in ⚙ Manage first.</p>;
  }

  const add = () =>
    run(async () => {
      await createRecurringTemplate({ name: name.trim(), category_id: categoryId!, amount_pence: amountPence! });
      setName('');
      setAmountText('');
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canAdd) void add();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Rent, Netflix…"
        aria-label="New recurring item name"
        className="w-40 rounded-md border border-hairline bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-ink/40"
      />
      <div className="w-40">
        <CategorySelect groups={data.groups} categories={data.categories} value={categoryId!} onChange={setCategoryId} />
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint">£</span>
        <input
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0.00"
          aria-label="New recurring item amount"
          className="w-24 rounded-md border border-hairline bg-paper py-1.5 pl-5 pr-2 text-right text-sm tabular-nums text-ink outline-none focus:border-ink/40"
        />
      </div>
      <button
        type="submit"
        disabled={!canAdd}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        + Add recurring item
      </button>
    </form>
  );
}
