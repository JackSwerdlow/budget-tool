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

export type SalaryConfig = {
  year: number;
  month: number;
  gross_yearly_pence: number;
  note: string | null;
  hours_per_week: number;
  work_weeks_per_year: number;
  work_days_per_week: number;
  employee_pension_pct: number;
  employer_pension_pct: number;
  personal_allowance_pence: number;
  basic_rate_band_pence: number;
  additional_rate_threshold_pence: number;
  basic_rate_pct: number;
  higher_rate_pct: number;
  additional_rate_pct: number;
  ni_lower_monthly_pence: number;
  ni_upper_monthly_pence: number;
  ni_primary_pct: number;
  ni_upper_pct: number;
  sl_enabled: boolean;
  sl_threshold_yearly_pence: number;
  sl_rate_pct: number;
  sl_balance_pence: number | null;
  sl_interest_rate_pct: number | null;
};

export type SalaryFigures = {
  yearly: number;
  monthly: number;
  weekly: number;
  daily: number;
  hourly: number;
};

export type SalaryRow = {
  key: string;
  label: string;
  isDeduction: boolean;
  isSummary: boolean;
  isPercentage: boolean;
  figures: SalaryFigures;
};

export type SalaryBreakdown = {
  rows: SalaryRow[];
  netMonthlyPence: number;
};

export type SalaryConfigResponse = {
  config: SalaryConfig | null;
  inheritedFrom: { year: number; month: number } | null;
};
