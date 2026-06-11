import type { DatabaseSync } from 'node:sqlite';

// The API is a thin store: it returns raw rows and lets @budget/core derive every
// view client-side. /api/bootstrap ships the whole ledger in one shot.
export function getBootstrap(db: DatabaseSync) {
  const groups = db
    .prepare('SELECT id, name, sort_order, color FROM groups ORDER BY sort_order, id')
    .all();

  const categories = db
    .prepare(
      `SELECT id, name, group_id, sort_order, color, exclude_from_discretionary
       FROM categories ORDER BY sort_order, id`,
    )
    .all();

  const entries = db
    .prepare(
      `SELECT id, amount_pence, category_id, date, note, created_at
       FROM entries ORDER BY date, created_at, id`,
    )
    .all();

  const lists = db
    .prepare(
      `SELECT id, date, note, delivery_fee_pence, delivery_share_pct,
              delivery_category_id, created_at
       FROM lists ORDER BY date, created_at, id`,
    )
    .all() as Array<{ id: number }>;

  const itemStmt = db.prepare(
    `SELECT id, list_id, name, price_pence, quantity, share_pct, category_id, sort_order
     FROM list_items WHERE list_id = ? ORDER BY sort_order, id`,
  );
  const listsWithItems = lists.map((list) => ({ ...list, items: itemStmt.all(list.id) }));

  const income = db
    .prepare('SELECT year, month, amount_pence FROM monthly_income ORDER BY year, month')
    .all();

  return {
    groups,
    categories,
    entries,
    lists: listsWithItems,
    income,
    defaultIncomePence: getDefaultIncome(db),
  };
}

export type NewEntry = {
  amount_pence: number;
  category_id: number;
  date: string;
  note: string | null;
};

export function getEntry(db: DatabaseSync, id: number) {
  return db
    .prepare(
      `SELECT id, amount_pence, category_id, date, note, created_at
       FROM entries WHERE id = ?`,
    )
    .get(id);
}

