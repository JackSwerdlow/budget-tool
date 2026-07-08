import { Hono } from 'hono';
import type { Context } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import {
  confirmRecurring,
  createCategory,
  createEntry,
  createGroup,
  createList,
  createRecurringTemplate,
  createView,
  clearDefaultIncome,
  deleteCategory,
  deleteEntry,
  deleteGroup,
  deleteIncome,
  deleteList,
  deleteRecurringTemplate,
  deleteView,
  getBootstrap,
  getGroup,
  getList,
  deleteSalaryConfig,
  getAllSalaryConfigs,
  getSalaryConfig,
  getSalaryYTD,
  setDefaultIncome,
  setIncome,
  skipRecurring,
  unskipRecurring,
  updateCategory,
  updateEntry,
  updateGroup,
  updateList,
  updateRecurringTemplate,
  updateView,
  upsertSalaryConfig,
  reorderCategories,
  reorderGroups,
  type EntryPatch,
  type NewList,
  type NewListItem,
} from './repo.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PENCE = 1_000_000_000; // £10,000,000 — a generous cap that rejects unsafe/absurd values
const MAX_QTY = 1_000_000;

const isPct = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100;
// Number.isSafeInteger (not isInteger) so an oversized value can't pass validation, get
// INSERTed, then make node:sqlite throw on read-back and 500 every /api/bootstrap.
const isPence = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_PENCE;
const isQty = (n: number) => Number.isSafeInteger(n) && n >= 1 && n <= MAX_QTY;

// Reject impossible calendar dates (e.g. 2026-02-30) that would create phantom month
// buckets. Date.UTC is round-trip only here — month bucketing stays a string slice.
function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asListInput(body: Record<string, unknown>): NewList | null {
  const date = String(body.date ?? '');
  if (!isValidDate(date)) return null;

  const fee = Number(body.delivery_fee_pence ?? 0);
  const deliveryPct = Number(body.delivery_share_pct ?? 0);
  const deliveryCat = Number(body.delivery_category_id);
  if (!isPence(fee) || !isPct(deliveryPct) || !Number.isInteger(deliveryCat)) {
    return null;
  }
  if (!Array.isArray(body.items)) return null;

  const items: NewListItem[] = [];
  for (const raw of body.items) {
    if (typeof raw !== 'object' || raw === null) return null;
    const it = raw as Record<string, unknown>;
    const name = String(it.name ?? '').trim();
    const price = Number(it.price_pence);
    const qty = Number(it.quantity ?? 1);
    const pct = Number(it.share_pct ?? 0);
    const cat = Number(it.category_id);
    if (name === '' || !isPence(price) || !isQty(qty) || !isPct(pct) || !Number.isInteger(cat)) {
      return null;
    }
    items.push({ name, price_pence: price, quantity: qty, share_pct: pct, category_id: cat });
  }

  const note = body.note == null ? null : String(body.note);
  return {
    date,
    note,
    delivery_fee_pence: fee,
    delivery_share_pct: deliveryPct,
    delivery_category_id: deliveryCat,
    items,
  };
}

const isRealPct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
const isPositive = (n: number) => Number.isFinite(n) && n > 0;

