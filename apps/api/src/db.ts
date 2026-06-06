import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = process.env.BUDGET_DB;
if (!dbPath) throw new Error('BUDGET_DB env var is required');

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath, {
  enableForeignKeyConstraints: true,
});

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');
