use std::sync::Mutex;

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::{json, Map, Number, Value as Json};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_fs::{FilePath, FsExt};

// One shared connection behind a Mutex (managed state). A single-user offline app never
// needs concurrency, and one connection makes the transactional commands real transactions.
pub struct Db(pub Mutex<Connection>);

// ── schema + seed ─────────────────────────────────────────────────────────────
// Schema is single-sourced from the API package (CREATE TABLE IF NOT EXISTS → idempotent).
const SCHEMA: &str = include_str!("../../../api/src/db/schema.sql");

// Locked taxonomy (mirrors apps/api/src/seed.ts) as guarded inserts → idempotent, so first
// launch seeds and a re-run (or an imported older DB) is a safe no-op.
const SEED: &str = r#"
INSERT INTO groups (name, sort_order, color) SELECT 'Essentials', 1, '#6b7d5e' WHERE NOT EXISTS (SELECT 1 FROM groups WHERE name = 'Essentials');
INSERT INTO groups (name, sort_order, color) SELECT 'Social', 2, '#b08537' WHERE NOT EXISTS (SELECT 1 FROM groups WHERE name = 'Social');
INSERT INTO groups (name, sort_order, color) SELECT 'Health', 3, '#4a6b6f' WHERE NOT EXISTS (SELECT 1 FROM groups WHERE name = 'Health');
INSERT INTO groups (name, sort_order, color) SELECT 'Subscriptions', 4, '#9c8a73' WHERE NOT EXISTS (SELECT 1 FROM groups WHERE name = 'Subscriptions');
INSERT INTO groups (name, sort_order, color) SELECT 'Personal', 5, '#8c3b2e' WHERE NOT EXISTS (SELECT 1 FROM groups WHERE name = 'Personal');

INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Rent', (SELECT id FROM groups WHERE name='Essentials'), 1, '#3f4d36' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Rent');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Bills', (SELECT id FROM groups WHERE name='Essentials'), 2, '#4f5e44' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Bills');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Groceries', (SELECT id FROM groups WHERE name='Essentials'), 3, '#6b7d5e' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Groceries');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Household', (SELECT id FROM groups WHERE name='Essentials'), 4, '#8a9a72' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Household');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Travel', (SELECT id FROM groups WHERE name='Essentials'), 5, '#a6b48f' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Travel');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Food Out', (SELECT id FROM groups WHERE name='Social'), 6, '#8a6526' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Food Out');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Alcohol', (SELECT id FROM groups WHERE name='Social'), 7, '#b08537' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Alcohol');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Events', (SELECT id FROM groups WHERE name='Social'), 8, '#caa460' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Events');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Self-care', (SELECT id FROM groups WHERE name='Health'), 9, '#38565a' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Self-care');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Supplements', (SELECT id FROM groups WHERE name='Health'), 10, '#4a6b6f' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Supplements');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Health Appointments', (SELECT id FROM groups WHERE name='Health'), 11, '#6f9094' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Health Appointments');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Subscriptions', (SELECT id FROM groups WHERE name='Subscriptions'), 12, '#9c8a73' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Subscriptions');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Food In', (SELECT id FROM groups WHERE name='Personal'), 13, '#6f2c22' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Food In');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Nicotine', (SELECT id FROM groups WHERE name='Personal'), 14, '#8c3b2e' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Nicotine');
INSERT INTO categories (name, group_id, sort_order, color) SELECT 'Purchases', (SELECT id FROM groups WHERE name='Personal'), 15, '#b15a48' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name='Purchases');
"#;

pub fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    conn.execute_batch(SCHEMA)?;
    // Column additions for DBs created before a later schema change (CREATE TABLE IF NOT
    // EXISTS won't add columns to an existing table). Ignore the "duplicate column" error.
    // Listed in the order the columns were introduced.
    let _ = conn.execute(
        "ALTER TABLE salary_config ADD COLUMN bonus_pence INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE salary_config ADD COLUMN extra_payment_pence INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE salary_config ADD COLUMN sl_vir_enabled INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute("ALTER TABLE salary_config ADD COLUMN sl_vir_max_rate_pct REAL", []);
    let _ = conn.execute(
        "ALTER TABLE salary_config ADD COLUMN sl_vir_lower_income_pence INTEGER",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE salary_config ADD COLUMN sl_vir_upper_income_pence INTEGER",
        [],
    );
    // Column removals (vestigial exclude_from_discretionary, dead since Views shipped).
    let _ = conn.execute(
        "ALTER TABLE categories DROP COLUMN exclude_from_discretionary",
        [],
    );
    conn.execute_batch(SEED)?;
    Ok(())
}

