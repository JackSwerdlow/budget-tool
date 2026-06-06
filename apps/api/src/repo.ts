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

  return { groups, categories, entries, lists: listsWithItems, income };
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
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO entries (amount_pence, category_id, date, note, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.amount_pence, input.category_id, input.date, input.note, createdAt);
  return getEntry(db, Number(lastInsertRowid));
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
