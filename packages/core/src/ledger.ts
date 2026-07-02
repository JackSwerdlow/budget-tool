import { listCategorySubtotals } from './list.ts';
import type { LedgerData } from './types.ts';
import { ymOf } from './time.ts';

// Combines normal entries with each itemised list's per-category my-share subtotals.

export function categoryTotals(data: LedgerData, ym: string): Map<number, number> {
  const totals = new Map<number, number>();
  for (const entry of data.entries) {
    if (ymOf(entry.date) !== ym) continue;
    totals.set(entry.category_id, (totals.get(entry.category_id) ?? 0) + entry.amount_pence);
  }
  for (const list of data.lists) {
    if (ymOf(list.date) !== ym) continue;
    for (const [categoryId, pence] of listCategorySubtotals(list)) {
      totals.set(categoryId, (totals.get(categoryId) ?? 0) + pence);
    }
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

export type TotalOptions = { excludedCategoryIds?: ReadonlySet<number> };

const EMPTY_SET: ReadonlySet<number> = new Set();

export function monthTotal(data: LedgerData, ym: string, options: TotalOptions = {}): number {
  const excluded = options.excludedCategoryIds ?? EMPTY_SET;
  let total = 0;
  for (const [categoryId, pence] of categoryTotals(data, ym)) {
    if (excluded.has(categoryId)) continue;
    total += pence;
  }
  return total;
}

// Calendar-year-to-date: sums monthTotal from January through the viewed month's year/month.
export function yearTotal(data: LedgerData, ym: string, options: TotalOptions = {}): number {
  const year = ym.slice(0, 4);
  const throughMonth = Number(ym.slice(5, 7));
  let total = 0;
  for (let m = 1; m <= throughMonth; m++) {
    total += monthTotal(data, `${year}-${String(m).padStart(2, '0')}`, options);
  }
  return total;
}

export type CumulativePoint = { date: string; cumulativePence: number };

export function runningCumulative(data: LedgerData, ym: string, options: TotalOptions = {}): CumulativePoint[] {
  const excluded = options.excludedCategoryIds ?? EMPTY_SET;

  const byDate = new Map<string, number>();
  for (const entry of data.entries) {
    if (ymOf(entry.date) !== ym) continue;
    if (excluded.has(entry.category_id)) continue;
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.amount_pence);
  }
  for (const list of data.lists) {
    if (ymOf(list.date) !== ym) continue;
    let pence = 0;
    for (const [categoryId, p] of listCategorySubtotals(list)) {
      if (excluded.has(categoryId)) continue;
      pence += p;
    }
    if (pence !== 0) byDate.set(list.date, (byDate.get(list.date) ?? 0) + pence);
  }

  let running = 0;
  return [...byDate.keys()]
    .sort()
    .map((date) => {
      running += byDate.get(date) ?? 0;
      return { date, cumulativePence: running };
    });
}
