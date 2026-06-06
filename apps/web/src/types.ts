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

export type Bootstrap = {
  groups: Group[];
  categories: Category[];
  entries: Entry[];
  lists: BudgetList[];
  income: MonthlyIncome[];
};
