-- Budget Tool schema (PLAN §3). All money columns are INTEGER PENCE.
-- Open every connection with `PRAGMA foreign_keys = ON`.

-- 5 groups (seeded). Editable: add / rename.
CREATE TABLE IF NOT EXISTS groups (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  color      TEXT NOT NULL
);

-- 15 categories (seeded). Editable: add / rename / move group / delete (with reassign).
CREATE TABLE IF NOT EXISTS categories (
  id                         INTEGER PRIMARY KEY,
  name                       TEXT NOT NULL,
  group_id                   INTEGER NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  sort_order                 INTEGER NOT NULL,
  color                      TEXT NOT NULL,
  exclude_from_discretionary INTEGER NOT NULL DEFAULT 0
);

-- Normal single entries (NOT list-derived; lists are never written here).
CREATE TABLE IF NOT EXISTS entries (
  id           INTEGER PRIMARY KEY,
  amount_pence INTEGER NOT NULL,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  date         TEXT NOT NULL,
  note         TEXT,
  created_at   TEXT NOT NULL
);

-- Itemised grocery lists (the receipt). Delivery/bag fee lives here (default 0, hidden).
CREATE TABLE IF NOT EXISTS lists (
  id                   INTEGER PRIMARY KEY,
  date                 TEXT NOT NULL,
  note                 TEXT,
  delivery_fee_pence   INTEGER NOT NULL DEFAULT 0,
  delivery_share_pct   INTEGER NOT NULL DEFAULT 0,
  delivery_category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  created_at           TEXT NOT NULL
);

-- Item rows under a list (the source of truth; kept off the main overview).
CREATE TABLE IF NOT EXISTS list_items (
  id          INTEGER PRIMARY KEY,
  list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price_pence INTEGER NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  share_pct   INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  sort_order  INTEGER NOT NULL
);

-- Light income: one figure per calendar month (varies month to month).
CREATE TABLE IF NOT EXISTS monthly_income (
  year         INTEGER NOT NULL,
  month        INTEGER NOT NULL,
  amount_pence INTEGER NOT NULL,
  PRIMARY KEY (year, month)
);

-- Key/value app settings. Currently holds only 'default_income_pence' (optional): the
-- fallback income for the current and future months that have no explicit figure.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_date       ON entries(date);
CREATE INDEX IF NOT EXISTS idx_entries_category   ON entries(category_id);
CREATE INDEX IF NOT EXISTS idx_lists_date         ON lists(date);
CREATE INDEX IF NOT EXISTS idx_list_items_list    ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_category ON list_items(category_id);

-- Salary configuration per calendar month.
-- Stores all parameters needed for the UK salary breakdown.
-- Missing months inherit from the nearest saved config (backward then forward).
CREATE TABLE IF NOT EXISTS salary_config (
  year                             INTEGER NOT NULL,
  month                            INTEGER NOT NULL,
  gross_yearly_pence               INTEGER NOT NULL,
  note                             TEXT,
  hours_per_week                   REAL    NOT NULL,
  work_weeks_per_year              REAL    NOT NULL,
  work_days_per_week               REAL    NOT NULL,
  employee_pension_pct             REAL    NOT NULL,
  employer_pension_pct             REAL    NOT NULL,
  personal_allowance_pence         INTEGER NOT NULL,
  basic_rate_band_pence            INTEGER NOT NULL,
  additional_rate_threshold_pence  INTEGER NOT NULL,
  basic_rate_pct                   REAL    NOT NULL,
  higher_rate_pct                  REAL    NOT NULL,
  additional_rate_pct              REAL    NOT NULL,
  ni_lower_monthly_pence           INTEGER NOT NULL,
  ni_upper_monthly_pence           INTEGER NOT NULL,
  ni_primary_pct                   REAL    NOT NULL,
  ni_upper_pct                     REAL    NOT NULL,
  sl_enabled                       INTEGER NOT NULL DEFAULT 0,
  sl_threshold_yearly_pence        INTEGER NOT NULL DEFAULT 2847000,
  sl_rate_pct                      REAL    NOT NULL DEFAULT 9,
  sl_balance_pence                 INTEGER,
  sl_interest_rate_pct             REAL,
  bonus_pence                      INTEGER NOT NULL DEFAULT 0,
  extra_payment_pence              INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (year, month)
);

CREATE INDEX IF NOT EXISTS idx_salary_config_ym ON salary_config(year, month);