export function createEntry(db: DatabaseSync, input: NewEntry) {
  const createdAt = new Date().toISOString();
  // Transaction so a read-back failure can never leave an orphan committed row.
  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO entries (amount_pence, category_id, date, note, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.amount_pence, input.category_id, input.date, input.note, createdAt);
    const entry = getEntry(db, Number(lastInsertRowid));
    db.exec('COMMIT');
    return entry;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function deleteEntry(db: DatabaseSync, id: number): { deleted: boolean } {
  const { changes } = db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  return { deleted: Number(changes) > 0 };
}

export type NewListItem = {
  name: string;
  price_pence: number;
  quantity: number;
  share_pct: number;
  category_id: number;
};

export type NewList = {
  date: string;
  note: string | null;
  delivery_fee_pence: number;
  delivery_share_pct: number;
  delivery_category_id: number;
  items: NewListItem[];
};

export function getList(db: DatabaseSync, id: number) {
  const list = db
    .prepare(
      `SELECT id, date, note, delivery_fee_pence, delivery_share_pct, delivery_category_id, created_at
       FROM lists WHERE id = ?`,
    )
    .get(id);
  if (!list) return undefined;
  const items = db
    .prepare(
      `SELECT id, list_id, name, price_pence, quantity, share_pct, category_id, sort_order
       FROM list_items WHERE list_id = ? ORDER BY sort_order, id`,
    )
    .all(id);
  return { ...list, items };
}

function insertItems(db: DatabaseSync, listId: number, items: NewListItem[]): void {
  const stmt = db.prepare(
    `INSERT INTO list_items (list_id, name, price_pence, quantity, share_pct, category_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  items.forEach((it, index) => {
    stmt.run(listId, it.name, it.price_pence, it.quantity, it.share_pct, it.category_id, index + 1);
  });
}

export function createList(db: DatabaseSync, input: NewList) {
  const createdAt = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO lists (date, note, delivery_fee_pence, delivery_share_pct, delivery_category_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.date,
        input.note,
        input.delivery_fee_pence,
        input.delivery_share_pct,
        input.delivery_category_id,
        createdAt,
      );
    const id = Number(lastInsertRowid);
    insertItems(db, id, input.items);
    db.exec('COMMIT');
    return getList(db, id);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function updateList(db: DatabaseSync, id: number, input: NewList) {
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE lists SET date = ?, note = ?, delivery_fee_pence = ?, delivery_share_pct = ?, delivery_category_id = ?
       WHERE id = ?`,
    ).run(
      input.date,
      input.note,
      input.delivery_fee_pence,
      input.delivery_share_pct,
      input.delivery_category_id,
      id,
    );
    db.prepare('DELETE FROM list_items WHERE list_id = ?').run(id);
    insertItems(db, id, input.items);
    db.exec('COMMIT');
    return getList(db, id);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function deleteList(db: DatabaseSync, id: number): { deleted: boolean } {
  const { changes } = db.prepare('DELETE FROM lists WHERE id = ?').run(id);
  return { deleted: Number(changes) > 0 };
}

// ── Manage: edit entries ─────────────────────────────────────────────────────
type EntryRow = { amount_pence: number; category_id: number; date: string; note: string | null };
export type EntryPatch = Partial<EntryRow>;

export function updateEntry(db: DatabaseSync, id: number, patch: EntryPatch) {
  const existing = getEntry(db, id) as EntryRow | undefined;
  if (!existing) return undefined;
  const amount = patch.amount_pence ?? existing.amount_pence;
  const categoryId = patch.category_id ?? existing.category_id;
  const date = patch.date ?? existing.date;
  const note = patch.note !== undefined ? patch.note : existing.note;
  db.prepare('UPDATE entries SET amount_pence = ?, category_id = ?, date = ?, note = ? WHERE id = ?').run(
    amount,
    categoryId,
    date,
    note,
    id,
  );
  return getEntry(db, id);
}

// ── Manage: taxonomy ─────────────────────────────────────────────────────────
type CategoryRow = { id: number; name: string; group_id: number; color: string };
type GroupRow = { id: number; name: string; color: string };

export function getCategory(db: DatabaseSync, id: number) {
  return db
    .prepare('SELECT id, name, group_id, sort_order, color, exclude_from_discretionary FROM categories WHERE id = ?')
    .get(id);
}

export function createCategory(db: DatabaseSync, input: { name: string; group_id: number; color: string }) {
  const { m } = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get() as { m: number };
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO categories (name, group_id, sort_order, color, exclude_from_discretionary) VALUES (?, ?, ?, ?, 0)',
    )
    .run(input.name, input.group_id, m + 1, input.color);
  return getCategory(db, Number(lastInsertRowid));
}

export function updateCategory(
  db: DatabaseSync,
  id: number,
  patch: { name?: string; group_id?: number; color?: string },
) {
  const existing = getCategory(db, id) as CategoryRow | undefined;
  if (!existing) return undefined;
  db.prepare('UPDATE categories SET name = ?, group_id = ?, color = ? WHERE id = ?').run(
    patch.name ?? existing.name,
    patch.group_id ?? existing.group_id,
    patch.color ?? existing.color,
    id,
  );
  return getCategory(db, id);
}

export function categoryUsage(db: DatabaseSync, id: number): number {
  const q = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
  return (
    q('SELECT COUNT(*) AS n FROM entries WHERE category_id = ?') +
    q('SELECT COUNT(*) AS n FROM list_items WHERE category_id = ?') +
    q('SELECT COUNT(*) AS n FROM lists WHERE delivery_category_id = ?')
  );
}

// Reassign all three references then delete — in one transaction (PLAN §3/§6.6).
export function deleteCategory(
  db: DatabaseSync,
  id: number,
  reassignTo: number | null,
): { deleted: boolean; inUse?: boolean } {
  if (categoryUsage(db, id) > 0) {
    if (reassignTo == null || reassignTo === id) return { deleted: false, inUse: true };
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE entries SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
      db.prepare('UPDATE list_items SET category_id = ? WHERE category_id = ?').run(reassignTo, id);
      db.prepare('UPDATE lists SET delivery_category_id = ? WHERE delivery_category_id = ?').run(reassignTo, id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { deleted: true };
  }
  const { changes } = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { deleted: Number(changes) > 0 };
}

export function getGroup(db: DatabaseSync, id: number) {
  return db.prepare('SELECT id, name, sort_order, color FROM groups WHERE id = ?').get(id);
}

export function createGroup(db: DatabaseSync, input: { name: string; color: string }) {
  const { m } = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM groups').get() as { m: number };
  const { lastInsertRowid } = db
    .prepare('INSERT INTO groups (name, sort_order, color) VALUES (?, ?, ?)')
    .run(input.name, m + 1, input.color);
  return getGroup(db, Number(lastInsertRowid));
}

export function updateGroup(db: DatabaseSync, id: number, patch: { name?: string; color?: string }) {
  const existing = getGroup(db, id) as GroupRow | undefined;
  if (!existing) return undefined;
  db.prepare('UPDATE groups SET name = ?, color = ? WHERE id = ?').run(
    patch.name ?? existing.name,
    patch.color ?? existing.color,
    id,
  );
  return getGroup(db, id);
}

export function deleteGroup(db: DatabaseSync, id: number): { deleted: boolean; nonEmpty?: boolean } {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM categories WHERE group_id = ?').get(id) as { n: number };
  if (n > 0) return { deleted: false, nonEmpty: true };
  const { changes } = db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  return { deleted: Number(changes) > 0 };
}

export function reorderGroups(db: DatabaseSync, ids: number[]) {
  const stmt = db.prepare('UPDATE groups SET sort_order = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    ids.forEach((id, i) => stmt.run(i * 10, id));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function reorderCategories(db: DatabaseSync, items: { id: number; group_id: number }[]) {
  const stmt = db.prepare('UPDATE categories SET sort_order = ?, group_id = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    items.forEach((item, i) => stmt.run(i * 10, item.group_id, item.id));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ── Manage: income ───────────────────────────────────────────────────────────
export function setIncome(db: DatabaseSync, year: number, month: number, amountPence: number) {
  db.prepare(
    `INSERT INTO monthly_income (year, month, amount_pence) VALUES (?, ?, ?)
     ON CONFLICT(year, month) DO UPDATE SET amount_pence = excluded.amount_pence`,
  ).run(year, month, amountPence);
  return { year, month, amount_pence: amountPence };
}

export function deleteIncome(db: DatabaseSync, year: number, month: number): { deleted: boolean } {
  const { changes } = db.prepare('DELETE FROM monthly_income WHERE year = ? AND month = ?').run(year, month);
  return { deleted: Number(changes) > 0 };
}

// Default monthly income — a single optional value in `settings`.
export function getDefaultIncome(db: DatabaseSync): number | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'default_income_pence'").get() as
    | { value: string }
    | undefined;
  if (!row) return null;
  const n = Number(row.value);
  return Number.isSafeInteger(n) ? n : null;
}

export function setDefaultIncome(db: DatabaseSync, amountPence: number) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('default_income_pence', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(amountPence));
  return { defaultIncomePence: amountPence };
}

export function clearDefaultIncome(db: DatabaseSync): { cleared: boolean } {
  const { changes } = db.prepare("DELETE FROM settings WHERE key = 'default_income_pence'").run();
  return { cleared: Number(changes) > 0 };
}

// ── Salary config ─────────────────────────────────────────────────────────────

type SalaryConfigRow = {
  year: number; month: number;
  gross_yearly_pence: number; note: string | null;
  hours_per_week: number; work_weeks_per_year: number; work_days_per_week: number;
  employee_pension_pct: number; employer_pension_pct: number;
  personal_allowance_pence: number; basic_rate_band_pence: number;
  additional_rate_threshold_pence: number;
  basic_rate_pct: number; higher_rate_pct: number; additional_rate_pct: number;
  ni_lower_monthly_pence: number; ni_upper_monthly_pence: number;
  ni_primary_pct: number; ni_upper_pct: number;
  sl_enabled: number; sl_threshold_yearly_pence: number; sl_rate_pct: number;
  sl_balance_pence: number | null; sl_interest_rate_pct: number | null;
};

type SalaryConfig = Omit<SalaryConfigRow, 'sl_enabled'> & { sl_enabled: boolean };
type SalaryConfigResponse = { config: SalaryConfig | null; inheritedFrom: { year: number; month: number } | null };

function rowToConfig(row: SalaryConfigRow): SalaryConfig {
  return { ...row, sl_enabled: row.sl_enabled === 1 };
}

export function getSalaryConfig(db: DatabaseSync, year: number, month: number): SalaryConfigResponse {
  const backward = db.prepare(
    `SELECT * FROM salary_config
     WHERE (year < ?) OR (year = ? AND month <= ?)
     ORDER BY year DESC, month DESC LIMIT 1`,
  ).get(year, year, month) as SalaryConfigRow | undefined;

  if (backward) {
    const isExact = backward.year === year && backward.month === month;
    return {
      config: rowToConfig(backward),
      inheritedFrom: isExact ? null : { year: backward.year, month: backward.month },
    };
  }

  const forward = db.prepare(
    `SELECT * FROM salary_config
     WHERE (year > ?) OR (year = ? AND month >= ?)
     ORDER BY year ASC, month ASC LIMIT 1`,
  ).get(year, year, month) as SalaryConfigRow | undefined;

  if (forward) {
    return {
      config: rowToConfig(forward),
      inheritedFrom: { year: forward.year, month: forward.month },
    };
  }

  return { config: null, inheritedFrom: null };
}

export function deleteSalaryConfig(db: DatabaseSync, year: number, month: number): { deleted: boolean } {
  db.prepare('DELETE FROM salary_config WHERE year = ? AND month = ?').run(year, month);
  const { changes } = db.prepare('DELETE FROM monthly_income WHERE year = ? AND month = ?').run(year, month);
  return { deleted: Number(changes) > 0 };
}

export function upsertSalaryConfig(db: DatabaseSync, cfg: SalaryConfig): SalaryConfig {
  db.prepare(
    `INSERT INTO salary_config (
       year, month, gross_yearly_pence, note,
       hours_per_week, work_weeks_per_year, work_days_per_week,
       employee_pension_pct, employer_pension_pct,
       personal_allowance_pence, basic_rate_band_pence, additional_rate_threshold_pence,
       basic_rate_pct, higher_rate_pct, additional_rate_pct,
       ni_lower_monthly_pence, ni_upper_monthly_pence, ni_primary_pct, ni_upper_pct,
       sl_enabled, sl_threshold_yearly_pence, sl_rate_pct,
       sl_balance_pence, sl_interest_rate_pct
     ) VALUES (
       ?,?,?,?,  ?,?,?,  ?,?,  ?,?,?,  ?,?,?,  ?,?,?,?,  ?,?,?,  ?,?
     )
     ON CONFLICT(year, month) DO UPDATE SET
       gross_yearly_pence=excluded.gross_yearly_pence, note=excluded.note,
       hours_per_week=excluded.hours_per_week,
       work_weeks_per_year=excluded.work_weeks_per_year,
       work_days_per_week=excluded.work_days_per_week,
       employee_pension_pct=excluded.employee_pension_pct,
       employer_pension_pct=excluded.employer_pension_pct,
       personal_allowance_pence=excluded.personal_allowance_pence,
       basic_rate_band_pence=excluded.basic_rate_band_pence,
       additional_rate_threshold_pence=excluded.additional_rate_threshold_pence,
       basic_rate_pct=excluded.basic_rate_pct, higher_rate_pct=excluded.higher_rate_pct,
       additional_rate_pct=excluded.additional_rate_pct,
       ni_lower_monthly_pence=excluded.ni_lower_monthly_pence,
       ni_upper_monthly_pence=excluded.ni_upper_monthly_pence,
       ni_primary_pct=excluded.ni_primary_pct, ni_upper_pct=excluded.ni_upper_pct,
       sl_enabled=excluded.sl_enabled,
       sl_threshold_yearly_pence=excluded.sl_threshold_yearly_pence,
       sl_rate_pct=excluded.sl_rate_pct,
       sl_balance_pence=excluded.sl_balance_pence,
       sl_interest_rate_pct=excluded.sl_interest_rate_pct`,
  ).run(
    cfg.year, cfg.month, cfg.gross_yearly_pence, cfg.note,
    cfg.hours_per_week, cfg.work_weeks_per_year, cfg.work_days_per_week,
    cfg.employee_pension_pct, cfg.employer_pension_pct,
    cfg.personal_allowance_pence, cfg.basic_rate_band_pence, cfg.additional_rate_threshold_pence,
    cfg.basic_rate_pct, cfg.higher_rate_pct, cfg.additional_rate_pct,
    cfg.ni_lower_monthly_pence, cfg.ni_upper_monthly_pence, cfg.ni_primary_pct, cfg.ni_upper_pct,
    cfg.sl_enabled ? 1 : 0, cfg.sl_threshold_yearly_pence, cfg.sl_rate_pct,
    cfg.sl_balance_pence ?? null, cfg.sl_interest_rate_pct ?? null,
  );
  const row = db.prepare('SELECT * FROM salary_config WHERE year = ? AND month = ?').get(cfg.year, cfg.month) as SalaryConfigRow;
  return rowToConfig(row);
}
