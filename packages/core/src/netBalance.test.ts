import { describe, expect, it } from 'vitest';
import type { LedgerData } from './types';
import { averageNet, income, monthlyIncome, monthNet } from './netBalance';

// June: income 250000, spend incl Rent 125000 -> net 125000
// May:  income 75000, no spend                 -> net 75000   (active via income only)
// April: no income, spend 8000                 -> net -8000   (active via entries only)
// March: nothing                               -> gap, skipped
function makeData(): LedgerData {
  return {
    groups: [{ id: 1, name: 'E', sort_order: 1, color: '#000' }],
    categories: [
      { id: 10, name: 'Rent', group_id: 1, sort_order: 1, color: '#000', exclude_from_discretionary: 1 },
      { id: 11, name: 'Groceries', group_id: 1, sort_order: 2, color: '#000', exclude_from_discretionary: 0 },
    ],
    entries: [
      { id: 1, amount_pence: 120000, category_id: 10, date: '2026-06-01', note: null, created_at: '2026-06-01T09:00:00Z' },
      { id: 2, amount_pence: 5000, category_id: 11, date: '2026-06-03', note: null, created_at: '2026-06-03T10:00:00Z' },
      { id: 3, amount_pence: 8000, category_id: 11, date: '2026-04-15', note: null, created_at: '2026-04-15T10:00:00Z' },
    ],
    lists: [],
    income: [
      { year: 2026, month: 6, amount_pence: 250000 },
      { year: 2026, month: 5, amount_pence: 75000 },
    ],
    views: [],
    defaultIncomePence: null,
  };
}

const NOW = '2026-06';

describe('monthlyIncome (raw explicit figure, no default fallback)', () => {
  it('returns the explicit figure for a month', () => {
    expect(monthlyIncome(makeData(), '2026-06')).toBe(250000);
  });

  it('returns null when a month has no explicit figure, even if a default is set', () => {
    expect(monthlyIncome({ ...makeData(), defaultIncomePence: 200000 }, '2026-03')).toBeNull();
  });
});

describe('income (resolved: explicit, else default, else 0)', () => {
  it('returns the explicit figure for a month', () => {
    expect(income(makeData(), '2026-06', NOW)).toBe(250000);
  });

  it('returns 0 when a month has no figure and there is no default', () => {
    expect(income(makeData(), '2026-03', NOW)).toBe(0);
  });

  it('falls back to the default for the current month with no explicit figure', () => {
    expect(income({ ...makeData(), income: [], defaultIncomePence: 200000 }, '2026-06', NOW)).toBe(200000);
  });

  it('falls back to the default for a future month', () => {
    expect(income({ ...makeData(), defaultIncomePence: 200000 }, '2026-09', NOW)).toBe(200000);
  });

  it('does NOT apply the default to a past month', () => {
    expect(income({ ...makeData(), defaultIncomePence: 200000 }, '2026-03', NOW)).toBe(0);
  });

  it('lets an explicit figure override the default', () => {
    expect(income({ ...makeData(), defaultIncomePence: 200000 }, '2026-06', NOW)).toBe(250000);
  });
});

describe('monthNet (includes Rent as real money out)', () => {
  it('is income minus the incl-Rent total', () => {
    expect(monthNet(makeData(), '2026-06', NOW)).toBe(125000);
  });

  it('can be negative when there is spend but no income', () => {
    expect(monthNet(makeData(), '2026-04', NOW)).toBe(-8000);
  });

  it('counts an income-only month at its full income', () => {
    expect(monthNet(makeData(), '2026-05', NOW)).toBe(75000);
  });
});

describe('averageNet (mean over months with ANY activity; gaps skipped)', () => {
  it('divides by active months only, never counting a gap month as £0', () => {
    // (125000 + 75000 - 8000) / 3 = 64000. Counting March as £0 would give 48000.
    expect(averageNet(makeData(), NOW)).toBe(64000);
  });

  it('returns 0 when there is no activity at all', () => {
    expect(
      averageNet({ groups: [], categories: [], entries: [], lists: [], income: [], views: [], defaultIncomePence: null }, NOW),
    ).toBe(0);
  });

  it('uses the default for the current active month when it has no explicit figure', () => {
    // June active via entries (125000 incl-Rent spend), no explicit income, default 200000
    // -> net June = 75000. April -8000, May 75000. avg = (75000 + 75000 - 8000) / 3.
    const data = { ...makeData(), income: [{ year: 2026, month: 5, amount_pence: 75000 }], defaultIncomePence: 200000 };
    expect(averageNet(data, NOW)).toBe(Math.round((75000 + 75000 - 8000) / 3));
  });

  it('rounds the mean to the nearest pence (half-up)', () => {
    const data: LedgerData = {
      groups: [],
      categories: [],
      entries: [],
      lists: [],
      income: [
        { year: 2026, month: 6, amount_pence: 100 },
        { year: 2026, month: 5, amount_pence: 101 },
      ],
      views: [],
      defaultIncomePence: null,
    };
    expect(averageNet(data, NOW)).toBe(101); // (100 + 101) / 2 = 100.5 -> 101
  });
});
