import { describe, expect, it } from 'vitest';
import type { LedgerData } from './types';
import { categoryTotals, groupTotals, monthTotal, runningCumulative } from './ledger';

function makeData(): LedgerData {
  return {
    groups: [
      { id: 1, name: 'Essentials', sort_order: 1, color: '#000' },
      { id: 2, name: 'Personal', sort_order: 2, color: '#000' },
    ],
    categories: [
      { id: 10, name: 'Rent', group_id: 1, sort_order: 1, color: '#000', exclude_from_discretionary: 1 },
      { id: 11, name: 'Groceries', group_id: 1, sort_order: 2, color: '#000', exclude_from_discretionary: 0 },
      { id: 20, name: 'Nicotine', group_id: 2, sort_order: 3, color: '#000', exclude_from_discretionary: 0 },
    ],
    entries: [
      { id: 1, amount_pence: 120000, category_id: 10, date: '2026-06-01', note: null, created_at: '2026-06-01T09:00:00Z' },
      { id: 2, amount_pence: 4000, category_id: 11, date: '2026-06-03', note: null, created_at: '2026-06-03T10:00:00Z' },
      { id: 3, amount_pence: 1500, category_id: 20, date: '2026-06-03', note: null, created_at: '2026-06-03T11:00:00Z' },
      { id: 4, amount_pence: 2000, category_id: 11, date: '2026-06-10', note: null, created_at: '2026-06-10T10:00:00Z' },
      { id: 5, amount_pence: 9999, category_id: 11, date: '2026-05-20', note: null, created_at: '2026-05-20T10:00:00Z' },
    ],
    lists: [],
    income: [],
  };
}

describe('categoryTotals', () => {
  it('sums entry amounts per category within the month only', () => {
    const totals = categoryTotals(makeData(), '2026-06');
    expect(Object.fromEntries(totals)).toEqual({ 10: 120000, 11: 6000, 20: 1500 });
  });

  it('buckets by month via date slice — last month is excluded', () => {
    const totals = categoryTotals(makeData(), '2026-05');
    expect(Object.fromEntries(totals)).toEqual({ 11: 9999 });
  });
});

describe('groupTotals', () => {
  it('rolls category totals up to their group', () => {
    const totals = groupTotals(makeData(), '2026-06');
    expect(Object.fromEntries(totals)).toEqual({ 1: 126000, 2: 1500 });
  });
});

describe('monthTotal', () => {
  it('includes Rent by default', () => {
    expect(monthTotal(makeData(), '2026-06')).toBe(127500);
  });

  it('drops ex-discretionary categories (Rent) when excludeRent is set', () => {
    expect(monthTotal(makeData(), '2026-06', { excludeRent: true })).toBe(7500);
  });
});

describe('runningCumulative (always ex-Rent)', () => {
  it('produces one cumulative point per spend date, sorted, excluding Rent', () => {
    const points = runningCumulative(makeData(), '2026-06');
    expect(points).toEqual([
      { date: '2026-06-03', cumulativePence: 5500 },
      { date: '2026-06-10', cumulativePence: 7500 },
    ]);
  });

  it('is empty for a month with no discretionary spend', () => {
    expect(runningCumulative(makeData(), '2026-04')).toEqual([]);
  });
});

describe('with itemised lists (fan-out into the ledger)', () => {
  function dataWithList(): LedgerData {
    return {
      ...makeData(),
      lists: [
        {
          id: 1,
          date: '2026-06-05',
          note: null,
          delivery_fee_pence: 0,
          delivery_share_pct: 0,
          delivery_category_id: 11,
          created_at: '2026-06-05T10:00:00Z',
          items: [
            { id: 1, list_id: 1, name: 'milk', price_pence: 500, quantity: 1, share_pct: 0, category_id: 11, sort_order: 1 },
            { id: 2, list_id: 1, name: 'soap', price_pence: 200, quantity: 1, share_pct: 50, category_id: 11, sort_order: 2 },
          ],
        },
      ],
    };
  }

  it('adds each list per-category my-share into categoryTotals', () => {
    // entries cat11 = 4000 + 2000 = 6000; list cat11 = 500 + (200 - round(100)) = 600 -> 6600
    expect(Object.fromEntries(categoryTotals(dataWithList(), '2026-06'))).toEqual({ 10: 120000, 11: 6600, 20: 1500 });
  });

  it('includes list spend (ex-Rent) in the running cumulative on the list date', () => {
    expect(runningCumulative(dataWithList(), '2026-06')).toEqual([
      { date: '2026-06-03', cumulativePence: 5500 },
      { date: '2026-06-05', cumulativePence: 6100 },
      { date: '2026-06-10', cumulativePence: 8100 },
    ]);
  });
});