pub fn open_at(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    migrate(&conn)?;
    Ok(conn)
}

// ── generic bridge (proven in a standalone rusqlite test before porting) ───────
// `$N` (used by the JS query layer) → positional `?`, bound in array order — identical to
// testdb.ts's toPositional, so the parity tests cover this exact contract.
fn to_positional(sql: &str) -> String {
    let mut out = String::with_capacity(sql.len());
    let mut chars = sql.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '$' && chars.peek().map_or(false, |n| n.is_ascii_digit()) {
            out.push('?');
            while chars.peek().map_or(false, |n| n.is_ascii_digit()) {
                chars.next();
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn json_to_sql(v: &Json) -> Result<SqlValue, String> {
    match v {
        Json::Null => Ok(SqlValue::Null),
        Json::Bool(b) => Ok(SqlValue::Integer(if *b { 1 } else { 0 })),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(SqlValue::Integer(i))
            } else if let Some(f) = n.as_f64() {
                Ok(SqlValue::Real(f))
            } else {
                Err("unrepresentable number".into())
            }
        }
        Json::String(s) => Ok(SqlValue::Text(s.clone())),
        _ => Err("unsupported parameter type (array/object)".into()),
    }
}

fn value_ref_to_json(v: ValueRef) -> Json {
    match v {
        ValueRef::Null => Json::Null,
        ValueRef::Integer(i) => Json::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map(Json::Number).unwrap_or(Json::Null),
        ValueRef::Text(t) => Json::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Json::String(format!("blob:{}", b.len())),
    }
}

fn select(conn: &Connection, sql: &str, params: &[Json]) -> Result<Vec<Json>, String> {
    let mut stmt = conn.prepare(&to_positional(sql)).map_err(|e| e.to_string())?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let binds: Vec<SqlValue> = params.iter().map(json_to_sql).collect::<Result<_, _>>()?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(binds.iter()), |row| {
            let mut obj = Map::new();
            for (i, name) in cols.iter().enumerate() {
                obj.insert(name.clone(), value_ref_to_json(row.get_ref(i)?));
            }
            Ok(Json::Object(obj))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn execute(conn: &Connection, sql: &str, params: &[Json]) -> Result<(usize, i64), String> {
    let binds: Vec<SqlValue> = params.iter().map(json_to_sql).collect::<Result<_, _>>()?;
    let n = conn
        .execute(&to_positional(sql), rusqlite::params_from_iter(binds.iter()))
        .map_err(|e| e.to_string())?;
    Ok((n, conn.last_insert_rowid()))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    rows_affected: usize,
    last_insert_id: i64,
}

// ── generic commands ──────────────────────────────────────────────────────────
#[tauri::command]
pub fn sql_select(state: State<Db>, sql: String, params: Vec<Json>) -> Result<Vec<Json>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    select(&conn, &sql, &params)
}

#[tauri::command]
pub fn sql_execute(state: State<Db>, sql: String, params: Vec<Json>) -> Result<ExecResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let (rows_affected, last_insert_id) = execute(&conn, &sql, &params)?;
    Ok(ExecResult { rows_affected, last_insert_id })
}

// ── transactional commands ────────────────────────────────────────────────────
#[derive(Deserialize)]
pub struct NewListItem {
    name: String,
    price_pence: i64,
    quantity: i64,
    share_pct: i64,
    category_id: i64,
}

#[derive(Deserialize)]
pub struct NewList {
    date: String,
    note: Option<String>,
    delivery_fee_pence: i64,
    delivery_share_pct: i64,
    delivery_category_id: i64,
    items: Vec<NewListItem>,
}

fn get_list_json(conn: &Connection, id: i64) -> Result<Json, String> {
    let mut lists = select(
        conn,
        "SELECT id, date, note, delivery_fee_pence, delivery_share_pct, delivery_category_id, created_at FROM lists WHERE id = $1",
        &[json!(id)],
    )?;
    let mut list = lists.pop().ok_or_else(|| "list not found after insert".to_string())?;
    let items = select(
        conn,
        "SELECT id, list_id, name, price_pence, quantity, share_pct, category_id, sort_order FROM list_items WHERE list_id = $1 ORDER BY sort_order, id",
        &[json!(id)],
    )?;
    list.as_object_mut()
        .ok_or_else(|| "list row not an object".to_string())?
        .insert("items".to_string(), Json::Array(items));
    Ok(list)
}

// Inner functions take &mut Connection so they're unit-testable without the Tauri runtime;
// the #[tauri::command] wrappers just lock the shared connection and delegate.
fn create_list_tx(conn: &mut Connection, input: &NewList, created_at: &str) -> Result<Json, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO lists (date, note, delivery_fee_pence, delivery_share_pct, delivery_category_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![input.date, input.note, input.delivery_fee_pence, input.delivery_share_pct, input.delivery_category_id, created_at],
    ).map_err(|e| e.to_string())?;
    let list_id = tx.last_insert_rowid();
    for (i, it) in input.items.iter().enumerate() {
        tx.execute(
            "INSERT INTO list_items (list_id, name, price_pence, quantity, share_pct, category_id, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![list_id, it.name, it.price_pence, it.quantity, it.share_pct, it.category_id, (i as i64) + 1],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    get_list_json(conn, list_id)
}

// Update a list in place: edit the row (created_at is left untouched) and replace its items.
fn update_list_tx(conn: &mut Connection, id: i64, input: &NewList) -> Result<Json, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // Guard against a missing id (parity with the HTTP route's 404): otherwise we'd insert
    // orphaned list_items and only fail later. Returning early rolls the tx back on drop.
    let exists: i64 = tx
        .query_row("SELECT COUNT(*) AS n FROM lists WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err("list not found".to_string());
    }
    tx.execute(
        "UPDATE lists SET date = ?1, note = ?2, delivery_fee_pence = ?3, delivery_share_pct = ?4, delivery_category_id = ?5 WHERE id = ?6",
        params![input.date, input.note, input.delivery_fee_pence, input.delivery_share_pct, input.delivery_category_id, id],
    ).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM list_items WHERE list_id = ?1", params![id]).map_err(|e| e.to_string())?;
    for (i, it) in input.items.iter().enumerate() {
        tx.execute(
            "INSERT INTO list_items (list_id, name, price_pence, quantity, share_pct, category_id, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, it.name, it.price_pence, it.quantity, it.share_pct, it.category_id, (i as i64) + 1],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    get_list_json(conn, id)
}

fn delete_category_tx(conn: &mut Connection, id: i64, reassign_to: i64) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("UPDATE entries SET category_id = ?1 WHERE category_id = ?2", params![reassign_to, id]).map_err(|e| e.to_string())?;
    tx.execute("UPDATE list_items SET category_id = ?1 WHERE category_id = ?2", params![reassign_to, id]).map_err(|e| e.to_string())?;
    tx.execute("UPDATE lists SET delivery_category_id = ?1 WHERE delivery_category_id = ?2", params![reassign_to, id]).map_err(|e| e.to_string())?;
    tx.execute("UPDATE recurring_templates SET category_id = ?1 WHERE category_id = ?2", params![reassign_to, id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM categories WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct ConfirmRecurring {
    amount_pence: i64,
    date: String,
    note: Option<String>,
}

// Entry + month row atomically. The entry's category always comes from the template row;
// a month already confirmed errors (replacing entry_id would orphan the old entry into a
// double count) — undoing a confirmation is deleting its entry (FK cascade).
fn confirm_recurring_tx(
    conn: &mut Connection,
    template_id: i64,
    input: &ConfirmRecurring,
    created_at: &str,
) -> Result<Json, String> {
    let month: String = input.date.chars().take(7).collect();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let category_id: i64 = tx
        .query_row("SELECT category_id FROM recurring_templates WHERE id = ?1", params![template_id], |r| r.get(0))
        .map_err(|_| "recurring template not found".to_string())?;
    let confirmed: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM recurring_months WHERE template_id = ?1 AND month = ?2 AND entry_id IS NOT NULL",
            params![template_id, month],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if confirmed > 0 {
        return Err("month already confirmed".to_string());
    }
    tx.execute(
        "INSERT INTO entries (amount_pence, category_id, date, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![input.amount_pence, category_id, input.date, input.note, created_at],
    )
    .map_err(|e| e.to_string())?;
    let entry_id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO recurring_months (template_id, month, entry_id) VALUES (?1, ?2, ?3)
         ON CONFLICT(template_id, month) DO UPDATE SET entry_id = excluded.entry_id",
        params![template_id, month, entry_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    let mut rows = select(
        conn,
        "SELECT id, amount_pence, category_id, date, note, created_at FROM entries WHERE id = $1",
        &[json!(entry_id)],
    )?;
    rows.pop().ok_or_else(|| "entry not found after insert".to_string())
}

fn reorder_groups_tx(conn: &mut Connection, ids: &[i64]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute("UPDATE groups SET sort_order = ?1 WHERE id = ?2", params![(i as i64) * 10, id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct ReorderCategory {
    id: i64,
    group_id: i64,
}

fn reorder_categories_tx(conn: &mut Connection, items: &[ReorderCategory]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (i, it) in items.iter().enumerate() {
        tx.execute("UPDATE categories SET sort_order = ?1, group_id = ?2 WHERE id = ?3", params![(i as i64) * 10, it.group_id, it.id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_list(state: State<Db>, input: NewList, created_at: String) -> Result<Json, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    create_list_tx(&mut conn, &input, &created_at)
}

#[tauri::command]
pub fn update_list(state: State<Db>, id: i64, input: NewList) -> Result<Json, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    update_list_tx(&mut conn, id, &input)
}

#[tauri::command]
pub fn delete_category(state: State<Db>, id: i64, reassign_to: i64) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    delete_category_tx(&mut conn, id, reassign_to)
}

#[tauri::command]
pub fn confirm_recurring(
    state: State<Db>,
    template_id: i64,
    input: ConfirmRecurring,
    created_at: String,
) -> Result<Json, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    confirm_recurring_tx(&mut conn, template_id, &input, &created_at)
}

#[tauri::command]
pub fn reorder_groups(state: State<Db>, ids: Vec<i64>) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    reorder_groups_tx(&mut conn, &ids)
}

#[tauri::command]
pub fn reorder_categories(state: State<Db>, items: Vec<ReorderCategory>) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    reorder_categories_tx(&mut conn, &items)
}

// User-chosen paths arrive as tauri_plugin_fs::FilePath: a plain path on desktop, a
// content:// URI on Android (the dialog plugin returns those; std::fs can't open them).
// app.fs() resolves both, so these commands are the same code on every platform. The
// app-config side (budget.db) is always a real filesystem path — std::fs is fine there.

// ── import ────────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn import_database<R: Runtime>(app: AppHandle<R>, state: State<Db>, src_path: FilePath) -> Result<(), String> {
    let bytes = app.fs().read(src_path).map_err(|e| e.to_string())?;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let db_path = dir.join("budget.db");
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    // Release the file handle on budget.db before overwriting it.
    *guard = Connection::open_in_memory().map_err(|e| e.to_string())?;
    std::fs::write(&db_path, bytes).map_err(|e| e.to_string())?;
    // Re-open + migrate (a user's older file may predate a later schema addition).
    let conn = open_at(&db_path).map_err(|e| e.to_string())?;
    *guard = conn;
    Ok(())
}

// ── export ────────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn export_database<R: Runtime>(app: AppHandle<R>, state: State<Db>, dest_path: FilePath) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let db_path = dir.join("budget.db");
    // Hold the lock so no write runs mid-copy; the single rollback-journal connection means
    // the on-disk file is consistent at rest, so a plain copy yields a complete database.
    let _guard = state.0.lock().map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&db_path).map_err(|e| e.to_string())?;
    write_file(&app, dest_path, &bytes)
}

// Save UI-generated text (the CSV/JSON exports) to a user-chosen path.
#[tauri::command]
pub fn save_text_file<R: Runtime>(app: AppHandle<R>, dest_path: FilePath, contents: String) -> Result<(), String> {
    write_file(&app, dest_path, contents.as_bytes())
}

fn write_file<R: Runtime>(app: &AppHandle<R>, dest: FilePath, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut opts = tauri_plugin_fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    let mut f = app.fs().open(dest, opts).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE t (id INTEGER PRIMARY KEY, pct REAL, pence INTEGER, note TEXT);").unwrap();
        c
    }

    #[test]
    fn type_fidelity_roundtrip() {
        let c = db();
        let (n, id) = execute(&c, "INSERT INTO t (pct, pence, note) VALUES ($1, $2, $3)", &[json!(5.45), json!(594660), json!(null)]).unwrap();
        assert_eq!(n, 1);
        assert_eq!(id, 1);
        let rows = select(&c, "SELECT pct, pence, note FROM t WHERE id = $1", &[json!(1)]).unwrap();
        assert_eq!(rows.len(), 1);
        let r = &rows[0];
        assert!(r["pct"].is_number());
        assert!((r["pct"].as_f64().unwrap() - 5.45).abs() < 1e-9);
        assert_eq!(r["pence"].as_i64().unwrap(), 594660);
        assert!(r["note"].is_null());
    }

    #[test]
    fn positional_conversion_matches_testdb() {
        assert_eq!(to_positional("WHERE (year < $1) OR (year = $2 AND month <= $3)"), "WHERE (year < ?) OR (year = ? AND month <= ?)");
    }

    #[test]
    fn migrate_is_idempotent_and_seeds_taxonomy() {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        migrate(&c).unwrap(); // second run must be a no-op
        let groups = select(&c, "SELECT COUNT(*) AS n FROM groups", &[]).unwrap();
        let cats = select(&c, "SELECT COUNT(*) AS n FROM categories", &[]).unwrap();
        assert_eq!(groups[0]["n"].as_i64().unwrap(), 5);
        assert_eq!(cats[0]["n"].as_i64().unwrap(), 15);
        let rent = select(&c, "SELECT color AS c FROM categories WHERE name = $1", &[json!("Rent")]).unwrap();
        assert_eq!(rent[0]["c"].as_str().unwrap(), "#3f4d36");
    }

    #[test]
    fn migrate_drops_the_vestigial_discretionary_column() {
        let c = Connection::open_in_memory().unwrap();
        // A pre-existing DB whose categories table still carries the dead column.
        c.execute_batch(
            "CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, group_id INTEGER NOT NULL, sort_order INTEGER NOT NULL, color TEXT NOT NULL, exclude_from_discretionary INTEGER NOT NULL DEFAULT 0);",
        )
        .unwrap();
        migrate(&c).unwrap();
        let cols = select(
            &c,
            "SELECT name FROM pragma_table_info('categories') WHERE name = $1",
            &[json!("exclude_from_discretionary")],
        )
        .unwrap();
        assert!(cols.is_empty());
        // Seeding into the migrated table still works.
        let cats = select(&c, "SELECT COUNT(*) AS n FROM categories", &[]).unwrap();
        assert_eq!(cats[0]["n"].as_i64().unwrap(), 15);
    }

    // A mock app with the fs plugin exercises the same write_file path production uses;
    // FilePath::Path is the desktop variant (Android's content:// variant needs a device).
    fn fs_app() -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
    }

    #[test]
    fn save_text_file_writes_the_contents() {
        let app = fs_app();
        let dest = std::env::temp_dir().join("budget-export-save-test.csv");
        let _ = std::fs::remove_file(&dest);
        save_text_file(app.handle().clone(), FilePath::Path(dest.clone()), "a,b\n1,2\n".into()).unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "a,b\n1,2\n");
        let _ = std::fs::remove_file(&dest);
    }

    #[test]
    fn write_file_roundtrips_bytes() {
        let app = fs_app();
        let dest = std::env::temp_dir().join("budget-export-bytes-test.bin");
        let _ = std::fs::remove_file(&dest);
        write_file(&app.handle().clone(), FilePath::Path(dest.clone()), &[0u8, 159, 146, 150]).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), vec![0u8, 159, 146, 150]);
        // Overwrite must truncate, not append.
        write_file(&app.handle().clone(), FilePath::Path(dest.clone()), b"xy").unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"xy");
        let _ = std::fs::remove_file(&dest);
    }

    #[test]
    fn migrate_creates_the_views_table() {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        let (n, _) = execute(&c, "INSERT INTO views (name, sort_order, hidden_category_ids) VALUES ($1, $2, $3)", &[json!("Excl. Rent"), json!(1), json!("[1]")]).unwrap();
        assert_eq!(n, 1);
        let rows = select(&c, "SELECT hidden_category_ids AS h FROM views", &[]).unwrap();
        assert_eq!(rows[0]["h"].as_str().unwrap(), "[1]");
    }

    fn cat_id(c: &Connection, name: &str) -> i64 {
        select(c, "SELECT id FROM categories WHERE name = $1", &[json!(name)]).unwrap()[0]["id"].as_i64().unwrap()
    }

    fn seeded() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        c
    }

    #[test]
    fn create_list_tx_inserts_list_and_items() {
        let mut c = seeded();
        let groceries = cat_id(&c, "Groceries");
        let input = NewList {
            date: "2026-01-01".into(), note: None, delivery_fee_pence: 0, delivery_share_pct: 0,
            delivery_category_id: groceries,
            items: vec![
                NewListItem { name: "Milk".into(), price_pence: 200, quantity: 1, share_pct: 0, category_id: groceries },
                NewListItem { name: "Bread".into(), price_pence: 150, quantity: 2, share_pct: 50, category_id: groceries },
            ],
        };
        let list = create_list_tx(&mut c, &input, "2026-01-01T00:00:00Z").unwrap();
        assert_eq!(list["items"].as_array().unwrap().len(), 2);
        assert_eq!(list["items"][0]["name"].as_str().unwrap(), "Milk");
        assert_eq!(select(&c, "SELECT COUNT(*) AS n FROM list_items", &[]).unwrap()[0]["n"].as_i64().unwrap(), 2);
    }

    #[test]
    fn update_list_tx_replaces_items_and_keeps_created_at() {
        let mut c = seeded();
        let groceries = cat_id(&c, "Groceries");
        let created = create_list_tx(
            &mut c,
            &NewList {
                date: "2026-01-01".into(), note: Some("Tesco".into()), delivery_fee_pence: 0,
                delivery_share_pct: 0, delivery_category_id: groceries,
                items: vec![
                    NewListItem { name: "Milk".into(), price_pence: 200, quantity: 1, share_pct: 0, category_id: groceries },
                    NewListItem { name: "Bread".into(), price_pence: 150, quantity: 1, share_pct: 0, category_id: groceries },
                ],
            },
            "2026-01-01T00:00:00Z",
        ).unwrap();
        let id = created["id"].as_i64().unwrap();

        let updated = update_list_tx(
            &mut c,
            id,
            &NewList {
                date: "2026-02-02".into(), note: Some("Sainsbury's".into()), delivery_fee_pence: 99,
                delivery_share_pct: 50, delivery_category_id: groceries,
                items: vec![
                    NewListItem { name: "Eggs".into(), price_pence: 300, quantity: 1, share_pct: 0, category_id: groceries },
                ],
            },
        ).unwrap();

        // Items fully replaced (1, not 3), row edited, created_at preserved.
        assert_eq!(updated["items"].as_array().unwrap().len(), 1);
        assert_eq!(updated["items"][0]["name"].as_str().unwrap(), "Eggs");
        assert_eq!(updated["date"].as_str().unwrap(), "2026-02-02");
        assert_eq!(updated["note"].as_str().unwrap(), "Sainsbury's");
        assert_eq!(updated["created_at"].as_str().unwrap(), "2026-01-01T00:00:00Z");
        assert_eq!(select(&c, "SELECT COUNT(*) AS n FROM list_items", &[]).unwrap()[0]["n"].as_i64().unwrap(), 1);
    }

    #[test]
    fn update_list_tx_on_missing_id_errors_and_inserts_nothing() {
        let mut c = seeded();
        let groceries = cat_id(&c, "Groceries");
        let res = update_list_tx(
            &mut c,
            999,
            &NewList {
                date: "2026-02-02".into(), note: None, delivery_fee_pence: 0, delivery_share_pct: 0,
                delivery_category_id: groceries,
                items: vec![NewListItem { name: "Eggs".into(), price_pence: 300, quantity: 1, share_pct: 0, category_id: groceries }],
            },
        );
        assert!(res.is_err());
        assert_eq!(select(&c, "SELECT COUNT(*) AS n FROM list_items", &[]).unwrap()[0]["n"].as_i64().unwrap(), 0);
    }

    #[test]
    fn delete_category_tx_reassigns_then_deletes() {
        let mut c = seeded();
        let bills = cat_id(&c, "Bills");
        let groceries = cat_id(&c, "Groceries");
        execute(&c, "INSERT INTO entries (amount_pence, category_id, date, note, created_at) VALUES ($1,$2,$3,$4,$5)", &[json!(500), json!(bills), json!("2026-01-01"), json!(null), json!("2026-01-01T00:00:00Z")]).unwrap();
        delete_category_tx(&mut c, bills, groceries).unwrap();
        assert_eq!(select(&c, "SELECT category_id AS c FROM entries", &[]).unwrap()[0]["c"].as_i64().unwrap(), groceries);
        assert_eq!(select(&c, "SELECT COUNT(*) AS n FROM categories WHERE id = $1", &[json!(bills)]).unwrap()[0]["n"].as_i64().unwrap(), 0);
    }

    fn recurring_template(c: &Connection, name: &str, category_id: i64, amount_pence: i64) -> i64 {
        execute(
            c,
            "INSERT INTO recurring_templates (name, category_id, amount_pence, sort_order) VALUES ($1, $2, $3, 1)",
            &[json!(name), json!(category_id), json!(amount_pence)],
        )
        .unwrap()
        .1
    }

    #[test]
    fn confirm_recurring_tx_writes_entry_and_month_row_with_template_category() {
        let mut c = seeded();
        let rent = cat_id(&c, "Rent");
        let t = recurring_template(&c, "Rent", rent, 95000);

        let entry = confirm_recurring_tx(
            &mut c,
            t,
            &ConfirmRecurring { amount_pence: 96000, date: "2026-07-01".into(), note: None },
            "2026-07-01T00:00:00Z",
        )
        .unwrap();
        assert_eq!(entry["amount_pence"].as_i64().unwrap(), 96000);
        assert_eq!(entry["category_id"].as_i64().unwrap(), rent);

        let rows = select(&c, "SELECT template_id, month, entry_id FROM recurring_months", &[]).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["month"].as_str().unwrap(), "2026-07");
        assert_eq!(rows[0]["entry_id"].as_i64().unwrap(), entry["id"].as_i64().unwrap());
    }

    #[test]
    fn confirm_recurring_tx_rejects_an_already_confirmed_month() {
        let mut c = seeded();
        let rent = cat_id(&c, "Rent");
        let t = recurring_template(&c, "Rent", rent, 95000);
        let input = ConfirmRecurring { amount_pence: 95000, date: "2026-07-01".into(), note: None };
        confirm_recurring_tx(&mut c, t, &input, "t").unwrap();

        let again = confirm_recurring_tx(&mut c, t, &input, "t");
        assert!(again.is_err());
        // The failed second confirm must not leave a stray entry behind.
        assert_eq!(select(&c, "SELECT COUNT(*) AS n FROM entries", &[]).unwrap()[0]["n"].as_i64().unwrap(), 1);
    }

    #[test]
    fn confirm_recurring_tx_upgrades_a_skipped_month() {
        let mut c = seeded();
        let rent = cat_id(&c, "Rent");
        let t = recurring_template(&c, "Rent", rent, 95000);
        execute(&c, "INSERT INTO recurring_months (template_id, month, entry_id) VALUES ($1, $2, NULL)", &[json!(t), json!("2026-07")]).unwrap();

        confirm_recurring_tx(
            &mut c,
            t,
            &ConfirmRecurring { amount_pence: 95000, date: "2026-07-01".into(), note: None },
            "t",
        )
        .unwrap();
        let rows = select(&c, "SELECT entry_id FROM recurring_months", &[]).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(rows[0]["entry_id"].is_i64());
    }

    #[test]
    fn deleting_a_confirmed_entry_cascades_the_month_row() {
        let mut c = seeded();
        let rent = cat_id(&c, "Rent");
        let t = recurring_template(&c, "Rent", rent, 95000);
        let entry = confirm_recurring_tx(
            &mut c,
            t,
            &ConfirmRecurring { amount_pence: 95000, date: "2026-07-01".into(), note: None },
            "t",
        )
        .unwrap();

        execute(&c, "DELETE FROM entries WHERE id = $1", &[json!(entry["id"].as_i64().unwrap())]).unwrap();
        assert_eq!(select(&c, "SELECT COUNT(*) AS n FROM recurring_months", &[]).unwrap()[0]["n"].as_i64().unwrap(), 0);
    }

    #[test]
    fn delete_category_tx_reassigns_recurring_templates_too() {
        let mut c = seeded();
        let bills = cat_id(&c, "Bills");
        let groceries = cat_id(&c, "Groceries");
        let t = recurring_template(&c, "Water", bills, 3200);

        delete_category_tx(&mut c, bills, groceries).unwrap();
        let rows = select(&c, "SELECT category_id AS cid FROM recurring_templates WHERE id = $1", &[json!(t)]).unwrap();
        assert_eq!(rows[0]["cid"].as_i64().unwrap(), groceries);
    }

    #[test]
    fn reorder_groups_tx_sets_sort_order() {
        let mut c = seeded();
        let ids: Vec<i64> = select(&c, "SELECT id FROM groups ORDER BY sort_order", &[]).unwrap().iter().map(|r| r["id"].as_i64().unwrap()).collect();
        let reversed: Vec<i64> = ids.iter().rev().cloned().collect();
        reorder_groups_tx(&mut c, &reversed).unwrap();
        assert_eq!(select(&c, "SELECT sort_order AS s FROM groups WHERE id = $1", &[json!(reversed[0])]).unwrap()[0]["s"].as_i64().unwrap(), 0);
        assert_eq!(select(&c, "SELECT sort_order AS s FROM groups WHERE id = $1", &[json!(reversed[4])]).unwrap()[0]["s"].as_i64().unwrap(), 40);
    }

    #[test]
    fn migrate_adds_extra_payment_column_to_older_db() {
        let c = Connection::open_in_memory().unwrap();
        // Simulate an older DB: a salary_config table missing the new column.
        c.execute_batch(
            "CREATE TABLE salary_config (year INTEGER, month INTEGER, gross_yearly_pence INTEGER, PRIMARY KEY(year,month));",
        ).unwrap();
        migrate(&c).unwrap();
        let cols: Vec<String> = c
            .prepare("PRAGMA table_info(salary_config)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .map(|x| x.unwrap()).collect();
        assert!(cols.iter().any(|c| c == "extra_payment_pence"));
    }

    #[test]
    fn migrate_adds_sl_vir_columns_to_older_db() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE salary_config (year INTEGER, month INTEGER, gross_yearly_pence INTEGER, PRIMARY KEY(year,month));",
        ).unwrap();
        migrate(&c).unwrap();
        let cols: Vec<String> = c
            .prepare("PRAGMA table_info(salary_config)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .map(|x| x.unwrap()).collect();
        for col in [
            "sl_vir_enabled",
            "sl_vir_max_rate_pct",
            "sl_vir_lower_income_pence",
            "sl_vir_upper_income_pence",
        ] {
            assert!(cols.iter().any(|c| c == col), "missing {col}");
        }
    }

    #[test]
    fn copied_db_file_is_a_complete_database() {
        // Export is a file copy of the at-rest DB; prove a copy reopens as a full, valid DB.
        let dir = std::env::temp_dir();
        let src = dir.join(format!("bt_src_{}.db", std::process::id()));
        let dst = dir.join(format!("bt_dst_{}.db", std::process::id()));
        let _ = std::fs::remove_file(&src);
        let _ = std::fs::remove_file(&dst);
        {
            let c = Connection::open(&src).unwrap();
            migrate(&c).unwrap();
            let g = cat_id(&c, "Groceries");
            execute(&c, "INSERT INTO entries (amount_pence, category_id, date, note, created_at) VALUES ($1,$2,$3,$4,$5)", &[json!(999), json!(g), json!("2026-01-01"), json!(null), json!("t")]).unwrap();
        }
        std::fs::copy(&src, &dst).unwrap();
        let c2 = Connection::open(&dst).unwrap();
        assert_eq!(select(&c2, "SELECT COUNT(*) AS n FROM entries", &[]).unwrap()[0]["n"].as_i64().unwrap(), 1);
        assert_eq!(select(&c2, "SELECT COUNT(*) AS n FROM categories", &[]).unwrap()[0]["n"].as_i64().unwrap(), 15);
        let _ = std::fs::remove_file(&src);
        let _ = std::fs::remove_file(&dst);
    }
}
