import type { LedgerData } from './types.ts';
import { monthTotal, type TotalOptions } from './ledger.ts';
import { monthKey, ymOf } from './time.ts';

// The explicit per-month figure, or null if no figure is recorded for that month.
// (The raw value — does NOT fall back to the default; use income() for the resolved one.)
export function monthlyIncome(data: LedgerData, ym: string): number | null {
  for (const row of data.income) {
    if (monthKey(row.year, row.month) === ym) return row.amount_pence;
  }
  return null;
}

// Resolved income for a month: an explicit figure always wins; otherwise the stored
// default fills the current month and any future month (never a past one); else £0.
export function income(data: LedgerData, ym: string, currentYm: string): number {
  const explicit = monthlyIncome(data, ym);
  if (explicit !== null) return explicit;
  if (data.defaultIncomePence != null && ym >= currentYm) return data.defaultIncomePence;
  return 0;
}

// Net Balance is real money, so it includes Rent (idea spec §10).
export function monthNet(data: LedgerData, ym: string, currentYm: string): number {
  return income(data, ym, currentYm) - monthTotal(data, ym);
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

export function averageNet(data: LedgerData, currentYm: string): number {
  const months = activeMonths(data);
  if (months.length === 0) return 0;
  let sum = 0;
  for (const ym of months) sum += monthNet(data, ym, currentYm);
  return Math.round(sum / months.length);
}

// All-time average monthly spend (mirrors averageNet's all-time scope) — respects the same
// TotalOptions filter as monthTotal, so it stays consistent with whatever's currently hidden.
export function averageSpend(data: LedgerData, options: TotalOptions = {}): number {
  const months = activeMonths(data);
  if (months.length === 0) return 0;
  let sum = 0;
  for (const ym of months) sum += monthTotal(data, ym, options);
  return Math.round(sum / months.length);
}
