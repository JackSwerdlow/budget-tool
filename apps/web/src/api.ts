import type { BudgetList, Category, Entry, Group, LedgerData, MonthlyIncome } from '@budget/core';

// Resolve the API root relative to where the app is actually served, so it works at
// the origin root AND behind a sub-path reverse proxy (e.g. /proxy/8100/api/…).
const API = new URL('api/', document.baseURI).toString();

export async function fetchBootstrap(): Promise<LedgerData> {
  const res = await fetch(`${API}bootstrap`);
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
  const res = await fetch(`${API}entries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create entry failed: ${res.status}`);
  return res.json() as Promise<Entry>;
}

export async function deleteEntry(id: number): Promise<void> {
  const res = await fetch(`${API}entries/${id}`, { method: 'DELETE' });
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
  const res = await fetch(`${API}lists`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create list failed: ${res.status}`);
  return res.json() as Promise<BudgetList>;
}

export async function deleteList(id: number): Promise<void> {
  const res = await fetch(`${API}lists/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete list failed: ${res.status}`);
}

// ── Manage ───────────────────────────────────────────────────────────────────
export type EntryPatchInput = Partial<{
  amount_pence: number;
  category_id: number;
  date: string;
  note: string | null;
}>;

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const updateEntry = (id: number, patch: EntryPatchInput) =>
  send<Entry>(`entries/${id}`, 'PATCH', patch);

export const createCategory = (input: { name: string; group_id: number; color: string }) =>
  send<Category>('categories', 'POST', input);

export const updateCategory = (id: number, patch: { name?: string; group_id?: number; color?: string }) =>
  send<Category>(`categories/${id}`, 'PATCH', patch);

export async function deleteCategory(id: number, reassignTo?: number): Promise<{ deleted: boolean; inUse?: boolean }> {
  const url = reassignTo ? `${API}categories/${id}?reassignTo=${reassignTo}` : `${API}categories/${id}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete category failed: ${res.status}`);
  return res.json() as Promise<{ deleted: boolean; inUse?: boolean }>;
}

export const createGroup = (input: { name: string; color: string }) =>
  send<Group>('groups', 'POST', input);

export const updateGroup = (id: number, patch: { name?: string; color?: string }) =>
  send<Group>(`groups/${id}`, 'PATCH', patch);

export const deleteGroup = (id: number) =>
  send<{ deleted: boolean; nonEmpty?: boolean }>(`groups/${id}`, 'DELETE');

export const setIncome = (year: number, month: number, amountPence: number) =>
  send<MonthlyIncome>(`income/${year}/${month}`, 'PUT', { amount_pence: amountPence });

export async function deleteIncome(year: number, month: number): Promise<void> {
  const res = await fetch(`${API}income/${year}/${month}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete income failed: ${res.status}`);
}

export const setDefaultIncome = (amountPence: number) =>
  send<{ defaultIncomePence: number }>('income/default', 'PUT', { amount_pence: amountPence });

export async function clearDefaultIncome(): Promise<void> {
  const res = await fetch(`${API}income/default`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`clear default income failed: ${res.status}`);
}
