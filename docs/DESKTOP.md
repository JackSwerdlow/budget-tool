# Budget Tool — Desktop (Tauri)

> How the app ships as an installable, fully-offline desktop app. Living description — **update
> it when you change the shell or the data layer.** The seam *overview* and the invariants are in
> [ARCHITECTURE.md](ARCHITECTURE.md); this doc is the desktop-specific detail.

## The shape

`apps/desktop/` is a **Tauri v2 (Rust)** shell whose "frontend" is `apps/web` built verbatim —
**not a fork.** The same React UI and `@budget/core` logic run in both the browser-dev build and
the desktop build; only the data transport differs (the `DataPort` seam in
`apps/web/src/data/`). UI / styling / component / `core` / `apps/api` changes therefore apply to
both targets automatically.

## Rust data layer (`apps/desktop/src-tauri/src/db.rs`)

One `rusqlite::Connection` behind a `Mutex` in managed state. The DB lives at `budget.db` under
the per-user **app-config dir** (`%APPDATA%\…`, `~/.config/…`, `~/Library/Application Support/…`),
so it persists across updates and is independent of the install location.

At startup: `PRAGMA foreign_keys = ON`, then the schema and seed run (idempotently):
- **Schema** is the *same file* as the API's — `include_str!("../../../api/src/db/schema.sql")` —
  so there is one schema source.
- **Seed** mirrors `apps/api/src/seed.ts` as **guarded inserts** (`INSERT … WHERE NOT EXISTS`), so
  first launch seeds the locked taxonomy and a re-run (or an imported older DB) is a safe no-op.
- Column-addition migrations backfill DBs created before a later schema change.

Registered commands (`lib.rs` `generate_handler!`):
- **Generic** `sql_select` / `sql_execute` — back the bulk of `DataPort` (the executor converts
  `$N` placeholders to positional `?`, identical to the node:sqlite test executor, which is what
  the parity tests cover).
- **Transactional** `create_list`, `update_list`, `delete_category` (reassign-then-delete),
  `confirm_recurring` (entry + recurring-month row), `reorder_groups`, `reorder_categories` —
  multi-statement writes that must be one real transaction on the single connection.
- **`import_database`** (copy a chosen `.db` over app-config `budget.db`, then re-migrate) and
  **`export_database`** (copy `budget.db` to a chosen path). Surfaced in Manage → Database
  (`DatabaseTools.tsx`, desktop-only).

## Adding a data operation (the one rule, in detail)

> Also available as an on-demand skill: `.claude/skills/add-data-operation/SKILL.md` — the same
> recipe as a step-by-step checklist (contract → both paths → schema → export → tests).

A new `DataPort` method must be implemented on **both** transports or the desktop app silently
breaks:

1. **HTTP path** — a new `apps/api` route + `repo.ts` query, called from `data/http.ts`.
2. **SQL path** — the query in `data/queries.ts` via the injected executor. If it's a single
   statement it rides on `sql_select` / `sql_execute`; if it's **multi-statement / transactional**,
   add a dedicated Rust command in `db.rs` and register it in `lib.rs`.
3. **Cover both** — parity in `apps/web/src/data/queries.test.ts` (node:sqlite executor) and, for a
   new Rust command, the `db.rs` tests.

## Running & shipping

- `npm run dev` — web + API, unchanged; no Rust needed.
- `npm run tauri:dev` / `npm run tauri:build` — the desktop app live / bundled (needs the Rust
  toolchain; on Linux also `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev patchelf libssl-dev`).
  Keep the toolchain current: the pinned `libsqlite3-sys` build script uses `cfg_select!`, which
  1.93 rejects with `error[E0658]: use of unstable library feature 'cfg_select'` (1.97.1 builds
  it). `rustup update stable` fixes it.
- `npm -w @budget/desktop run tauri dev -- --config '{"identifier":"com.budgettool.smoke"}'` — the
  same dev app against a **throwaway** app-config dir, so a test run can't touch the real
  `budget.db`. Worth using for anything but deliberate work on your own data. Launching, driving
  and screenshotting all three targets: the `run-budget-tool` skill.
- **Release** — push a `desktop-v*` tag → `.github/workflows/release.yml` runs a `tauri-action`
  matrix on real runners → a **draft GitHub Release** with Windows `.exe`, macOS `.dmg`, Linux
  `.AppImage`/`.deb`.

The app icon is a Ledger-style **Fraunces "£" over a double account-book rule** in the app's
paper/ink/accent palette. The 1024px source is `apps/desktop/app-icon.png`; regenerate the
platform set with `npm run tauri -- icon ./app-icon.png` from `apps/desktop` — this also writes
the Android mipmaps into `gen/android` (kept; iOS outputs aren't — no iOS target). Desktop
installers are still **unsigned** (first-run SmartScreen/Gatekeeper warnings) — see
[IDEAS.md](IDEAS.md) for the signing polish. The **Android** build of this same shell is
documented in [MOBILE.md](MOBILE.md).
