import type { BudgetList, Entry, LedgerData } from '@budget/core';

export async function fetchBootstrap(): Promise<LedgerData> {
  const res = await fetch('/api/bootstrap');
  if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
  return res.json() as Promise<LedgerData>;
}

export type NewEntryInput = {
  amount_pence: number;
  category_id: number;
  date: string;
  note: string | null;
};

export async function createEntry(input: NewEntryInput): Promise<Entry> {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create entry failed: ${res.status}`);
  return res.json() as Promise<Entry>;
}

export async function deleteEntry(id: number): Promise<void> {
  const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete entry failed: ${res.status}`);
}

export type NewListItemInput = {
  name: string;
  price_pence: number;
  quantity: number;
  share_pct: number;
  category_id: number;
};

export type NewListInput = {
  date: string;
  note: string | null;
  delivery_fee_pence: number;
  delivery_share_pct: number;
  delivery_category_id: number;
  items: NewListItemInput[];
};

export async function createList(input: NewListInput): Promise<BudgetList> {
  const res = await fetch('/api/lists', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create list failed: ${res.status}`);
  return res.json() as Promise<BudgetList>;
}

export async function deleteList(id: number): Promise<void> {
  const res = await fetch(`/api/lists/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete list failed: ${res.status}`);
}
