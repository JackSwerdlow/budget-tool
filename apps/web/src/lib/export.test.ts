import { expect, test } from 'vitest';
import { listCategorySubtotals, type LedgerData } from '@budget/core';
import { buildCsvExport, buildJsonExport } from './export';

function makeData(): LedgerData {
  return {
    groups: [
      { id: 1, name: 'Essentials', sort_order: 1, color: '#111' },
      { id: 2, name: 'Personal', sort_order: 2, color: '#222' },
    ],
    categories: [
      { id: 10, name: 'Groceries', group_id: 1, sort_order: 1, color: '#aaa' },
      { id: 20, name: 'Nicotine', group_id: 2, sort_order: 2, color: '#bbb' },
    ],
    entries: [
      { id: 1, amount_pence: 1500, category_id: 20, date: '2026-06-03', note: 'pouches, "mint"', created_at: '2026-06-03T11:00:00Z' },
    ],
    lists: [
      {
        id: 1,
        date: '2026-06-02',
        note: null,
        delivery_fee_pence: 300,
        delivery_share_pct: 50,
        delivery_category_id: 10,
        created_at: '2026-06-02T10:00:00Z',
        items: [
          { id: 1, list_id: 1, name: 'milk', price_pence: 500, quantity: 1, share_pct: 0, category_id: 10, sort_order: 1 },
          { id: 2, list_id: 1, name: 'soap', price_pence: 205, quantity: 2, share_pct: 50, category_id: 10, sort_order: 2 },
        ],
      },
    ],
    income: [],
    views: [],
    defaultIncomePence: null,
  };
}

test('CSV: one row per entry, list item, and delivery fee, sorted by date', () => {
  const lines = buildCsvExport(makeData()).trimEnd().split('\n');
  expect(lines[0]).toBe('date,kind,group,category,description,quantity,share_pct,full_gbp,my_share_gbp');
  expect(lines).toHaveLength(5); // header + 2 items + fee + entry
  expect(lines[1]).toBe('2026-06-02,list item,Essentials,Groceries,milk,1,0,5.00,5.00');
  // 205 at 50%: flatmate rounds half-up to 103, mine is the exact remainder (102)
  expect(lines[2]).toBe('2026-06-02,list item,Essentials,Groceries,soap,2,50,2.05,1.02');
  expect(lines[3]).toBe('2026-06-02,list fee,Essentials,Groceries,Delivery / bag fee,,50,3.00,1.50');
  expect(lines[4]).toBe('2026-06-03,entry,Personal,Nicotine,"pouches, ""mint""",,,15.00,15.00');
});

test('CSV my-share column sums to the ledger totals exactly', () => {
  const data = makeData();
  const myShares = buildCsvExport(data)
    .trimEnd()
    .split('\n')
    .slice(1)
    .map((l) => Math.round(Number(l.split(',').slice(-1)[0]) * 100));
  const csvTotal = myShares.reduce((s, v) => s + v, 0);
  let ledgerTotal = data.entries.reduce((s, e) => s + e.amount_pence, 0);
  for (const l of data.lists) for (const [, pence] of listCategorySubtotals(l)) ledgerTotal += pence;
  expect(csvTotal).toBe(ledgerTotal);
});

test('JSON: a faithful dump with a format marker', () => {
  const data = makeData();
  const parsed = JSON.parse(buildJsonExport(data, '2026-07-03T00:00:00Z'));
  expect(parsed.app).toBe('budget-tool');
  expect(parsed.format).toBe(1);
  expect(parsed.exported_at).toBe('2026-07-03T00:00:00Z');
  expect(parsed.entries).toEqual(data.entries);
  expect(parsed.lists).toEqual(data.lists);
  expect(parsed.groups).toEqual(data.groups);
  expect(parsed.default_income_pence).toBeNull();
});
