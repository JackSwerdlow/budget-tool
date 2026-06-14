import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export function migrate(db: DatabaseSync): void {
  const sql = readFileSync(join(import.meta.dirname, 'db', 'schema.sql'), 'utf8');
  db.exec(sql);
  // Column additions for existing databases
  try { db.exec('ALTER TABLE salary_config ADD COLUMN bonus_pence INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
}
