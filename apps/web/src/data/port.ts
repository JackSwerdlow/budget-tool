import type {
  BudgetList, Category, Entry, Group, LedgerData,
  MonthlyIncome, SalaryConfig, SalaryConfigResponse, SalaryYTD,
} from '@budget/core';

export type NewEntryInput = {
  amount_pence: number;
  category_id: number;
  date: string;
  note: string | null;
};

export type EntryPatchInput = Partial<NewEntryInput>;

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

// The single contract every transport adapter (HTTP / Tauri SQL) implements.
// Function signatures and return shapes are identical across adapters so that
// no feature/chart/Manage/Salary component changes when the transport swaps.
export interface DataPort {
  fetchBootstrap(): Promise<LedgerData>;
  createEntry(input: NewEntryInput): Promise<Entry>;
  updateEntry(id: number, patch: EntryPatchInput): Promise<Entry>;
  deleteEntry(id: number): Promise<void>;
  createList(input: NewListInput): Promise<BudgetList>;
  updateList(id: number, input: NewListInput): Promise<BudgetList>;
  deleteList(id: number): Promise<void>;
  createCategory(input: { name: string; group_id: number; color: string }): Promise<Category>;
  updateCategory(id: number, patch: { name?: string; group_id?: number; color?: string }): Promise<Category>;
  deleteCategory(id: number, reassignTo?: number): Promise<{ deleted: boolean; inUse?: boolean }>;
  createGroup(input: { name: string; color: string }): Promise<Group>;
  updateGroup(id: number, patch: { name?: string; color?: string }): Promise<Group>;
  deleteGroup(id: number): Promise<{ deleted: boolean; nonEmpty?: boolean }>;
  reorderGroups(ids: number[]): Promise<{ ok: boolean }>;
  reorderCategories(items: { id: number; group_id: number }[]): Promise<{ ok: boolean }>;
  setIncome(year: number, month: number, amountPence: number): Promise<MonthlyIncome>;
  deleteIncome(year: number, month: number): Promise<void>;
  setDefaultIncome(amountPence: number): Promise<{ defaultIncomePence: number }>;
  clearDefaultIncome(): Promise<void>;
  getSalaryConfig(year: number, month: number): Promise<SalaryConfigResponse>;
  getSalaryYTD(year: number, month: number): Promise<SalaryYTD>;
  saveSalaryConfig(cfg: SalaryConfig, netMonthlyPence: number): Promise<SalaryConfigResponse>;
  deleteSalaryConfig(year: number, month: number): Promise<void>;
  getAllSalaryConfigs(): Promise<SalaryConfig[]>;
}
