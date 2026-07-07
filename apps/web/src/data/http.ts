import type { BudgetList, Category, Entry, Group, LedgerData, MonthlyIncome, RecurringTemplate, SalaryConfig, SalaryConfigResponse, SalaryYTD, View } from '@budget/core';
import type { ConfirmRecurringInput, DataPort, EntryPatchInput, NewEntryInput, NewListInput, NewRecurringTemplateInput } from './port';

// Resolve the API root relative to where the app is actually served, so it works at
// the origin root AND behind a sub-path reverse proxy (e.g. /proxy/8100/api/…).
const API = new URL('api/', document.baseURI).toString();

export async function fetchBootstrap(): Promise<LedgerData> {
  const res = await fetch(`${API}bootstrap`);
  if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
  return res.json() as Promise<LedgerData>;
}

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

export async function createList(input: NewListInput): Promise<BudgetList> {
  const res = await fetch(`${API}lists`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create list failed: ${res.status}`);
  return res.json() as Promise<BudgetList>;
}

export async function updateList(id: number, input: NewListInput): Promise<BudgetList> {
  const res = await fetch(`${API}lists/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`update list failed: ${res.status}`);
  return res.json() as Promise<BudgetList>;
}

export async function deleteList(id: number): Promise<void> {
  const res = await fetch(`${API}lists/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete list failed: ${res.status}`);
}

// ── Manage ───────────────────────────────────────────────────────────────────
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

export const reorderGroups = (ids: number[]) =>
  send<{ ok: boolean }>('groups/reorder', 'PATCH', { ids });

export const reorderCategories = (items: { id: number; group_id: number }[]) =>
  send<{ ok: boolean }>('categories/reorder', 'PATCH', { items });

export const createView = (input: { name: string; hidden_category_ids: number[] }) =>
  send<View>('views', 'POST', input);

export const updateView = (id: number, patch: { name?: string; hidden_category_ids?: number[] }) =>
  send<View>(`views/${id}`, 'PATCH', patch);

export const deleteView = (id: number) =>
  send<{ deleted: boolean }>(`views/${id}`, 'DELETE');

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

// ── Recurring templates + monthly checklist ──────────────────────────────────
export const createRecurringTemplate = (input: NewRecurringTemplateInput) =>
  send<RecurringTemplate>('recurring', 'POST', input);

export const updateRecurringTemplate = (id: number, patch: Partial<NewRecurringTemplateInput>) =>
  send<RecurringTemplate>(`recurring/${id}`, 'PATCH', patch);

export async function deleteRecurringTemplate(id: number): Promise<void> {
  const res = await fetch(`${API}recurring/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete recurring template failed: ${res.status}`);
}

export const confirmRecurring = (templateId: number, input: ConfirmRecurringInput) =>
  send<Entry>(`recurring/${templateId}/confirm`, 'POST', input);

export async function skipRecurring(templateId: number, month: string): Promise<void> {
  const res = await fetch(`${API}recurring/${templateId}/skip/${month}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`skip recurring failed: ${res.status}`);
}

export async function unskipRecurring(templateId: number, month: string): Promise<void> {
  const res = await fetch(`${API}recurring/${templateId}/skip/${month}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`unskip recurring failed: ${res.status}`);
}

// ── Salary config ─────────────────────────────────────────────────────────────
export async function getSalaryConfig(year: number, month: number): Promise<SalaryConfigResponse> {
  const res = await fetch(`${API}salary-config/${year}/${month}`);
  if (!res.ok) throw new Error(`getSalaryConfig failed: ${res.status}`);
  return res.json() as Promise<SalaryConfigResponse>;
}

export async function getSalaryYTD(year: number, month: number): Promise<SalaryYTD> {
  const res = await fetch(`${API}salary-ytd/${year}/${month}`);
  if (!res.ok) throw new Error(`getSalaryYTD failed: ${res.status}`);
  return res.json() as Promise<SalaryYTD>;
}

export async function saveSalaryConfig(cfg: SalaryConfig, netMonthlyPence: number): Promise<SalaryConfigResponse> {
  return send<SalaryConfigResponse>(`salary-config/${cfg.year}/${cfg.month}`, 'PUT', { ...cfg, net_monthly_pence: netMonthlyPence });
}

export async function deleteSalaryConfig(year: number, month: number): Promise<void> {
  const res = await fetch(`${API}salary-config/${year}/${month}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteSalaryConfig failed: ${res.status}`);
}

export async function getAllSalaryConfigs(): Promise<SalaryConfig[]> {
  const res = await fetch(`${API}salary-configs`);
  if (!res.ok) throw new Error(`getAllSalaryConfigs failed: ${res.status}`);
  return res.json() as Promise<SalaryConfig[]>;
}

export const httpPort: DataPort = {
  fetchBootstrap, createEntry, updateEntry, deleteEntry, createList, updateList, deleteList,
  createCategory, updateCategory, deleteCategory, createGroup, updateGroup, deleteGroup,
  reorderGroups, reorderCategories, setIncome, deleteIncome, setDefaultIncome,
  clearDefaultIncome, getSalaryConfig, getSalaryYTD, saveSalaryConfig, deleteSalaryConfig,
  getAllSalaryConfigs, createView, updateView, deleteView,
  createRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate,
  confirmRecurring, skipRecurring, unskipRecurring,
};
