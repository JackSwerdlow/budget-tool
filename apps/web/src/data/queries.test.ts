import { test, expect } from 'vitest';
import type { SalaryConfig } from '@budget/core';
import { freshTestDb, nodeSqliteExecutor } from './testdb';
import { makeSqlPort } from './queries';

function freshPort() {
  const db = freshTestDb();
  const invoke = async () => { throw new Error('transactional op not available in node test'); };
  return { port: makeSqlPort(nodeSqliteExecutor(db), invoke), db };
}

const catId = async (port: ReturnType<typeof freshPort>['port'], name: string) =>
  (await port.fetchBootstrap()).categories.find((c) => c.name === name)!.id;

test('bootstrap: seeded taxonomy, empty ledger', async () => {
  const { port } = freshPort();
  const boot = await port.fetchBootstrap();
  expect(boot.groups).toHaveLength(5);
  expect(boot.categories).toHaveLength(15);
  expect(boot.entries).toEqual([]);
  expect(boot.lists).toEqual([]);
  expect(boot.income).toEqual([]);
  expect(boot.defaultIncomePence).toBeNull();
  expect(boot.categories.find((c) => c.name === 'Rent')!.exclude_from_discretionary).toBe(1);
});

test('createEntry then bootstrap reflects it', async () => {
  const { port } = freshPort();
  const e = await port.createEntry({ amount_pence: 1234, category_id: await catId(port, 'Groceries'), date: '2026-01-15', note: null });
  expect(e.amount_pence).toBe(1234);
  expect(e.id).toBeGreaterThan(0);
  const boot = await port.fetchBootstrap();
  expect(boot.entries).toHaveLength(1);
  expect(boot.entries[0].amount_pence).toBe(1234);
});

test('updateEntry patches only provided fields', async () => {
  const { port } = freshPort();
  const e = await port.createEntry({ amount_pence: 500, category_id: await catId(port, 'Bills'), date: '2026-02-01', note: 'x' });
  const u = await port.updateEntry(e.id, { amount_pence: 700 });
  expect(u.amount_pence).toBe(700);
  expect(u.note).toBe('x');
  expect(u.date).toBe('2026-02-01');
});

test('deleteEntry removes it', async () => {
  const { port } = freshPort();
  const e = await port.createEntry({ amount_pence: 100, category_id: await catId(port, 'Travel'), date: '2026-03-01', note: null });
  await port.deleteEntry(e.id);
  expect((await port.fetchBootstrap()).entries).toEqual([]);
});

test('deleteList removes a list and its items (cascade)', async () => {
  const { port, db } = freshPort();
  const cat = await catId(port, 'Groceries');
  db.prepare('INSERT INTO lists (id, date, note, delivery_fee_pence, delivery_share_pct, delivery_category_id, created_at) VALUES (1, ?, NULL, 0, 0, ?, ?)').run('2026-01-01', cat, '2026-01-01T00:00:00Z');
  db.prepare('INSERT INTO list_items (list_id, name, price_pence, quantity, share_pct, category_id, sort_order) VALUES (1, ?, 200, 1, 0, ?, 1)').run('Milk', cat);
  expect((await port.fetchBootstrap()).lists).toHaveLength(1);
  await port.deleteList(1);
  expect((await port.fetchBootstrap()).lists).toEqual([]);
  expect((db.prepare('SELECT COUNT(*) AS n FROM list_items').get() as { n: number }).n).toBe(0);
});

test('category create / update / delete (unused) / delete (in use)', async () => {
  const { port } = freshPort();
  const essentials = (await port.fetchBootstrap()).groups[0];
  const created = await port.createCategory({ name: 'Pets', group_id: essentials.id, color: '#123456' });
  expect(created.name).toBe('Pets');

  const updated = await port.updateCategory(created.id, { name: 'Pets & Vet' });
  expect(updated.name).toBe('Pets & Vet');

  // Unused → deletes outright.
  expect(await port.deleteCategory(created.id)).toEqual({ deleted: true });

  // In use without a reassign target → refuses.
  const groceries = await catId(port, 'Groceries');
  await port.createEntry({ amount_pence: 50, category_id: groceries, date: '2026-01-01', note: null });
  expect(await port.deleteCategory(groceries)).toEqual({ deleted: false, inUse: true });
});

test('group create / update / delete (nonEmpty refuses)', async () => {
  const { port } = freshPort();
  const g = await port.createGroup({ name: 'Misc', color: '#222222' });
  expect(g.name).toBe('Misc');
  const u = await port.updateGroup(g.id, { color: '#333333' });
  expect(u.color).toBe('#333333');
  expect(await port.deleteGroup(g.id)).toEqual({ deleted: true });

  const essentials = (await port.fetchBootstrap()).groups[0];
  expect(await port.deleteGroup(essentials.id)).toEqual({ deleted: false, nonEmpty: true });
});

