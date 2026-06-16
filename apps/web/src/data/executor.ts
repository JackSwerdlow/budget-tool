export interface SqlExecutor {
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
}

// Production executor — wraps @tauri-apps/plugin-sql. Imported lazily so the web/test
// build never pulls in the Tauri module (it is only constructed when window.isTauri).
export async function tauriExecutor(): Promise<SqlExecutor> {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  const db = await Database.load('sqlite:budget.db');
  return {
    select: <T>(sql: string, params: unknown[] = []) => db.select<T[]>(sql, params),
    execute: async (sql: string, params: unknown[] = []) => {
      const r = await db.execute(sql, params);
      return { rowsAffected: r.rowsAffected, lastInsertId: r.lastInsertId ?? 0 };
    },
  };
}
