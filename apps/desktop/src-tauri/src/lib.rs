mod db;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Open (and migrate/seed) the per-user database, then share one connection.
      let dir = app.path().app_config_dir()?;
      std::fs::create_dir_all(&dir)?;
      let conn = db::open_at(&dir.join("budget.db"))?;
      app.manage(db::Db(Mutex::new(conn)));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      db::sql_select,
      db::sql_execute,
      db::create_list,
      db::update_list,
      db::delete_category,
      db::confirm_recurring,
      db::reorder_groups,
      db::reorder_categories,
      db::import_database,
      db::export_database,
      db::save_text_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
