export interface SqlExecutor {
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
}

// Production executor — bridges to the Rust (rusqlite) data layer via Tauri commands.
// `sql_select` / `sql_execute` run arbitrary single statements against the one shared
// connection; the Rust side converts `$N` placeholders → positional and binds the params
// array in order (identical to the node:sqlite test executor), so the parity tests cover
// this exact contract. Imported lazily so the web/test build never reaches Tauri APIs.
export async function tauriExecutor(): Promise<SqlExecutor> {
  const { invoke } = await import('@tauri-apps/api/core');
  return {
    select: <T>(sql: string, params: unknown[] = []) => invoke<T[]>('sql_select', { sql, params }),
    execute: (sql: string, params: unknown[] = []) =>
      invoke<{ rowsAffected: number; lastInsertId: number }>('sql_execute', { sql, params }),
  };
}