test('income: monthly set/delete and default set/clear', async () => {
  const { port } = freshPort();
  await port.setIncome(2026, 1, 250000);
  expect((await port.fetchBootstrap()).income).toEqual([{ year: 2026, month: 1, amount_pence: 250000 }]);
  await port.setIncome(2026, 1, 260000); // upsert
  expect((await port.fetchBootstrap()).income).toEqual([{ year: 2026, month: 1, amount_pence: 260000 }]);
  await port.deleteIncome(2026, 1);
  expect((await port.fetchBootstrap()).income).toEqual([]);

  await port.setDefaultIncome(300000);
  expect((await port.fetchBootstrap()).defaultIncomePence).toBe(300000);
  await port.clearDefaultIncome();
  expect((await port.fetchBootstrap()).defaultIncomePence).toBeNull();
});

const SALARY_CFG: SalaryConfig = {
  year: 2026, month: 6, gross_yearly_pence: 5_946_600, note: null,
  hours_per_week: 37, work_weeks_per_year: 52, work_days_per_week: 5,
  employee_pension_pct: 5.45, employer_pension_pct: 28.97,
  personal_allowance_pence: 1_257_000, basic_rate_band_pence: 3_770_100, additional_rate_threshold_pence: 12_514_000,
  basic_rate_pct: 20, higher_rate_pct: 40, additional_rate_pct: 45,
  ni_lower_monthly_pence: 104_750, ni_upper_monthly_pence: 418_917, ni_primary_pct: 8, ni_upper_pct: 2,
  sl_enabled: true, sl_threshold_yearly_pence: 2_847_000, sl_rate_pct: 9,
  sl_balance_pence: null, sl_interest_rate_pct: null, bonus_pence: 0,
};

test('salary: save writes config + income; get returns exact, inherits, falls forward', async () => {
  const { port } = freshPort();
  await port.saveSalaryConfig(SALARY_CFG, 335_995);

  const exact = await port.getSalaryConfig(2026, 6);
  expect(exact.config?.gross_yearly_pence).toBe(5_946_600);
  expect(exact.config?.sl_enabled).toBe(true);
  expect(exact.inheritedFrom).toBeNull();

  const later = await port.getSalaryConfig(2026, 8);
  expect(later.config?.gross_yearly_pence).toBe(5_946_600);
  expect(later.inheritedFrom).toEqual({ year: 2026, month: 6 });

  const earlier = await port.getSalaryConfig(2026, 3);
  expect(earlier.inheritedFrom).toEqual({ year: 2026, month: 6 });

  // Income write-through.
  expect((await port.fetchBootstrap()).income).toContainEqual({ year: 2026, month: 6, amount_pence: 335_995 });
});

test('salary: getSalaryYTD matches the core engine for the saved config', async () => {
  const { port } = freshPort();
  await port.saveSalaryConfig(SALARY_CFG, 335_995);
  const ytd = await port.getSalaryYTD(2026, 6);
  expect(ytd).toEqual({
    taxYear: 2026, employmentStart: { year: 2026, month: 6 },
    grossYTDPence: 495_550, employeePensionYTDPence: 27_008, adjustedNetYTDPence: 468_543,
    priorAdjNetYTDPence: 0, niYTDPence: 26_666, slYTDPence: 23_200,
    employerPensionYTDPence: 143_561, bonusYTDPence: 0,
  });
});

test('salary: delete removes config and its income row', async () => {
  const { port } = freshPort();
  await port.saveSalaryConfig(SALARY_CFG, 335_995);
  await port.deleteSalaryConfig(2026, 6);
  expect((await port.getSalaryConfig(2026, 6)).config).toBeNull();
  expect((await port.fetchBootstrap()).income).toEqual([]);
});

test('salary: getAllSalaryConfigs returns every saved row ascending', async () => {
  const { port } = freshPort();
  await port.saveSalaryConfig({ ...SALARY_CFG, year: 2026, month: 6 }, 335_995);
  await port.saveSalaryConfig({ ...SALARY_CFG, year: 2026, month: 4, gross_yearly_pence: 4_200_000 }, 280_000);
  const all = await port.getAllSalaryConfigs();
  expect(all.map((c) => `${c.year}-${c.month}`)).toEqual(['2026-4', '2026-6']);
  expect(all[0].gross_yearly_pence).toBe(4_200_000);
  expect(all[1].sl_enabled).toBe(true);
});
