import type { LedgerData } from './types';
import { ymOf } from './time';

// Phase 1 combines entries only. Phase 2 adds each list's per-category my-share
// subtotals here (computed via the `list` module) — callers already pass the whole
// LedgerData, so that change stays local to this file.

export function categoryTotals(data: LedgerData, ym: string): Map<number, number> {
  const totals = new Map<number, number>();
  for (const entry of data.entries) {
    if (ymOf(entry.date) !== ym) continue;
    totals.set(entry.category_id, (totals.get(entry.category_id) ?? 0) + entry.amount_pence);
  }
  return totals;
}

export function groupTotals(data: LedgerData, ym: string): Map<number, number> {
  const groupOfCategory = new Map<number, number>();
  for (const category of data.categories) groupOfCategory.set(category.id, category.group_id);

  const totals = new Map<number, number>();
  for (const [categoryId, pence] of categoryTotals(data, ym)) {
    const groupId = groupOfCategory.get(categoryId);
    if (groupId === undefined) continue;
    totals.set(groupId, (totals.get(groupId) ?? 0) + pence);
  }
  return totals;
}

export type TotalOptions = { excludeRent?: boolean };

export function monthTotal(data: LedgerData, ym: string, options: TotalOptions = {}): number {
  const excluded = excludedCategoryIds(data, options.excludeRent ?? false);
  let total = 0;
  for (const [categoryId, pence] of categoryTotals(data, ym)) {
    if (excluded.has(categoryId)) continue;
    total += pence;
  }
  return total;
}

export type CumulativePoint = { date: string; cumulativePence: number };

// Always ex-Rent: Rent's day-1 step otherwise scuffs the running line's shape.
export function runningCumulative(data: LedgerData, ym: string): CumulativePoint[] {
  const excluded = excludedCategoryIds(data, true);

  const byDate = new Map<string, number>();
  for (const entry of data.entries) {
    if (ymOf(entry.date) !== ym) continue;
    if (excluded.has(entry.category_id)) continue;
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.amount_pence);
  }

  let running = 0;
  return [...byDate.keys()]
    .sort()
    .map((date) => {
      running += byDate.get(date) ?? 0;
      return { date, cumulativePence: running };
    });
}

function excludedCategoryIds(data: LedgerData, excludeRent: boolean): Set<number> {
  const excluded = new Set<number>();
  if (!excludeRent) return excluded;
  for (const category of data.categories) {
    if (category.exclude_from_discretionary === 1) excluded.add(category.id);
  }
  return excluded;
}
