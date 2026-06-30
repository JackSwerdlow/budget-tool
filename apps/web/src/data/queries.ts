import type { BudgetList, Category, Entry, Group, LedgerData, SalaryConfig } from '@budget/core';
import { computeSalaryYTD, resolveEmploymentStart, type YTDConfigRow } from '@budget/core';
import type { SqlExecutor } from './executor';
import type { DataPort } from './port';

export type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

type SalaryConfigRow = Omit<SalaryConfig, 'sl_enabled'> & { sl_enabled: number; bonus_pence: number; extra_payment_pence: number };
const rowToConfig = (row: SalaryConfigRow): SalaryConfig => ({ ...row, sl_enabled: row.sl_enabled === 1 });

// Builds the SQL DataPort. Reads + simple writes run through `exec` (SQL plugin in
// production, node:sqlite in tests). Multi-statement transactional writes delegate to
// `invoke` (Rust commands) since the plugin's pooled connection can't safely span calls.
export function makeSqlPort(exec: SqlExecutor, invoke: InvokeFn): DataPort {
  const getEntry = async (id: number) =>
    (await exec.select<Entry>('SELECT id, amount_pence, category_id, date, note, created_at FROM entries WHERE id = $1', [id]))[0];

  const getCategory = async (id: number) =>
    (await exec.select<Category>('SELECT id, name, group_id, sort_order, color, exclude_from_discretionary FROM categories WHERE id = $1', [id]))[0];

  const getGroup = async (id: number) =>
    (await exec.select<Group>('SELECT id, name, sort_order, color FROM groups WHERE id = $1', [id]))[0];

  const categoryUsage = async (id: number): Promise<number> => {
    const q = async (sql: string) => (await exec.select<{ n: number }>(sql, [id]))[0].n;
    return (
      (await q('SELECT COUNT(*) AS n FROM entries WHERE category_id = $1')) +
      (await q('SELECT COUNT(*) AS n FROM list_items WHERE category_id = $1')) +
      (await q('SELECT COUNT(*) AS n FROM lists WHERE delivery_category_id = $1'))
    );
  };

  // All saved configs' YTD-relevant columns, ascending — fed to the core walk so an inherited
  // prior-year salary is resolved for every month from the anchor.
  const getAllYTDConfigRows = () =>
    exec.select<YTDConfigRow>(
      `SELECT year, month, gross_yearly_pence, bonus_pence, employee_pension_pct, employer_pension_pct,
              ni_lower_monthly_pence, ni_upper_monthly_pence, ni_primary_pct, ni_upper_pct,
              sl_enabled, sl_threshold_yearly_pence, sl_rate_pct
       FROM salary_config ORDER BY year ASC, month ASC`,
    );

  const port: DataPort = {
    async fetchBootstrap() {
      const groups = await exec.select<Group>('SELECT id, name, sort_order, color FROM groups ORDER BY sort_order, id');
      const categories = await exec.select<Category>(
        'SELECT id, name, group_id, sort_order, color, exclude_from_discretionary FROM categories ORDER BY sort_order, id',
      );
      const entries = await exec.select<Entry>(
        'SELECT id, amount_pence, category_id, date, note, created_at FROM entries ORDER BY date, created_at, id',
      );
      const baseLists = await exec.select<Omit<BudgetList, 'items'>>(
        `SELECT id, date, note, delivery_fee_pence, delivery_share_pct, delivery_category_id, created_at
         FROM lists ORDER BY date, created_at, id`,
      );
      const lists: BudgetList[] = [];
      for (const l of baseLists) {
        const items = await exec.select(
          `SELECT id, list_id, name, price_pence, quantity, share_pct, category_id, sort_order
           FROM list_items WHERE list_id = $1 ORDER BY sort_order, id`,
          [l.id],
        );
        lists.push({ ...l, items } as BudgetList);
      }
      const income = await exec.select('SELECT year, month, amount_pence FROM monthly_income ORDER BY year, month');
      const def = await exec.select<{ value: string }>("SELECT value FROM settings WHERE key = 'default_income_pence'");
      let defaultIncomePence: number | null = null;
      if (def[0]) {
        const n = Number(def[0].value);
        defaultIncomePence = Number.isSafeInteger(n) ? n : null;
      }
      return { groups, categories, entries, lists, income, defaultIncomePence } as LedgerData;
    },

    async createEntry(input) {
      const createdAt = new Date().toISOString();
      const r = await exec.execute(
        'INSERT INTO entries (amount_pence, category_id, date, note, created_at) VALUES ($1, $2, $3, $4, $5)',
        [input.amount_pence, input.category_id, input.date, input.note, createdAt],
      );
      return (await getEntry(r.lastInsertId))!;
    },

    async updateEntry(id, patch) {
      const ex = await getEntry(id);
      if (!ex) throw new Error(`entry ${id} not found`);
      await exec.execute('UPDATE entries SET amount_pence = $1, category_id = $2, date = $3, note = $4 WHERE id = $5', [
        patch.amount_pence ?? ex.amount_pence,
        patch.category_id ?? ex.category_id,
        patch.date ?? ex.date,
        patch.note !== undefined ? patch.note : ex.note,
        id,
      ]);
      return (await getEntry(id))!;
    },

    async deleteEntry(id) {
      await exec.execute('DELETE FROM entries WHERE id = $1', [id]);
    },

    async createList(input) {
      // Transactional (list + N items) → Rust. createdAt passed for parity with the HTTP path.
      const createdAt = new Date().toISOString();
      return (await invoke('create_list', { input, createdAt })) as BudgetList;
    },

    async updateList(id, input) {
      // Transactional (update row + replace N items) → Rust. created_at is preserved.
      return (await invoke('update_list', { id, input })) as BudgetList;
    },

    async deleteList(id) {
      await exec.execute('DELETE FROM lists WHERE id = $1', [id]);
    },

    async createCategory(input) {
      const m = (await exec.select<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories'))[0].m;
      const r = await exec.execute(
        'INSERT INTO categories (name, group_id, sort_order, color, exclude_from_discretionary) VALUES ($1, $2, $3, $4, 0)',
        [input.name, input.group_id, m + 1, input.color],
      );
      return (await getCategory(r.lastInsertId))!;
    },

    async updateCategory(id, patch) {
      const ex = await getCategory(id);
      if (!ex) throw new Error(`category ${id} not found`);
      await exec.execute('UPDATE categories SET name = $1, group_id = $2, color = $3 WHERE id = $4', [
        patch.name ?? ex.name,
        patch.group_id ?? ex.group_id,
        patch.color ?? ex.color,
        id,
      ]);
      return (await getCategory(id))!;
    },

    async deleteCategory(id, reassignTo) {
      if ((await categoryUsage(id)) > 0) {
        if (reassignTo == null || reassignTo === id) return { deleted: false, inUse: true };
        // Reassign-then-delete spans 4 statements → Rust transaction.
        await invoke('delete_category', { id, reassignTo });
        return { deleted: true };
      }
      const r = await exec.execute('DELETE FROM categories WHERE id = $1', [id]);
      return { deleted: r.rowsAffected > 0 };
    },

    async createGroup(input) {
      const m = (await exec.select<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM groups'))[0].m;
      const r = await exec.execute('INSERT INTO groups (name, sort_order, color) VALUES ($1, $2, $3)', [
        input.name,
        m + 1,
        input.color,
      ]);
      return (await getGroup(r.lastInsertId))!;
    },

    async updateGroup(id, patch) {
      const ex = await getGroup(id);
      if (!ex) throw new Error(`group ${id} not found`);
      await exec.execute('UPDATE groups SET name = $1, color = $2 WHERE id = $3', [
        patch.name ?? ex.name,
        patch.color ?? ex.color,
        id,
      ]);
      return (await getGroup(id))!;
    },

    async deleteGroup(id) {
      const n = (await exec.select<{ n: number }>('SELECT COUNT(*) AS n FROM categories WHERE group_id = $1', [id]))[0].n;
      if (n > 0) return { deleted: false, nonEmpty: true };
      const r = await exec.execute('DELETE FROM groups WHERE id = $1', [id]);
      return { deleted: r.rowsAffected > 0 };
    },

    async reorderGroups(ids) {
      await invoke('reorder_groups', { ids });
      return { ok: true };
    },

    async reorderCategories(items) {
      await invoke('reorder_categories', { items });
      return { ok: true };
    },

    async setIncome(year, month, amountPence) {
      await exec.execute(
        `INSERT INTO monthly_income (year, month, amount_pence) VALUES ($1, $2, $3)
         ON CONFLICT(year, month) DO UPDATE SET amount_pence = excluded.amount_pence`,
        [year, month, amountPence],
      );
      return { year, month, amount_pence: amountPence };
    },

    async deleteIncome(year, month) {
      await exec.execute('DELETE FROM monthly_income WHERE year = $1 AND month = $2', [year, month]);
    },

    async setDefaultIncome(amountPence) {
      await exec.execute(
        `INSERT INTO settings (key, value) VALUES ('default_income_pence', $1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(amountPence)],
      );
      return { defaultIncomePence: amountPence };
    },

    async clearDefaultIncome() {
      await exec.execute("DELETE FROM settings WHERE key = 'default_income_pence'");
    },

    async getSalaryConfig(year, month) {
      const all = await exec.select<{ year: number; month: number }>(
        'SELECT year, month FROM salary_config ORDER BY year ASC, month ASC',
      );
      const employmentStart = resolveEmploymentStart(all, year, month);
      const backward = (await exec.select<SalaryConfigRow>(
        `SELECT * FROM salary_config WHERE (year < $1) OR (year = $2 AND month <= $3)
         ORDER BY year DESC, month DESC LIMIT 1`,
        [year, year, month],
      ))[0];
      if (backward) {
        const isExact = backward.year === year && backward.month === month;
        return {
          config: rowToConfig(backward),
          inheritedFrom: isExact ? null : { year: backward.year, month: backward.month },
          employmentStart,
        };
      }
      // No config at or before the month → before the first-ever config → blank.
      return { config: null, inheritedFrom: null, employmentStart: null };
    },

    async getSalaryYTD(year, month) {
      const configs = await getAllYTDConfigRows();
      const employmentStart = resolveEmploymentStart(configs, year, month);
      return computeSalaryYTD(configs, employmentStart, year, month);
    },

    async saveSalaryConfig(cfg, netMonthlyPence) {
      await exec.execute(
        `INSERT INTO salary_config (
           year, month, gross_yearly_pence, note,
           hours_per_week, work_weeks_per_year, work_days_per_week,
           employee_pension_pct, employer_pension_pct,
           personal_allowance_pence, basic_rate_band_pence, additional_rate_threshold_pence,
           basic_rate_pct, higher_rate_pct, additional_rate_pct,
           ni_lower_monthly_pence, ni_upper_monthly_pence, ni_primary_pct, ni_upper_pct,
           sl_enabled, sl_threshold_yearly_pence, sl_rate_pct,
           sl_balance_pence, sl_interest_rate_pct, bonus_pence, extra_payment_pence
         ) VALUES (
           $1,$2,$3,$4, $5,$6,$7, $8,$9, $10,$11,$12, $13,$14,$15, $16,$17,$18,$19, $20,$21,$22, $23,$24, $25,$26
         )
         ON CONFLICT(year, month) DO UPDATE SET
           gross_yearly_pence=excluded.gross_yearly_pence, note=excluded.note,
           hours_per_week=excluded.hours_per_week, work_weeks_per_year=excluded.work_weeks_per_year,
           work_days_per_week=excluded.work_days_per_week,
           employee_pension_pct=excluded.employee_pension_pct, employer_pension_pct=excluded.employer_pension_pct,
           personal_allowance_pence=excluded.personal_allowance_pence, basic_rate_band_pence=excluded.basic_rate_band_pence,
           additional_rate_threshold_pence=excluded.additional_rate_threshold_pence,
           basic_rate_pct=excluded.basic_rate_pct, higher_rate_pct=excluded.higher_rate_pct,
           additional_rate_pct=excluded.additional_rate_pct,
           ni_lower_monthly_pence=excluded.ni_lower_monthly_pence, ni_upper_monthly_pence=excluded.ni_upper_monthly_pence,
           ni_primary_pct=excluded.ni_primary_pct, ni_upper_pct=excluded.ni_upper_pct,
           sl_enabled=excluded.sl_enabled, sl_threshold_yearly_pence=excluded.sl_threshold_yearly_pence,
           sl_rate_pct=excluded.sl_rate_pct, sl_balance_pence=excluded.sl_balance_pence,
           sl_interest_rate_pct=excluded.sl_interest_rate_pct, bonus_pence=excluded.bonus_pence,
           extra_payment_pence=excluded.extra_payment_pence`,
        [
          cfg.year, cfg.month, cfg.gross_yearly_pence, cfg.note,
          cfg.hours_per_week, cfg.work_weeks_per_year, cfg.work_days_per_week,
          cfg.employee_pension_pct, cfg.employer_pension_pct,
          cfg.personal_allowance_pence, cfg.basic_rate_band_pence, cfg.additional_rate_threshold_pence,
          cfg.basic_rate_pct, cfg.higher_rate_pct, cfg.additional_rate_pct,
          cfg.ni_lower_monthly_pence, cfg.ni_upper_monthly_pence, cfg.ni_primary_pct, cfg.ni_upper_pct,
          cfg.sl_enabled ? 1 : 0, cfg.sl_threshold_yearly_pence, cfg.sl_rate_pct,
          cfg.sl_balance_pence ?? null, cfg.sl_interest_rate_pct ?? null, cfg.bonus_pence ?? 0, cfg.extra_payment_pence ?? 0,
        ],
      );

      // net_monthly_pence is computed by the web client (calcSalary) and passed in.
      await exec.execute(
        `INSERT INTO monthly_income (year, month, amount_pence) VALUES ($1, $2, $3)
         ON CONFLICT(year, month) DO UPDATE SET amount_pence = excluded.amount_pence`,
        [cfg.year, cfg.month, netMonthlyPence],
      );

      // Update default income only if this month >= current calendar month.
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1;
      if (cfg.year > curYear || (cfg.year === curYear && cfg.month >= curMonth)) {
        await exec.execute(
          `INSERT INTO settings (key, value) VALUES ('default_income_pence', $1)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [String(netMonthlyPence)],
        );
      }

      const saved = (await exec.select<SalaryConfigRow>('SELECT * FROM salary_config WHERE year = $1 AND month = $2', [cfg.year, cfg.month]))[0];
      return { config: rowToConfig(saved), inheritedFrom: null, employmentStart: null };
    },

    async deleteSalaryConfig(year, month) {
      await exec.execute('DELETE FROM salary_config WHERE year = $1 AND month = $2', [year, month]);
      await exec.execute('DELETE FROM monthly_income WHERE year = $1 AND month = $2', [year, month]);
    },

    async getAllSalaryConfigs() {
      const rows = await exec.select<SalaryConfigRow>(
        'SELECT * FROM salary_config ORDER BY year ASC, month ASC',
      );
      return rows.map(rowToConfig);
    },
  };

  return port;
}
