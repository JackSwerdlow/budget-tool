import { describe, expect, it } from 'vitest';
import type { BudgetList, ListItem } from './types';
import { itemMyCost, listCategorySubtotals, listTotals } from './list';

function item(partial: Partial<ListItem>): ListItem {
  return {
    id: 1,
    list_id: 1,
    name: 'x',
    price_pence: 0,
    quantity: 1,
    share_pct: 0,
    category_id: 1,
    sort_order: 1,
    ...partial,
  };
}

function list(partial: Partial<BudgetList>): BudgetList {
  return {
    id: 1,
    date: '2026-06-03',
    note: null,
    delivery_fee_pence: 0,
    delivery_share_pct: 0,
    delivery_category_id: 1,
    created_at: '2026-06-03T10:00:00Z',
    items: [],
    ...partial,
  };
}

describe('itemMyCost', () => {
  it('is the full price at 0% share', () => {
    expect(itemMyCost(item({ price_pence: 1299, share_pct: 0 }))).toBe(1299);
  });

  it('uses the half-up split (my remainder) — £0.07 @ 50% -> 3', () => {
    expect(itemMyCost(item({ price_pence: 7, share_pct: 50 }))).toBe(3);
  });

  it('canonical £9.00 @ 33% -> 603', () => {
    expect(itemMyCost(item({ price_pence: 900, share_pct: 33 }))).toBe(603);
  });

  it('is £0 when the flatmate covers it (100%)', () => {
    expect(itemMyCost(item({ price_pence: 1299, share_pct: 100 }))).toBe(0);
  });
});

describe('listTotals', () => {
  it('full = mine + flatmate exactly', () => {
    const l = list({
      items: [
        item({ price_pence: 900, share_pct: 33, category_id: 3 }),
        item({ id: 2, price_pence: 450, share_pct: 0, category_id: 4 }),
      ],
    });
    const t = listTotals(l);
    expect(t.full).toBe(1350);
    expect(t.mine).toBe(603 + 450);
    expect(t.flatmate).toBe(t.full - t.mine);
    expect(t.mine + t.flatmate).toBe(t.full);
  });

  it('per-item-then-sum: two 7p @ 50% -> mine 6, never 7 (no round-the-total drift)', () => {
    const l = list({
      items: [item({ price_pence: 7, share_pct: 50 }), item({ id: 2, price_pence: 7, share_pct: 50 })],
    });
    expect(listTotals(l).mine).toBe(6);
  });

  it('includes the delivery fee, split the same way', () => {
    const l = list({
      items: [item({ price_pence: 1000, share_pct: 0, category_id: 3 })],
      delivery_fee_pence: 300,
      delivery_share_pct: 50,
      delivery_category_id: 3,
    });
    expect(listTotals(l)).toEqual({ full: 1300, mine: 1150, flatmate: 150 });
  });
});

describe('listCategorySubtotals', () => {
  it('sums per-item my-cost into each category', () => {
    const l = list({
      items: [
        item({ price_pence: 4000, share_pct: 0, category_id: 3 }),
        item({ id: 2, price_pence: 1200, share_pct: 50, category_id: 4 }),
        item({ id: 3, price_pence: 800, share_pct: 0, category_id: 3 }),
      ],
    });
    expect(Object.fromEntries(listCategorySubtotals(l))).toEqual({ 3: 4800, 4: 600 });
  });

  it('adds the delivery fee my-cost to its own category', () => {
    const l = list({
      items: [item({ price_pence: 1000, share_pct: 0, category_id: 3 })],
      delivery_fee_pence: 200,
      delivery_share_pct: 0,
      delivery_category_id: 5,
    });
    expect(Object.fromEntries(listCategorySubtotals(l))).toEqual({ 3: 1000, 5: 200 });
  });

  it('subtotals sum EXACTLY to listTotals.mine — incl. the drift counter-example', () => {
    const l = list({
      items: [
        item({ price_pence: 7, share_pct: 50, category_id: 3 }),
        item({ id: 2, price_pence: 7, share_pct: 50, category_id: 3 }),
        item({ id: 3, price_pence: 903, share_pct: 33, category_id: 4 }),
      ],
      delivery_fee_pence: 150,
      delivery_share_pct: 50,
      delivery_category_id: 3,
    });
    const sum = [...listCategorySubtotals(l).values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(listTotals(l).mine);
  });
});
