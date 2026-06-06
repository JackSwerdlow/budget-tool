import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './db.ts';

export function migrate(): void {
  const sql = readFileSync(join(import.meta.dirname, 'db', 'schema.sql'), 'utf8');
  db.exec(sql);
}
