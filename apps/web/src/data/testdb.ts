// Test-only infrastructure: a node:sqlite-backed SqlExecutor so the production query
// code (queries.ts) can be exercised in Vitest without the Tauri IPC bridge. This file
// is Node-context (imports node:sqlite) and is excluded from the browser app typecheck.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { SqlExecutor } from './executor';

// node:sqlite uses positional `?`; the query code uses `$1, $2, …` (SQL plugin syntax).
const toPositional = (sql: string) => sql.replace(/\$\d+/g, '?');

export function nodeSqliteExecutor(db: DatabaseSync): SqlExecutor {
  return {
    async select<T>(sql: string, params: unknown[] = []) {
      return db.prepare(toPositional(sql)).all(...(params as never[])) as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const r = db.prepare(toPositional(sql)).run(...(params as never[]));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
  };
}

// The locked taxonomy (mirrors apps/api/src/seed.ts) used to seed test databases.
const TAXONOMY: { name: string; color: string; categories: { name: string; color: string }[] }[] = [
  { name: 'Essentials', color: '#6b7d5e', categories: [
    { name: 'Rent', color: '#3f4d36' }, { name: 'Bills', color: '#4f5e44' },
    { name: 'Groceries', color: '#6b7d5e' }, { name: 'Household', color: '#8a9a72' }, { name: 'Travel', color: '#a6b48f' },
  ] },
  { name: 'Social', color: '#b08537', categories: [
    { name: 'Food Out', color: '#8a6526' }, { name: 'Alcohol', color: '#b08537' }, { name: 'Events', color: '#caa460' },
  ] },
  { name: 'Health', color: '#4a6b6f', categories: [
    { name: 'Self-care', color: '#38565a' }, { name: 'Supplements', color: '#4a6b6f' }, { name: 'Health Appointments', color: '#6f9094' },
  ] },
  { name: 'Subscriptions', color: '#9c8a73', categories: [{ name: 'Subscriptions', color: '#9c8a73' }] },
  { name: 'Personal', color: '#8c3b2e', categories: [
    { name: 'Food In', color: '#6f2c22' }, { name: 'Nicotine', color: '#8c3b2e' }, { name: 'Purchases', color: '#b15a48' },
  ] },
];

// A fresh in-memory budget DB with the real schema + seeded taxonomy, for parity tests.
export function freshTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync('apps/api/src/db/schema.sql', 'utf8'));
  const insGroup = db.prepare('INSERT INTO groups (name, sort_order, color) VALUES (?, ?, ?)');
  const insCat = db.prepare('INSERT INTO categories (name, group_id, sort_order, color) VALUES (?, ?, ?, ?)');
  let groupOrder = 1;
  let categoryOrder = 1;
  for (const group of TAXONOMY) {
    const { lastInsertRowid } = insGroup.run(group.name, groupOrder++, group.color);
    for (const cat of group.categories) {
      insCat.run(cat.name, Number(lastInsertRowid), categoryOrder++, cat.color);
    }
  }
  return db;
}
