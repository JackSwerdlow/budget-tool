import type { Entry, RecurringMonth, RecurringTemplate } from './types.ts';

export type RecurringStatus = 'due' | 'confirmed' | 'skipped';

export type RecurringChecklistRow = {
  template: RecurringTemplate;
  status: RecurringStatus;
  // The confirmed month's entry (null unless status === 'confirmed').
  entry: Entry | null;
  // What the amount field should prefill with: the most recent confirmed amount from an
  // earlier month, falling back to the template's own default.
  prefillPence: number;
};

// Derive one month's checklist. `ym` is 'YYYY-MM' (month bucketing stays a string slice —
// never Date-parse). Rows keep the template order (sort_order, then id).
export function recurringChecklist(
  templates: RecurringTemplate[],
  months: RecurringMonth[],
  entries: Entry[],
  ym: string,
): RecurringChecklistRow[] {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const sorted = [...templates].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  return sorted.map((template) => {
    const own = months.filter((m) => m.template_id === template.id);
    const row = own.find((m) => m.month === ym);
    const entry = row?.entry_id != null ? entryById.get(row.entry_id) ?? null : null;
    const status: RecurringStatus = row ? (entry ? 'confirmed' : 'skipped') : 'due';

    let prefillPence = template.amount_pence;
    let prefillMonth = '';
    for (const m of own) {
      if (m.entry_id == null || m.month >= ym || m.month < prefillMonth) continue;
      const prior = entryById.get(m.entry_id);
      if (prior) {
        prefillPence = prior.amount_pence;
        prefillMonth = m.month;
      }
    }

    return { template, status, entry, prefillPence };
  });
}

// 'x of y done' for the month header — skipped counts as handled, not outstanding.
export function recurringProgress(rows: RecurringChecklistRow[]): { done: number; total: number } {
  return { done: rows.filter((r) => r.status !== 'due').length, total: rows.length };
}
