import type { DatabaseSync } from 'node:sqlite';

type SeedCategory = { name: string; color: string; excludeFromDiscretionary?: boolean };
type SeedGroup = { name: string; color: string; categories: SeedCategory[] };

// Locked taxonomy (idea spec §7 / PLAN §3). Each category colour is a hand-picked
// shade of its group hue, ordered dark -> light within the group so an exploded pie
// slice and the trend matrix stay legible.
const TAXONOMY: SeedGroup[] = [
  {
    name: 'Essentials',
    color: '#6b7d5e',
    categories: [
      { name: 'Rent', color: '#3f4d36', excludeFromDiscretionary: true },
      { name: 'Bills', color: '#4f5e44' },
      { name: 'Groceries', color: '#6b7d5e' },
      { name: 'Household', color: '#8a9a72' },
      { name: 'Travel', color: '#a6b48f' },
    ],
  },
  {
    name: 'Social',
    color: '#b08537',
    categories: [
      { name: 'Food Out', color: '#8a6526' },
      { name: 'Alcohol', color: '#b08537' },
      { name: 'Events', color: '#caa460' },
    ],
  },
  {
    name: 'Health',
    color: '#4a6b6f',
    categories: [
      { name: 'Self-care', color: '#38565a' },
      { name: 'Supplements', color: '#4a6b6f' },
      { name: 'Health Appointments', color: '#6f9094' },
    ],
  },
  {
    name: 'Subscriptions',
    color: '#9c8a73',
    categories: [{ name: 'Subscriptions', color: '#9c8a73' }],
  },
  {
    name: 'Personal',
    color: '#8c3b2e',
    categories: [
      { name: 'Food In', color: '#6f2c22' },
      { name: 'Nicotine', color: '#8c3b2e' },
      { name: 'Purchases', color: '#b15a48' },
    ],
  },
];

export function seedIfEmpty(db: DatabaseSync): void {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM groups').get() as { n: number };
  if (existing.n > 0) return;

  const insertGroup = db.prepare(
    'INSERT INTO groups (name, sort_order, color) VALUES (?, ?, ?)',
  );
  const insertCategory = db.prepare(
    `INSERT INTO categories (name, group_id, sort_order, color, exclude_from_discretionary)
     VALUES (?, ?, ?, ?, ?)`,
  );

  db.exec('BEGIN');
  try {
    let groupOrder = 1;
    let categoryOrder = 1;
    for (const group of TAXONOMY) {
      const { lastInsertRowid } = insertGroup.run(group.name, groupOrder, group.color);
      groupOrder += 1;
      const groupId = Number(lastInsertRowid);
      for (const category of group.categories) {
        insertCategory.run(
          category.name,
          groupId,
          categoryOrder,
          category.color,
          category.excludeFromDiscretionary ? 1 : 0,
        );
        categoryOrder += 1;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
