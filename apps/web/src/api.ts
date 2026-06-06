import type { BudgetList, Category, Entry, Group, LedgerData, MonthlyIncome } from '@budget/core';

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

// ── Manage ───────────────────────────────────────────────────────────────────
export type EntryPatchInput = Partial<{
  amount_pence: number;
  category_id: number;
  date: string;
  note: string | null;
}>;

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const updateEntry = (id: number, patch: EntryPatchInput) =>
  send<Entry>(`/api/entries/${id}`, 'PATCH', patch);

export const createCategory = (input: { name: string; group_id: number; color: string }) =>
  send<Category>('/api/categories', 'POST', input);

export const updateCategory = (id: number, patch: { name?: string; group_id?: number; color?: string }) =>
  send<Category>(`/api/categories/${id}`, 'PATCH', patch);

export async function deleteCategory(id: number, reassignTo?: number): Promise<{ deleted: boolean; inUse?: boolean }> {
  const url = reassignTo ? `/api/categories/${id}?reassignTo=${reassignTo}` : `/api/categories/${id}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete category failed: ${res.status}`);
  return res.json() as Promise<{ deleted: boolean; inUse?: boolean }>;
}

export const createGroup = (input: { name: string; color: string }) =>
  send<Group>('/api/groups', 'POST', input);

export const updateGroup = (id: number, patch: { name?: string; color?: string }) =>
  send<Group>(`/api/groups/${id}`, 'PATCH', patch);

export async function deleteGroup(id: number): Promise<{ deleted: boolean; nonEmpty?: boolean }> {
  const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
  if (res.status === 400) return { deleted: false, nonEmpty: true };
  if (!res.ok) throw new Error(`delete group failed: ${res.status}`);
  return res.json() as Promise<{ deleted: boolean }>;
}

export const setIncome = (year: number, month: number, amountPence: number) =>
  send<MonthlyIncome>(`/api/income/${year}/${month}`, 'PUT', { amount_pence: amountPence });

export async function deleteIncome(year: number, month: number): Promise<void> {
  const res = await fetch(`/api/income/${year}/${month}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete income failed: ${res.status}`);
}
