import { test, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { nodeSqliteExecutor } from './testdb';

test('node executor: numbered params, select and execute', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
  const exec = nodeSqliteExecutor(db);

  const ins = await exec.execute('INSERT INTO t (name) VALUES ($1)', ['a']);
  expect(ins.lastInsertId).toBe(1);
  expect(ins.rowsAffected).toBe(1);

  const rows = await exec.select<{ id: number; name: string }>('SELECT id, name FROM t WHERE id = $1', [1]);
  expect(rows).toEqual([{ id: 1, name: 'a' }]);
});

test('node executor: null params bind correctly', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, note TEXT)');
  const exec = nodeSqliteExecutor(db);
  await exec.execute('INSERT INTO t (note) VALUES ($1)', [null]);
  const rows = await exec.select<{ note: string | null }>('SELECT note FROM t WHERE id = $1', [1]);
  expect(rows).toEqual([{ note: null }]);
});
