import type { LedgerData } from './types';
import { monthTotal } from './ledger';
import { monthKey, ymOf } from './time';

export function income(data: LedgerData, ym: string): number {
  for (const row of data.income) {
    if (monthKey(row.year, row.month) === ym) return row.amount_pence;
  }
  return 0;
}

// Net Balance is real money, so it includes Rent (idea spec §10).
export function monthNet(data: LedgerData, ym: string): number {
  return income(data, ym) - monthTotal(data, ym);
}

// Every month with ≥1 entry/list or an income figure. A truly empty gap month is
// skipped — never counted as £0.
export function activeMonths(data: LedgerData): string[] {
  const months = new Set<string>();
  for (const entry of data.entries) months.add(ymOf(entry.date));
  for (const list of data.lists) months.add(ymOf(list.date));
  for (const row of data.income) months.add(monthKey(row.year, row.month));
  return [...months].sort();
}

export function averageNet(data: LedgerData): number {
  const months = activeMonths(data);
  if (months.length === 0) return 0;
  let sum = 0;
  for (const ym of months) sum += monthNet(data, ym);
  return Math.round(sum / months.length);
}
