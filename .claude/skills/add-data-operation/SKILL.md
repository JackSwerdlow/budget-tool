---
name: add-data-operation
description: Add a new data operation (DataPort method) to the budget tool. Use whenever adding, changing, or removing a DB operation, query, mutation, or schema column — the operation must be implemented on BOTH the web (HTTP) and desktop (Tauri SQL) transports or the desktop app silently breaks.
---

# Add a data operation (both transports)

The app has one data contract — `DataPort` in `apps/web/src/data/port.ts` — and two transports
that must stay in lockstep. Work through every step; skipping the SQL path is the classic
silent-desktop-breakage mistake.

## 1. Define the contract

- Add the method (and any input/output types) to `DataPort` in `apps/web/src/data/port.ts`.
- Row/domain types live in `packages/core/src/types.ts` (raw rows only — **all money math
  belongs in `packages/core`**, never in a transport or the API).

## 2. HTTP path (browser / `npm run dev`)

- Query/mutation in `apps/api/src/repo.ts`.
- Route in `apps/api/src/app.ts`.
- Client call in `apps/web/src/data/http.ts` (implements the `DataPort` method).

## 3. SQL path (desktop / Tauri)

- Implement the same method in `apps/web/src/data/queries.ts` via the injected executor.
  Placeholders are `$1, $2, …` (the executor converts to positional `?`).
- **Single statement** → it rides the generic `sql_select` / `sql_execute` commands; no Rust.
- **Multi-statement / transactional** (anything that must be atomic — e.g. reassign-then-delete,
  replace-all-rows) → add a dedicated Rust command in `apps/desktop/src-tauri/src/db.rs` and
  register it in `lib.rs` `generate_handler!`; call it from `queries.ts` via `invoke()`.
- Any application-layer rule enforced in `repo.ts` (e.g. the 4-View cap) must be duplicated in
  `queries.ts` — the SQL path never goes through the API.

## 4. Schema changes (if any)

- `apps/api/src/db/schema.sql` is the **single schema source** (the Rust side `include_str!`s it).
- A column addition also needs a guarded `ALTER TABLE` migration in **both**
  `apps/api/src/migrate.ts` and `migrate()` in `apps/desktop/src-tauri/src/db.rs`
  (for DBs created before the change).
- New seeded rows: `apps/api/src/seed.ts` **and** the guarded inserts in `db.rs`.

## 5. Export it

- Add the method to the destructured `export const { … } = dataPort` list in
  `apps/web/src/data/index.ts` — otherwise features can't import it.

## 6. Tests (both sides, non-negotiable)

- Parity test in `apps/web/src/data/queries.test.ts` (runs `queries.ts` against the node:sqlite
  test executor in `testdb.ts` — this is what proves the two transports agree).
- API behaviour in `apps/api/src/app.test.ts` where the route has logic worth covering.
- A **new Rust command or migration** also gets a test in the `#[cfg(test)] mod tests` block of
  `db.rs`.

## 7. Verify

```
npm run typecheck && npm test && npm run lint
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml   # only if db.rs changed
```

Full background: `docs/DESKTOP.md` ("Adding a data operation") and the operating rule in
`CLAUDE.md`.
