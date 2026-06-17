# Desktop App (Tauri) — Design Spec

**Status:** approved design, not yet built. Branch: `desktop-tauri`.
**Date:** 2026-06-16.

This is the **what & why** for packaging the existing budget-tool as an installable, fully
offline desktop app distributed as downloadable installers (Windows `.exe`, macOS `.dmg`,
Linux `.AppImage`/`.deb`). It realises the deferred target named in `docs/PLAN.md` §9
("desktop wrapper (Tauri)") and the CLAUDE.md "Future platform targets" goal ("fully
offline, no ports or HTTP server"). The implementation task breakdown is the companion
`docs/DESKTOP_PLAN.md` (written next, via the planning step).

---

## 1. Goal & non-goals

**Goal:** the *exact* current app — same React UI, same `@budget/core` logic, same SQLite
data model — installable as a native desktop app that runs offline with no HTTP server and
no ports, storing data in the OS per-user app-data directory.

**Decisions locked during brainstorming (all user-approved):**

| Decision | Choice | Reason |
|---|---|---|
| Packaging tech | **Tauri v2** | Plan's named choice; tiny binary (~5–10 MB); native offline / no HTTP; data-access code lives in the frontend, sidestepping the documented `apps/api` → `@budget/core` TS2835 import bug. |
| Toolchain | **Rust (rustup)** as a build-time prerequisite | Required to compile Tauri; user writes no Rust business logic. |
| Build/distribution | **GitHub Actions matrix** (`tauri-action`) → Win/macOS/Linux installers attached to a draft GitHub Release | Dev box is Linux; cross-compiling a Windows `.exe` from Linux is impractical. CI on real runners is the standard path. |
| First-run data | **Empty seeded DB** (taxonomy only) + an **Import database** action | Clean for a real, long-lived ledger; import is the one-time bring-your-existing-`budget.db` path. |

**Non-goals for this branch (YAGNI — do NOT build):** code signing / notarization,
auto-update, mobile (Expo), retiring the HTTP API, any new product feature. Scope is purely
"make the existing app installable and offline."

---

## 2. Architecture — reuse, with one new workspace

```
packages/core/   UNCHANGED — pure logic, shared by every target
apps/api/        UNCHANGED — Node + node:sqlite + Hono; still powers `npm run dev` (web/dev)
apps/web/        + a data-adapter layer (§3); SAME React UI, also serves as the Tauri webview
apps/desktop/    NEW — src-tauri/ (Rust shell) + tauri.conf.json; its "frontend" IS apps/web's build
```

The desktop app does **not** fork the UI. `apps/desktop` is essentially just `src-tauri/`
plus Tauri config that points its frontend at `apps/web` (`beforeBuildCommand` builds web;
`frontendDist` → `../web/dist`; `devUrl` → the Vite dev server). Only the data transport
differs between the browser build and the desktop build.

---

## 3. The core change: a data-adapter seam in `apps/web`

> **As built (supersedes the plugin details below) — rusqlite-only.** During Phase B the
> `@tauri-apps/plugin-sql` approach was dropped: it links `libsqlite3-sys` via sqlx, which
> **conflicts with `rusqlite`** (the crate needed for the transactional commands) — the two
> can't coexist in one binary. The original plan's "plugin for reads + rusqlite for
> transactions" therefore never would have compiled. Resolution: **the desktop data layer is
> 100% `rusqlite`** behind generic Tauri commands. The TS seam is unchanged in spirit; the
> concrete files are `data/port.ts` (contract), `data/http.ts` (HTTP adapter),
> `data/queries.ts` (`makeSqlPort` — the ported SQL, **untouched by the pivot**),
> `data/executor.ts` (`SqlExecutor`; the production executor calls `invoke('sql_select' |
> 'sql_execute')` instead of `Database.load`), `data/errors.ts` (`normalizeError`), and
> `data/index.ts` (runtime `window.isTauri` selection + lazy proxy). The Rust side holds one
> `Mutex<Connection>`; `sql_select`/`sql_execute` convert `$N`→positional `?` and bind in
> order — **identical to the node:sqlite test executor**, so the parity tests cover the real
> binding contract. See §4 and `DESKTOP_PLAN.md` Phase B.

Today **every** DB interaction in the client flows through one file —
`apps/web/src/api.ts` (`fetch` → Hono routes → `apps/api/src/repo.ts` SQL). That single file
is the seam. We split it into adapters with **identical exported function signatures**, so
no feature/chart/Manage/Salary component changes:

```
apps/web/src/data/
  port.ts    # the shared TypeScript interface + input/return types (the contract)
  http.ts    # today's fetch implementation, moved verbatim (browser / `npm run dev`)
  tauri.ts   # same operations via @tauri-apps/plugin-sql (db.select / db.execute)
  index.ts   # runtime adapter selection + re-export
```

- **Adapter selection (runtime):** `window.isTauri ? tauri : http` (`window.isTauri` is the
  documented Tauri v2 detector; `__TAURI_INTERNALS__` is a fallback). Plain browser (dev/web)
  → HTTP; inside the Tauri webview (dev *or* packaged) → SQL plugin.
- `apps/web/src/api.ts` becomes a thin re-export of `data/index.ts` so existing
  `import … from '../api'` sites keep working unchanged.
- `tauri.ts` is `repo.ts`'s queries re-expressed against the plugin: `db.select<T>(sql, params)`
  for reads, `db.execute(sql, params)` for writes, **`$1,$2,…` placeholders** (plugin/sqlx
  syntax) in place of node:sqlite's `?`. Returns must match the existing JSON shapes exactly
  (e.g. `getBootstrap` → `{ groups, categories, entries, lists: [{…, items}], income,
  defaultIncomePence }`).
- **Structure for testability:** `tauri.ts`'s query code is written against an **injected
  executor** (`{ select, execute }`) rather than calling `Database.load` directly. In
  production the executor wraps the plugin; in Vitest the *same* query code runs against a
  `node:sqlite` executor (see §6). This is what makes the risky part — the `?`→`$N` rewrite
  and row-shape assembly — unit-testable without the Tauri IPC bridge.
- **Error normalization:** `http.ts` throws on `!res.ok`; the SQL plugin rejects with a
  different shape. Both adapters must normalize failures to **one error shape** so the UI's
  existing error handling is transport-agnostic.

**Accepted tradeoff — SQL duplication.** The SQL now lives in two places: `apps/api/repo.ts`
(node:sqlite, for dev/web) and `data/tauri.ts` (plugin, for desktop). This is unavoidable
while both a web-dev server and an offline desktop app exist — a browser cannot use the SQL
plugin and Tauri has no Node runtime. The two backends must be kept in sync; §6 testing
mirrors the API's integration assertions onto the Tauri path to catch drift. Long-term, the
desktop/mobile direction may retire the HTTP API and collapse this back to one backend.

---

## 4. Tauri shell (`apps/desktop/src-tauri/`)

> **As built — rusqlite (see §3 note).** No SQL plugin. The Rust shell opens one
> `rusqlite::Connection` (held in a `Mutex` in managed state) at the app-config DB path and
> exposes generic `sql_select` / `sql_execute` commands plus the transactional commands.

### 4.1 Data location & lifecycle
- DB opened via `rusqlite` at `budget.db` under the per-user **app-config** dir
  (`%APPDATA%\<identifier>\` on Windows, `~/.config/<identifier>/` on Linux,
  `~/Library/Application Support/<identifier>/` on macOS). Persists across app updates;
  independent of the install location.
- `PRAGMA foreign_keys = ON` on the connection (matching the existing API convention).

### 4.2 Schema + seed at startup (rusqlite)
The full current schema (`apps/api/src/db/schema.sql`: `groups`, `categories`, `entries`,
`lists`, `list_items`, `monthly_income`, `settings`, `salary_config` + indexes) and the
locked taxonomy seed (`apps/api/src/seed.ts`: 5 groups / 15 categories with exact hex shades
and `Rent.exclude_from_discretionary = 1`) run on startup via `execute_batch`. The schema is
already `CREATE TABLE IF NOT EXISTS` (idempotent); the seed uses **guarded inserts**
(`INSERT … SELECT … WHERE NOT EXISTS`) so it is idempotent too — which also makes
import-then-migrate trivially safe. First launch yields an empty, correctly-seeded DB.

### 4.3 Import database (chosen first-run path)
- `@tauri-apps/plugin-dialog` opens a native file picker (filter: `*.db`).
- A small **Rust command** copies the chosen file over the app-config `budget.db`
  (after a confirm, since it replaces current data), then **re-runs schema+seed on the
  imported DB** (a user's older file may predate a later schema addition), then reloads the
  DB/bootstrap.
- This is the one-time "bring my real `budget.db` in" path.

### 4.4 Capabilities (least privilege, no network)
The dialog permission only (`dialog:default`); the DB commands are app-local custom commands
(no plugin permissions needed). No HTTP, no shell, no arbitrary fs.

---

## 5. Workflows

### 5.1 Local dev / build
- `npm run dev` — **unchanged** (web + API; the normal Linux iteration loop, viewed via the
  network IP per project convention).
- `npm run tauri:dev` — Vite frontend in a native Tauri window using the SQL plugin (no API
  process). The way to exercise the *real* offline data path locally (as a Linux build).
- `npm run tauri:build` — local native bundle (AppImage/deb on Linux) to verify bundling end-to-end.

### 5.2 CI — cross-platform downloadables
`.github/workflows/release.yml`: a `tauri-action@v0` matrix
(`windows-latest`, `macos-latest` ×2 for Apple-Silicon + Intel, `ubuntu-22.04` with the
`libwebkit2gtk-4.1-dev …` deps) triggered on a `desktop-v*` tag. Produces a **draft GitHub
Release** with the Windows `.exe`, macOS `.dmg`, and Linux `.AppImage`/`.deb` attached.
Installers are **unsigned** initially → Windows SmartScreen / macOS Gatekeeper will warn on
first run; signing is an explicit later add (non-goal here).

---

## 6. Testing

- `packages/core` Vitest — **unchanged**.
- **Tauri SQL via injected executor (Vitest).** The plugin's `Database.load` calls `invoke()`,
  which needs the Tauri IPC bridge that does **not** exist in a Node test process — so
  `tauri.ts` cannot be exercised through `@tauri-apps/plugin-sql` in Vitest. Instead, the
  injected-executor structure (§3) lets the **same query code** run against a `node:sqlite`
  executor in Vitest. That tests the genuinely risky part — the `?`→`$N` rewrite, parameter
  order, and row-shape assembly — by porting the existing `apps/api` integration assertions
  (insert → bootstrap → derive; rename category reflows history; list fan-out) onto it.
- **Plugin/permission wiring** (capabilities, `Database.load`, the import command) is verified
  **manually** in `tauri:dev` plus a CI smoke build — not in Vitest.
- **Manual click-through** in `tauri:dev` per phase: add entry updates overview live; itemised
  list fan-out; Manage recategorise reflows history; **Salary tab** numbers match; Import
  database replaces data and reloads.

---

## 7. Known implementation risks & recommended defaults

Both are deferred to `DESKTOP_PLAN.md` for exact handling; defaults below are the approved
starting point.

1. **Transactions on a pooled connection.** The SQL plugin runs on an sqlx connection pool,
   so `BEGIN`/`COMMIT` issued as separate `execute` calls are not guaranteed to share a
   connection. `repo.ts` relies on real transactions for `createList`, `updateList`,
   `deleteCategory` (reassign-then-delete), and the reorder operations.
   **Default:** implement those few multi-statement writes as small **Rust commands** (one
   connection, one real transaction); keep single-statement writes in JS. Fallback: a single
   batched multi-statement `execute`.

2. **Payslip-validated salary logic — highest-danger item.** `getSalaryYTD` and the salary
   config backward/forward inheritance (`getSalaryConfig`) are critical, payslip-validated
   logic (see the `salary-paye-payslip-ground-truth` constraint) that must not be silently
   re-derived. **Confirmed:** `repo.ts:getSalaryYTD` computes NI/SL/pension **inline** (it does
   *not* call the existing per-month core salary engine from commit `de378f0`) — almost
   certainly because TS2835 stopped the API importing core. That creates a specific trap when
   lifting it.
   **Default & discipline:**
   - Move the inline logic into `packages/core` **verbatim — inline math intact**. Do **not**
     rewire it to the existing core engine; that would change payslip-validated output.
   - Write the port as a **characterization test first** (port the existing real-payslip test,
     pin current outputs), then move, then prove byte-identical results.
   - **Explicitly out of scope this branch:** unifying `getSalaryYTD` with the core salary
     engine. That is a separate, riskier refactor a packaging task must not absorb.
   - `tauri.ts` consumes the lifted core functions. `apps/api` keeps its own copy (the TS2835
     ban prevents it importing `@budget/core` at runtime); sync risk noted.

---

## 8. Definition of done (this branch)

- `apps/desktop` builds and runs via `tauri:dev` / `tauri:build` on Linux; the app is fully
  functional offline using the SQL plugin (every existing view + the Salary tab).
- First launch creates an empty, seeded DB in the app-config dir; **Import database** works.
- `npm run dev` (web + API) is unchanged and still works.
- CI workflow produces a draft Release with Windows `.exe`, macOS `.dmg`, Linux
  `.AppImage`/`.deb` on a `desktop-v*` tag.
- Core + parity tests pass; typecheck + lint clean.
- **Stale "do not build" docs updated** to reflect that desktop is now built, so the next
  session isn't misled: CLAUDE.md "Future platform targets", `docs/PLAN.md` §9 (desktop
  wrapper line), and the `budget-tool-build-cadence` memory.

---

## 9. Build/runtime gotchas to carry into `DESKTOP_PLAN.md`

One-liners so they aren't rediscovered mid-build (most are already designed into §3–§4):
- **Vite `base: './'`** for the Tauri build, or bundled assets 404 inside the webview
  (Tauri loads from a custom protocol, not an HTTP origin).
- One **normalized error shape** across both adapters (§3).
- **`window.isTauri`** for adapter detection (§3).
- **Import runs migrations on the incoming `.db`** (§4.3).
- **Transactional writes via Rust commands** on a single connection (§7.1).
