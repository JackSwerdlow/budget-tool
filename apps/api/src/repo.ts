import { db } from './db.ts';

// The API is a thin store: it returns raw rows and lets @budget/core derive every
// view client-side. /api/bootstrap ships the whole ledger in one shot.
export function getBootstrap() {
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

  return { groups, categories, entries, lists: listsWithItems, income };
}
