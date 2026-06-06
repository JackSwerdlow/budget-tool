import type { Entry, LedgerData } from '@budget/core';

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
