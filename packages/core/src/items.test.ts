import { describe, expect, it } from 'vitest';
import type { BudgetList, LedgerData } from './types';
import { itemSummaries } from './items';

function list(id: number, date: string, createdAt: string, items: Array<[string, number, number, number]>): BudgetList {
  return {
    id,
    date,
    note: null,
    delivery_fee_pence: 0,
    delivery_share_pct: 0,
    delivery_category_id: 10,
    created_at: createdAt,
    items: items.map(([name, price_pence, quantity, share_pct], i) => ({
      id: id * 100 + i,
      list_id: id,
      name,
      price_pence,
      quantity,
      share_pct,
      category_id: 10,
      sort_order: i + 1,
    })),
  };
}

function makeData(lists: BudgetList[]): LedgerData {
  return {
    groups: [{ id: 1, name: 'Essentials', sort_order: 1, color: '#111' }],
    categories: [{ id: 10, name: 'Groceries', group_id: 1, sort_order: 1, color: '#aaa', exclude_from_discretionary: 0 }],
    entries: [],
    lists,
    income: [],
    views: [],
    defaultIncomePence: null,
  };
}

describe('itemSummaries', () => {
  it('groups purchases case-insensitively, date ascending, latest casing wins', () => {
    const data = makeData([
      list(2, '2026-02-01', '2026-02-01T10:00:00Z', [['MILK', 130, 1, 0]]),
      list(1, '2026-01-01', '2026-01-01T10:00:00Z', [['milk', 120, 1, 0]]),
    ]);
    const [milk] = itemSummaries(data);
    expect(milk.name).toBe('MILK');
    expect(milk.purchases.map((p) => p.pricePence)).toEqual([120, 130]);
    expect(milk.timesBought).toBe(2);
    expect(milk.firstUnitPricePence).toBe(120);
    expect(milk.lastUnitPricePence).toBe(130);
  });

  it('sums full prices, my-shares, and quantities; sorts by total spend desc', () => {
    const data = makeData([
      list(1, '2026-01-01', '2026-01-01T10:00:00Z', [
        ['milk', 120, 1, 0],
        ['soap', 205, 1, 50], // my share = 102 (half-up remainder goes to flatmate side)
      ]),
      list(2, '2026-02-01', '2026-02-01T10:00:00Z', [['soap', 205, 1, 50]]),
    ]);
    const summaries = itemSummaries(data);
    expect(summaries.map((s) => s.name)).toEqual(['soap', 'milk']);
    const soap = summaries[0];
    expect(soap.totalPence).toBe(410);
    expect(soap.totalMyPence).toBe(204);
    expect(soap.totalQuantity).toBe(2);
  });

  it('computes unit price per purchase (price ÷ qty, rounded to the penny)', () => {
    const data = makeData([list(1, '2026-01-01', '2026-01-01T10:00:00Z', [['eggs', 500, 3, 0]])]);
    expect(itemSummaries(data)[0].purchases[0].unitPricePence).toBe(167);
  });

  it('skips excluded categories and blank names', () => {
    const data = makeData([
      list(1, '2026-01-01', '2026-01-01T10:00:00Z', [
        ['milk', 120, 1, 0],
        ['  ', 999, 1, 0],
      ]),
    ]);
    expect(itemSummaries(data, { excludedCategoryIds: new Set([10]) })).toEqual([]);
    expect(itemSummaries(data).map((s) => s.name)).toEqual(['milk']);
  });
});