export function createApp(db: DatabaseSync): Hono {
  const app = new Hono();
  const api = new Hono();

  api.get('/health', (c) => c.json({ ok: true }));
  api.get('/bootstrap', (c) => c.json(getBootstrap(db)));

  // ── Entries ──────────────────────────────────────────────────────────────
  api.post('/entries', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);

    const amount = Number(body.amount_pence);
    const categoryId = Number(body.category_id);
    const date = String(body.date ?? '');
    if (!isPence(amount) || !Number.isInteger(categoryId) || !isValidDate(date)) {
      return c.json({ error: 'invalid entry' }, 400);
    }
    const note = body.note == null ? null : String(body.note);

    try {
      return c.json(createEntry(db, { amount_pence: amount, category_id: categoryId, date, note }), 201);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.patch('/entries/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);

    const p: EntryPatch = {};
    if ('amount_pence' in body) {
      const a = Number(body.amount_pence);
      if (!isPence(a)) return c.json({ error: 'invalid amount' }, 400);
      p.amount_pence = a;
    }
    if ('category_id' in body) {
      const cat = Number(body.category_id);
      if (!Number.isInteger(cat)) return c.json({ error: 'invalid category' }, 400);
      p.category_id = cat;
    }
    if ('date' in body) {
      const d = String(body.date);
      if (!isValidDate(d)) return c.json({ error: 'invalid date' }, 400);
      p.date = d;
    }
    if ('note' in body) p.note = body.note == null ? null : String(body.note);

    try {
      const updated = updateEntry(db, id, p);
      if (!updated) return c.json({ error: 'not found' }, 404);
      return c.json(updated);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/entries/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    return c.json(deleteEntry(db, id));
  });

  // ── Taxonomy ───────────────────────────────────────────────────────────────
  api.post('/categories', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const name = String(body.name ?? '').trim();
    const groupId = Number(body.group_id);
    if (name === '' || !Number.isInteger(groupId)) return c.json({ error: 'invalid category' }, 400);
    const group = getGroup(db, groupId) as { color: string } | undefined;
    const color = typeof body.color === 'string' ? body.color : group?.color ?? '#9a8b6e';
    try {
      return c.json(createCategory(db, { name, group_id: groupId, color }), 201);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.patch('/categories/reorder', async (c) => {
    const body = await readJson(c);
    if (!body || !Array.isArray(body.items)) return c.json({ error: 'invalid' }, 400);
    const items = (body.items as { id: unknown; group_id: unknown }[]).map((it) => ({
      id: Number(it.id),
      group_id: Number(it.group_id),
    }));
    if (items.some((it) => !Number.isInteger(it.id) || !Number.isInteger(it.group_id)))
      return c.json({ error: 'invalid items' }, 400);
    reorderCategories(db, items);
    return c.json({ ok: true });
  });

  api.patch('/categories/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const p: { name?: string; group_id?: number; color?: string } = {};
    if ('name' in body) {
      const n = String(body.name ?? '').trim();
      if (n === '') return c.json({ error: 'invalid name' }, 400);
      p.name = n;
    }
    if ('group_id' in body) {
      const g = Number(body.group_id);
      if (!Number.isInteger(g)) return c.json({ error: 'invalid group' }, 400);
      p.group_id = g;
    }
    if ('color' in body) p.color = String(body.color);
    try {
      const updated = updateCategory(db, id, p);
      if (!updated) return c.json({ error: 'not found' }, 404);
      return c.json(updated);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/categories/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const reassignQuery = c.req.query('reassignTo');
    const reassignTo = reassignQuery ? Number(reassignQuery) : null;
    try {
      // 200 with { deleted:false, inUse:true } when in use (the UI then prompts to
      // reassign) — keeps it a normal response, not a console-noisy 4xx.
      return c.json(deleteCategory(db, id, reassignTo));
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.post('/groups', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const name = String(body.name ?? '').trim();
    if (name === '') return c.json({ error: 'invalid group' }, 400);
    const color = typeof body.color === 'string' ? body.color : '#9a8b6e';
    return c.json(createGroup(db, { name, color }), 201);
  });

  api.patch('/groups/reorder', async (c) => {
    const body = await readJson(c);
    if (!body || !Array.isArray(body.ids)) return c.json({ error: 'invalid' }, 400);
    const ids = (body.ids as unknown[]).map(Number);
    if (ids.some((id) => !Number.isInteger(id))) return c.json({ error: 'invalid ids' }, 400);
    reorderGroups(db, ids);
    return c.json({ ok: true });
  });

  api.patch('/groups/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const p: { name?: string; color?: string } = {};
    if ('name' in body) {
      const n = String(body.name ?? '').trim();
      if (n === '') return c.json({ error: 'invalid name' }, 400);
      p.name = n;
    }
    if ('color' in body) p.color = String(body.color);
    const updated = updateGroup(db, id, p);
    if (!updated) return c.json({ error: 'not found' }, 404);
    return c.json(updated);
  });

  api.delete('/groups/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    // 200 with { deleted:false, nonEmpty:true } when it still has categories (the UI
    // surfaces the message) — a normal response, not a console-noisy 4xx.
    return c.json(deleteGroup(db, id));
  });

  api.post('/views', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const name = String(body.name ?? '').trim();
    if (name === '') return c.json({ error: 'invalid view' }, 400);
    const hiddenCategoryIds = Array.isArray(body.hidden_category_ids)
      ? (body.hidden_category_ids as unknown[]).map(Number)
      : [];
    if (hiddenCategoryIds.some((id) => !Number.isInteger(id))) {
      return c.json({ error: 'invalid hidden_category_ids' }, 400);
    }
    try {
      return c.json(createView(db, { name, hidden_category_ids: hiddenCategoryIds }), 201);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.patch('/views/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const p: { name?: string; hidden_category_ids?: number[] } = {};
    if ('name' in body) {
      const n = String(body.name ?? '').trim();
      if (n === '') return c.json({ error: 'invalid name' }, 400);
      p.name = n;
    }
    if ('hidden_category_ids' in body) {
      if (!Array.isArray(body.hidden_category_ids)) return c.json({ error: 'invalid hidden_category_ids' }, 400);
      const ids = (body.hidden_category_ids as unknown[]).map(Number);
      if (ids.some((n) => !Number.isInteger(n))) return c.json({ error: 'invalid hidden_category_ids' }, 400);
      p.hidden_category_ids = ids;
    }
    const updated = updateView(db, id, p);
    if (!updated) return c.json({ error: 'not found' }, 404);
    return c.json(updated);
  });

  api.delete('/views/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    return c.json(deleteView(db, id));
  });

  // ── Income ─────────────────────────────────────────────────────────────────
  // Default income lives at a distinct path (different segment count from
  // /income/:year/:month, so the two never collide).
  api.put('/income/default', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const amount = Number(body.amount_pence);
    if (!isPence(amount)) return c.json({ error: 'invalid amount' }, 400);
    return c.json(setDefaultIncome(db, amount));
  });

  api.delete('/income/default', (c) => c.json(clearDefaultIncome(db)));

  api.put('/income/:year/:month', async (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return c.json({ error: 'invalid month' }, 400);
    }
    const bodyJson = await readJson(c);
    if (!bodyJson) return c.json({ error: 'invalid JSON' }, 400);
    const amount = Number(bodyJson.amount_pence);
    if (!isPence(amount)) return c.json({ error: 'invalid amount' }, 400);
    return c.json(setIncome(db, year, month, amount));
  });

  api.delete('/income/:year/:month', (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month)) return c.json({ error: 'invalid month' }, 400);
    return c.json(deleteIncome(db, year, month));
  });

  // ── Itemised lists ───────────────────────────────────────────────────────
  api.post('/lists', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const input = asListInput(body);
    if (!input) return c.json({ error: 'invalid list' }, 400);
    try {
      return c.json(createList(db, input), 201);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.patch('/lists/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    if (!getList(db, id)) return c.json({ error: 'not found' }, 404);

    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const input = asListInput(body);
    if (!input) return c.json({ error: 'invalid list' }, 400);
    try {
      return c.json(updateList(db, id, input));
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/lists/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    return c.json(deleteList(db, id));
  });

  // ── Recurring templates + monthly checklist ───────────────────────────────
  const MONTH_RE = /^\d{4}-\d{2}$/;
  const isValidMonth = (s: string) => {
    if (!MONTH_RE.test(s)) return false;
    const m = Number(s.slice(5, 7));
    return m >= 1 && m <= 12;
  };

  api.post('/recurring', async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const name = String(body.name ?? '').trim();
    const categoryId = Number(body.category_id);
    const amount = Number(body.amount_pence);
    if (name === '' || !Number.isInteger(categoryId) || !isPence(amount)) {
      return c.json({ error: 'invalid recurring template' }, 400);
    }
    try {
      return c.json(createRecurringTemplate(db, { name, category_id: categoryId, amount_pence: amount }), 201);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.patch('/recurring/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const p: { name?: string; category_id?: number; amount_pence?: number } = {};
    if ('name' in body) {
      const n = String(body.name ?? '').trim();
      if (n === '') return c.json({ error: 'invalid name' }, 400);
      p.name = n;
    }
    if ('category_id' in body) {
      const cat = Number(body.category_id);
      if (!Number.isInteger(cat)) return c.json({ error: 'invalid category' }, 400);
      p.category_id = cat;
    }
    if ('amount_pence' in body) {
      const a = Number(body.amount_pence);
      if (!isPence(a)) return c.json({ error: 'invalid amount' }, 400);
      p.amount_pence = a;
    }
    try {
      const updated = updateRecurringTemplate(db, id, p);
      if (!updated) return c.json({ error: 'not found' }, 404);
      return c.json(updated);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/recurring/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    return c.json(deleteRecurringTemplate(db, id));
  });

  api.post('/recurring/:id/confirm', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);
    const amount = Number(body.amount_pence);
    const date = String(body.date ?? '');
    if (!isPence(amount) || !isValidDate(date)) return c.json({ error: 'invalid confirmation' }, 400);
    const note = body.note == null ? null : String(body.note);
    try {
      const entry = confirmRecurring(db, id, { amount_pence: amount, date, note });
      if (!entry) return c.json({ error: 'not found' }, 404);
      return c.json(entry, 201);
    } catch (err) {
      return c.json({ error: String(err) }, 409);
    }
  });

  api.put('/recurring/:id/skip/:month', (c) => {
    const id = Number(c.req.param('id'));
    const month = c.req.param('month');
    if (!Number.isInteger(id) || !isValidMonth(month)) return c.json({ error: 'invalid skip' }, 400);
    try {
      return c.json(skipRecurring(db, id, month));
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  api.delete('/recurring/:id/skip/:month', (c) => {
    const id = Number(c.req.param('id'));
    const month = c.req.param('month');
    if (!Number.isInteger(id) || !isValidMonth(month)) return c.json({ error: 'invalid skip' }, 400);
    return c.json(unskipRecurring(db, id, month));
  });

  // ── Salary config ───────────────────────────────────────────────────────────
  api.get('/salary-configs', (c) => c.json(getAllSalaryConfigs(db)));

  api.get('/salary-ytd/:year/:month', (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return c.json({ error: 'invalid month' }, 400);
    }
    return c.json(getSalaryYTD(db, year, month));
  });

  api.get('/salary-config/:year/:month', (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return c.json({ error: 'invalid month' }, 400);
    }
    return c.json(getSalaryConfig(db, year, month));
  });

  api.put('/salary-config/:year/:month', async (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return c.json({ error: 'invalid month' }, 400);
    }
    const body = await readJson(c);
    if (!body) return c.json({ error: 'invalid JSON' }, 400);

    const gross = Number(body.gross_yearly_pence);
    const netMonthlyPence = Number(body.net_monthly_pence);
    const hoursPerWeek = Number(body.hours_per_week);
    const workWeeks = Number(body.work_weeks_per_year);
    const workDays = Number(body.work_days_per_week);
    const empPct = Number(body.employee_pension_pct);
    const erPct = Number(body.employer_pension_pct);
    const personalAllowance = Number(body.personal_allowance_pence);
    const basicBand = Number(body.basic_rate_band_pence);
    const addThreshold = Number(body.additional_rate_threshold_pence);
    const basicRate = Number(body.basic_rate_pct);
    const higherRate = Number(body.higher_rate_pct);
    const additionalRate = Number(body.additional_rate_pct);
    const niLower = Number(body.ni_lower_monthly_pence);
    const niUpper = Number(body.ni_upper_monthly_pence);
    const niPrimary = Number(body.ni_primary_pct);
    const niUpperRate = Number(body.ni_upper_pct);
    const slThreshold = Number(body.sl_threshold_yearly_pence);
    const slRate = Number(body.sl_rate_pct);

    if (
      !isPence(gross) || gross === 0 ||
      !isPence(netMonthlyPence) || netMonthlyPence === 0 ||
      !isPositive(hoursPerWeek) || !isPositive(workWeeks) || !isPositive(workDays) ||
      !isRealPct(empPct) || !isRealPct(erPct) ||
      !isPence(personalAllowance) || !isPence(basicBand) || !isPence(addThreshold) ||
      !isRealPct(basicRate) || !isRealPct(higherRate) || !isRealPct(additionalRate) ||
      !isPence(niLower) || !isPence(niUpper) ||
      !isRealPct(niPrimary) || !isRealPct(niUpperRate) ||
      !isPence(slThreshold) || !isRealPct(slRate)
    ) {
      return c.json({ error: 'invalid salary config' }, 400);
    }

    const slBalance = body.sl_balance_pence == null ? null : Number(body.sl_balance_pence);
    const slInterest = body.sl_interest_rate_pct == null ? null : Number(body.sl_interest_rate_pct);
    if (slBalance !== null && !isPence(slBalance)) return c.json({ error: 'invalid sl_balance_pence' }, 400);
    if (slInterest !== null && !isRealPct(slInterest)) return c.json({ error: 'invalid sl_interest_rate_pct' }, 400);

    const slVirMax = body.sl_vir_max_rate_pct == null ? null : Number(body.sl_vir_max_rate_pct);
    const slVirLower = body.sl_vir_lower_income_pence == null ? null : Number(body.sl_vir_lower_income_pence);
    const slVirUpper = body.sl_vir_upper_income_pence == null ? null : Number(body.sl_vir_upper_income_pence);
    if (slVirMax !== null && !isRealPct(slVirMax)) return c.json({ error: 'invalid sl_vir_max_rate_pct' }, 400);
    if (slVirLower !== null && !isPence(slVirLower)) return c.json({ error: 'invalid sl_vir_lower_income_pence' }, 400);
    if (slVirUpper !== null && !isPence(slVirUpper)) return c.json({ error: 'invalid sl_vir_upper_income_pence' }, 400);

    const cfg = {
      year, month,
      gross_yearly_pence: gross,
      note: body.note == null ? null : String(body.note),
      hours_per_week: hoursPerWeek, work_weeks_per_year: workWeeks, work_days_per_week: workDays,
      employee_pension_pct: empPct, employer_pension_pct: erPct,
      personal_allowance_pence: personalAllowance, basic_rate_band_pence: basicBand,
      additional_rate_threshold_pence: addThreshold,
      basic_rate_pct: basicRate, higher_rate_pct: higherRate, additional_rate_pct: additionalRate,
      ni_lower_monthly_pence: niLower, ni_upper_monthly_pence: niUpper,
      ni_primary_pct: niPrimary, ni_upper_pct: niUpperRate,
      sl_enabled: Boolean(body.sl_enabled),
      sl_threshold_yearly_pence: slThreshold, sl_rate_pct: slRate,
      sl_balance_pence: slBalance, sl_interest_rate_pct: slInterest,
      sl_vir_enabled: Boolean(body.sl_vir_enabled),
      sl_vir_max_rate_pct: slVirMax,
      sl_vir_lower_income_pence: slVirLower, sl_vir_upper_income_pence: slVirUpper,
      bonus_pence: body.bonus_pence == null ? 0 : Number(body.bonus_pence),
      extra_payment_pence: body.extra_payment_pence == null ? 0 : Number(body.extra_payment_pence),
    };

    const saved = upsertSalaryConfig(db, cfg);

    // net_monthly_pence is computed by the web client (calcSalary) and passed in the body.
    // The API is a thin store — it does not import @budget/core for value computation.
    setIncome(db, year, month, netMonthlyPence);

    // Update default income only if this month >= current calendar month
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    if (year > curYear || (year === curYear && month >= curMonth)) {
      setDefaultIncome(db, netMonthlyPence);
    }

    return c.json({ config: saved, inheritedFrom: null });
  });

  api.delete('/salary-config/:year/:month', (c) => {
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return c.json({ error: 'invalid month' }, 400);
    }
    return c.json(deleteSalaryConfig(db, year, month));
  });

  app.route('/api', api);
  return app;
}
