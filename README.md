# budget-tool

A personal, single-user **monthly budget tool** that replaces a manual Excel workflow. You
record spending into a customisable taxonomy (a default 5 groups / 15 categories, fully
editable), itemise grocery receipts (splitting some costs with a flatmate), and read live
monthly views — running totals, group breakdowns, a month-vs-month comparison, and a
category×month trend matrix — plus a light income → net-balance layer and a full **UK salary
breakdown** (PAYE / NI / pension / student loan). It runs in the browser for development and as
an installable, fully-offline **Tauri desktop app** from one codebase.

The visual direction is **"Ledger"**: a warm, editorial account-book aesthetic (Fraunces +
Hanken Grotesk on paper tones). Everything updates live as you record.

> **Docs:** the architecture & orientation map is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
> (read first); surface maps are [`docs/BUDGET.md`](docs/BUDGET.md),
> [`docs/SALARY.md`](docs/SALARY.md), and [`docs/DESKTOP.md`](docs/DESKTOP.md); possible future
> work is in [`docs/IDEAS.md`](docs/IDEAS.md).

## Features

- **Overview · Month** — both totals (incl/excl Rent), a net-balance card (incl Rent +
  all-time average/month), an ex-Rent running-total chart climbing toward last month's
  target, an explodable grouping donut (incl/excl Rent), and "vs last month" bars (each row
  fills toward 100% of its own last-month total; green under / red over; expandable groups).
- **Overview · Trends** — a category×month heat matrix (per-row heatmap of which months were
  heaviest), an inline signed `±%` vs the previous month sized to the swing, near-flat rows
  muted, incl/excl-Rent toggle.
- **+ Add · Single** — a fast amount field with a sum-helper (`8+8+8+5` → £29.00), an
  always-visible colour grid of the categories (type to filter — `nic` ⏎ → Nicotine),
  and a save-and-clear loop.
- **+ Add · List** — itemised grocery receipts: per-item quantity, price, flatmate share
  (any %), and category; live three totals (full / your share / flatmate); a collapsible
  delivery/bag fee; and a fan-out preview of how the list files into the ledger.
- **Salary** — a UK salary breakdown (Summary / Lifetime / Config sub-tabs): PAYE, NI,
  pension, and a student-loan tracker; writes the month's net pay into the income layer.
- **⚙ Manage** — edit/delete past entries and lists, restructure the taxonomy (add/rename/move
  categories & groups, delete-with-reassign), and — on desktop — export/import the database;
  all retroactive.
- Global hotkeys (`a` Add · `o` Overview · `s` Salary · `m` Manage; ← → step months).

## Architecture

npm workspaces, TypeScript end-to-end:

```
packages/core/   pure logic — money, shares, list, ledger, comparison, trends, netBalance,
                 salary*, studentLoan, time (no React / DB / DOM). Built test-first.
apps/api/        thin Node + node:sqlite (DatabaseSync) HTTP store on Hono — returns raw
                 rows and accepts simple mutations; does NO analytics.
apps/web/        Vite + React + Tailwind v4 client. Loads the whole ledger once, lets
                 @budget/core derive every view, renders; a mutation re-fetches and the
                 whole UI recomputes — "everything live" by construction.
apps/desktop/    Tauri v2 (Rust) shell — reuses apps/web verbatim against a local rusqlite
                 DB. Only the data transport differs (the DataPort seam in apps/web/src/data/).
data/            budget.db (local, git-ignored) · budget-demo.db (committed)
```

**Conventions:** money is **integer pence** everywhere, shown en-GB as `£x.xx`. The month is
derived by `date.slice(0,7)` (never `new Date(str)`, to avoid a timezone shift). The flatmate
split is **half-up** with no half-pence, and a list's "your share" is the sum of per-item costs
(never the rounded total). The full invariants are in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Running it

Requires **Node ≥ 22.13** (built-in stable `node:sqlite`; no native build step). The desktop app
additionally needs the Rust toolchain.

```bash
npm install

npm run dev        # API (:8100) + web dev server (:5001) with an empty local DB
npm run dev:demo   # same, but served from the committed demo database
npm run tauri:dev  # the desktop app live (needs Rust)
npm test           # Vitest — core unit tests + API/parity integration tests
npm run typecheck  # tsc --noEmit across all workspaces
npm run lint       # ESLint (flat config)

npm run build      # build the web client
npm start          # production server (built web + API on one port, :8100) — your data
npm run start:demo # production server on the demo database
npm run seed:demo  # rebuild data/budget-demo.db from apps/api/src/seed-demo.ts
```

Open the dev server at `http://<host>:5001` and the production server at `http://<host>:8100`.
Desktop installers are built in CI on a `desktop-v*` tag (see [`docs/DESKTOP.md`](docs/DESKTOP.md)).

## Testing

The `core` package is built test-first (Vitest); the load-bearing money invariants are tested
exactly — the half-up share split and the per-item-then-sum rule — and the salary PAYE engine is
validated to the penny against real payslips. The web (`apps/api`) and desktop (rusqlite) data
paths are kept in step by parity tests. Run `npm test`.

## Scope

Current behaviour and the few hard invariants live in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); possible future features and changes (candidates,
not commitments) live in [`docs/IDEAS.md`](docs/IDEAS.md). Historical build logs and the original
specs are under `docs/archive/`.
