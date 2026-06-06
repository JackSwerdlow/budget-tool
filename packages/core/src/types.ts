// Canonical domain rows (mirror the SQLite schema, PLAN §3). The API returns these
// raw; @budget/core derives every view from them; the web imports them for typing.

export type Group = {
  id: number;
  name: string;
  sort_order: number;
  color: string;
};

export type Category = {
  id: number;
  name: string;
  group_id: number;
  sort_order: number;
  color: string;
  exclude_from_discretionary: number;
};

export type Entry = {
  id: number;
  amount_pence: number;
  category_id: number;
  date: string;
  note: string | null;
  created_at: string;
};

export type ListItem = {
  id: number;
  list_id: number;
  name: string;
  price_pence: number;
  quantity: number;
  share_pct: number;
  category_id: number;
  sort_order: number;
};

export type BudgetList = {
  id: number;
  date: string;
  note: string | null;
  delivery_fee_pence: number;
  delivery_share_pct: number;
  delivery_category_id: number;
  created_at: string;
  items: ListItem[];
};

export type MonthlyIncome = {
  year: number;
  month: number;
  amount_pence: number;
};

// The whole ledger, as returned by GET /api/bootstrap.
export type LedgerData = {
  groups: Group[];
  categories: Category[];
  entries: Entry[];
  lists: BudgetList[];
  income: MonthlyIncome[];
  // Optional default monthly income: fills the current and future months that have no
  // explicit figure (never a past one). null when no default is set.
  defaultIncomePence: number | null;
};
