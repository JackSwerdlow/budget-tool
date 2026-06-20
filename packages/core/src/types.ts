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
  bonus_pence?: number;
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
  view: SalaryView; // always returned by calcSalary
};

// ── New structured view (Salary tab redesign) ───────────────────────────────
// Pence integers. Deduction figures are negative. weekly/daily/hourly are null
// where a per-period rate is meaningless (every deduction/tax row).
export type BreakdownCell = {
  forecast: number;          // yearly forecast: YTD actual + rest-of-year at current rate
  monthly: number;           // this month's actual figure (validated payslip number)
  weekly: number | null;
  daily: number | null;
  hourly: number | null;
  ytd: number | null;        // year-to-date actual (null where not tracked yet)
};

export type BreakdownLine = {
  key: string;
  label: string;
  cell: BreakdownCell;
  isDeduction: boolean;
  isNet: boolean;            // the Net Income line (accent styling)
  muted?: boolean;           // de-emphasised reference row (e.g. Allowance Used) — muted like deductions
  depth: number;             // 0 = top group, 1 = child, 2 = tax band
  children?: BreakdownLine[];
};

export type RateRow = {
  key: string;
  label: string;
  yearly: number;
  monthly: number;
  weekly: number;
  daily: number;
  hourly: number;
  pctGross: number;          // fraction, e.g. 0.726
};

export type SalaryStats = {
  incomeTaxRateGross: number;   // income tax ÷ gross income (standard effective rate)
  incomeTaxRateTaxable: number; // income tax ÷ taxable income (rate on the taxed portion)
  totalRate: number;            // all deductions ÷ gross (= 1 − net/gross)
  totalRateInclPension: number; // all deductions ÷ (gross + employer pension)
};

export type PensionRow = {
  key: string;
  label: string;
  month: number;
  yearlyForecast: number;
  allTime: number | null;    // null in Phase 1 (hidden)
};

export type SalaryView = {
  rateStrip: RateRow[];      // gross, net, netInclEmployerPension
  breakdown: BreakdownLine[];
  stats: SalaryStats;
  pension: PensionRow[];     // employer, employee, total
};

export type SalaryYTD = {
  taxYear: number;
  employmentStart: { year: number; month: number } | null;
  grossYTDPence: number;
  employeePensionYTDPence: number;
  adjustedNetYTDPence: number;
  priorAdjNetYTDPence: number;
  niYTDPence: number;
  slYTDPence: number;
  employerPensionYTDPence: number;
  bonusYTDPence: number;
};

// Already-fetched YTD totals (all positive magnitudes) fed into the view math.
export type SalaryYTDInput = {
  adjustedNetYTDPence: number;
  priorAdjNetYTDPence: number;
  grossYTDPence: number;
  employeePensionYTDPence: number;
  niYTDPence: number;
  slYTDPence: number;
  employerPensionYTDPence: number;
};

export type SalaryConfigResponse = {
  config: SalaryConfig | null;
  inheritedFrom: { year: number; month: number } | null;
  employmentStart: { year: number; month: number } | null;
};

// One calendar month in the lifetime walk. `cfg` is the resolved (inherited) config with
// its year/month set to THIS month; `isExplicit` = this month has its own saved row.
export type WalkMonth = {
  year: number;
  month: number;
  isExplicit: boolean;
  cfg: SalaryConfig;
};

// Cumulative actuals from the first recorded month through the selected month. All positive
// magnitudes (pence) except netTakeHomePence. Sourced from per-tax-year cumulative slices.
export type LifetimeTotals = {
  monthsCount: number;
  grossPence: number;
  basePayPence: number;
  bonusPence: number;
  employeePensionPence: number;
  incomeTaxPence: number;
  allowanceUsedPence: number;
  basicPence: number;
  higherPence: number;
  additionalPence: number;
  niPence: number;
  studentLoanPaidPence: number;   // Σ payroll deductions (payslip fact)
  netTakeHomePence: number;
  employerPensionPence: number;
  pensionPotPence: number;        // employer + employee
};
