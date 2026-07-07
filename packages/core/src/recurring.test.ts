import { describe, expect, it } from 'vitest';
import type { Entry, RecurringMonth, RecurringTemplate } from './types';
import { recurringChecklist, recurringProgress } from './recurring';

function template(id: number, name: string, amount_pence: number, sort_order = id): RecurringTemplate {
  return { id, name, category_id: 10, amount_pence, sort_order };
}

function entry(id: number, amount_pence: number, date: string): Entry {
  return { id, amount_pence, category_id: 10, date, note: null, created_at: `${date}T00:00:00Z` };
}

describe('recurringChecklist', () => {
  it('marks templates with no month row as due, prefilled with the template default', () => {
    const rows = recurringChecklist([template(1, 'Rent', 95000)], [], [], '2026-07');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('due');
    expect(rows[0].entry).toBeNull();
    expect(rows[0].prefillPence).toBe(95000);
  });

  it('marks a month row with an entry as confirmed and attaches the entry', () => {
    const months: RecurringMonth[] = [{ template_id: 1, month: '2026-07', entry_id: 5 }];
    const rows = recurringChecklist([template(1, 'Rent', 95000)], months, [entry(5, 96000, '2026-07-01')], '2026-07');
    expect(rows[0].status).toBe('confirmed');
    expect(rows[0].entry?.amount_pence).toBe(96000);
  });

  it('marks a month row with a null entry as skipped', () => {
    const months: RecurringMonth[] = [{ template_id: 1, month: '2026-07', entry_id: null }];
    const rows = recurringChecklist([template(1, 'Rent', 95000)], months, [], '2026-07');
    expect(rows[0].status).toBe('skipped');
    expect(rows[0].entry).toBeNull();
  });

  it('prefills from the latest earlier confirmed month, not the template default', () => {
    const months: RecurringMonth[] = [
      { template_id: 1, month: '2026-05', entry_id: 5 },
      { template_id: 1, month: '2026-06', entry_id: 6 },
    ];
    const entries = [entry(5, 8000, '2026-05-01'), entry(6, 8420, '2026-06-01')];
    const rows = recurringChecklist([template(1, 'Elec/Gas', 7500)], months, entries, '2026-07');
    expect(rows[0].prefillPence).toBe(8420);
  });

  it('ignores this month and later months when computing the prefill (backfilling an old month)', () => {
    const months: RecurringMonth[] = [
      { template_id: 1, month: '2026-06', entry_id: 6 },
      { template_id: 1, month: '2026-04', entry_id: 4 },
    ];
    const entries = [entry(4, 8000, '2026-04-01'), entry(6, 9000, '2026-06-01')];
    const rows = recurringChecklist([template(1, 'Elec/Gas', 7500)], months, entries, '2026-05');
    expect(rows[0].prefillPence).toBe(8000);
    expect(rows[0].status).toBe('due');
  });

  it('skipped months never feed the prefill', () => {
    const months: RecurringMonth[] = [{ template_id: 1, month: '2026-06', entry_id: null }];
    const rows = recurringChecklist([template(1, 'Spotify', 1199)], months, [], '2026-07');
    expect(rows[0].prefillPence).toBe(1199);
  });

  it('orders rows by sort_order then id', () => {
    const templates = [
      { ...template(2, 'Netflix', 1099), sort_order: 2 },
      { ...template(1, 'Rent', 95000), sort_order: 1 },
      { ...template(3, 'Water', 3200), sort_order: 2 },
    ];
    const rows = recurringChecklist(templates, [], [], '2026-07');
    expect(rows.map((r) => r.template.name)).toEqual(['Rent', 'Netflix', 'Water']);
  });
});

describe('recurringProgress', () => {
  it('counts confirmed and skipped as done', () => {
    const months: RecurringMonth[] = [
      { template_id: 1, month: '2026-07', entry_id: 5 },
      { template_id: 2, month: '2026-07', entry_id: null },
    ];
    const rows = recurringChecklist(
      [template(1, 'Rent', 95000), template(2, 'Netflix', 1099), template(3, 'Water', 3200)],
      months,
      [entry(5, 95000, '2026-07-01')],
      '2026-07',
    );
    expect(recurringProgress(rows)).toEqual({ done: 2, total: 3 });
  });
});
