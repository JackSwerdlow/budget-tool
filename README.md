# budget-tool

A personal, single-user **monthly budget tool** that replaces a manual Excel workflow. You
record spending into a fixed taxonomy (5 groups, 15 categories), itemise grocery receipts
(splitting some costs with a flatmate), and read live monthly views — running totals,
group breakdowns, a month-vs-month comparison, and a category×month trend matrix — plus a
light income → net-balance layer.

The visual direction is **"Ledger"**: a warm, editorial account-book aesthetic (Fraunces +
Hanken Grotesk on paper tones). Everything updates live as you record.

> **Design docs:** the *what & why* lives in
> [`docs/SPEC.md`](docs/SPEC.md);
> the *how* (tech, data model, visual system, phased build) lives in [`docs/PLAN.md`](docs/PLAN.md).

## Features

- **Overview · Month** — both totals (incl/excl Rent), a net-balance card (incl Rent +
  all-time average/month), an ex-Rent running-total chart climbing toward last month's
  target, an explodable grouping donut (incl/excl Rent), and "vs last month" bars (each row
  fills toward 100% of its own last-month total; green under / red over; expandable groups).
- **Overview · Trends** — a category×month heat matrix (per-row heatmap of which months were
  heaviest), an inline signed `±%` vs the previous month sized to the swing, near-flat rows
  muted, incl/excl-Rent toggle.
- **+ Add · Single** — a fast amount field with a sum-helper (`8+8+8+5` → £29.00), an
  always-visible colour grid of all 15 categories (type to filter — `nic` ⏎ → Nicotine),
  and a save-and-clear loop.
- **+ Add · List** — itemised grocery receipts: per-item quantity, price, flatmate share
  (any %), and category; live three totals (full / your share / flatmate); a collapsible
  delivery/bag fee; and a fan-out preview of how the list files into the ledger.
- **⚙ Manage** — edit/delete past entries, restructure the taxonomy (add/rename/move
  categories & groups, delete-with-reassign), and set each month's income — all retroactive.
- Global hotkeys (`a` Add · `o` Overview · `m` Manage).

## Architecture

npm workspaces, TypeScript end-to-end:

```
packages/core/   pure logic — money, shares, list, ledger, comparison, trends, netBalance
                 (no React / DB / DOM). Built test-first.
apps/api/        thin Node + node:sqlite (DatabaseSync) HTTP store on Hono — returns raw
                 rows and accepts simple mutations; does NO analytics.
apps/web/        Vite + React + Tailwind v4 client. Loads the whole ledger once, lets
                 @budget/core derive every view, renders; a mutation re-fetches and the
                 whole UI recomputes — "everything live" by construction.
data/            budget.db (local, git-ignored) · budget-demo.db (committed)
```

**Conventions:** money is **integer pence** everywhere, shown en-GB as `£x.xx`. The month is
derived by `date.slice(0,7)` (never `new Date(str)`, to avoid a timezone shift). The
flatmate split is **half-up** with no half-pence, and a list's "your share" is the sum of
per-item costs (never the rounded total).

## Running it

Requires **Node ≥ 22.13** (built-in stable `node:sqlite`; no native build step).

```bash
npm install

npm run dev        # API (:8100) + web dev server (:5001) with an empty local DB
npm run dev:demo   # same, but served from the committed demo database
npm test           # Vitest — core unit tests + API integration tests
npm run typecheck  # tsc --noEmit across all workspaces
npm run lint       # ESLint (flat config)

npm run build      # build the web client
npm start          # production server (built web + API on one port, :8100) — your data
npm run start:demo # production server on the demo database
npm run seed:demo  # rebuild data/budget-demo.db from apps/api/src/seed-demo.ts
```

Open the dev server at `http://<host>:5001` and the production server at `http://<host>:8100`.

## Testing

The `core` package is built test-first (Vitest); the two load-bearing money invariants are
tested exactly — the half-up share split and the per-item-then-sum rule (a list's "your
share" equals the sum of its per-category subtotals, with no rounding drift). The API has
integration tests round-tripping against an in-memory SQLite database. Run `npm test`.

## Scope

`docs/PLAN.md` §1.5 records three user-approved deviations from the idea spec (the running line
is always ex-Rent with both totals as headline figures; the trends matrix uses a per-row
heatmap plus a signed diagonal `±%`; the delivery/bag-fee line). `docs/PLAN.md` §9 lists features
deliberately **deferred** (item price-history, CSV import, cross-time item analysis, pacing,
seasonal/yearly views, mobile) and §10 the non-goals — none of which are built here.
