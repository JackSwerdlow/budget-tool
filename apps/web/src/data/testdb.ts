// Test-only infrastructure: a node:sqlite-backed SqlExecutor so the production query
// code (queries.ts) can be exercised in Vitest without the Tauri IPC bridge. This file
// is Node-context (imports node:sqlite) and is excluded from the browser app typecheck.
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
