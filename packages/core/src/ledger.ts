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

// One pass over entries + lists for a whole set of months (vs calling categoryTotals per
// month, which re-scans the ledger each time — the Trends range is up to 60 months).
// Every requested month gets a map (empty when nothing was spent).
export function categoryTotalsByMonth(data: LedgerData, months: readonly string[]): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  for (const m of months) out.set(m, new Map());
  const add = (ym: string, categoryId: number, pence: number) => {
    const totals = out.get(ym);
    if (!totals) return;
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + pence);
  };
  for (const entry of data.entries) add(ymOf(entry.date), entry.category_id, entry.amount_pence);
  for (const list of data.lists) {
    if (!out.has(ymOf(list.date))) continue;
    for (const [categoryId, pence] of listCategorySubtotals(list)) add(ymOf(list.date), categoryId, pence);
  }
  return out;
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
export type CumulativeByGroupPoint = { date: string; cumulativeByGroup: Map<number, number> };

// runningCumulative split by group: one point per spend date (sorted), each carrying the
// running total per group id so far. A point's parts always sum exactly to the total running
// cumulative at that date — parts are integer pence summed, never re-rounded (Invariant 1).
export function runningCumulativeByGroup(
  data: LedgerData,
  ym: string,
  options: TotalOptions = {},
): CumulativeByGroupPoint[] {
  const excluded = options.excludedCategoryIds ?? EMPTY_SET;
  const groupOfCategory = new Map<number, number>();
  for (const category of data.categories) groupOfCategory.set(category.id, category.group_id);

  const byDate = new Map<string, Map<number, number>>();
  const add = (date: string, categoryId: number, pence: number) => {
    if (excluded.has(categoryId) || pence === 0) return;
    const groupId = groupOfCategory.get(categoryId);
    if (groupId === undefined) return;
    let day = byDate.get(date);
    if (!day) byDate.set(date, (day = new Map()));
    day.set(groupId, (day.get(groupId) ?? 0) + pence);
  };
  for (const entry of data.entries) {
    if (ymOf(entry.date) === ym) add(entry.date, entry.category_id, entry.amount_pence);
  }
  for (const list of data.lists) {
    if (ymOf(list.date) !== ym) continue;
    for (const [categoryId, pence] of listCategorySubtotals(list)) add(list.date, categoryId, pence);
  }

  const running = new Map<number, number>();
  return [...byDate.keys()].sort().map((date) => {
    for (const [groupId, pence] of byDate.get(date)!) {
      running.set(groupId, (running.get(groupId) ?? 0) + pence);
    }
    return { date, cumulativeByGroup: new Map(running) };
  });
}

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
