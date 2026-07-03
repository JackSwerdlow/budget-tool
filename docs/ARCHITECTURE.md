# Budget Tool — Architecture & Orientation

> **How to read this doc.** This describes what the app **is today** and where its parts
> live. It is a *living description*, kept in step with the code — **update it when you change
> the app.** It is **not** a spec of what the app must always be: anything here can change as
> the app evolves. The one exception is the fenced **Invariants** block — those are real rules
> that break the build or corrupt data if violated.
>
> Read this to orient, then open the one surface doc you need:
> [BUDGET](BUDGET.md) · [SALARY](SALARY.md) · [DESKTOP](DESKTOP.md). Possible future work
> lives in [IDEAS.md](IDEAS.md); how to work in this repo is in [../CLAUDE.md](../CLAUDE.md).

## What this is

A personal budgeting tool for a single user. You read your bank statements and record what you
spent into a customisable taxonomy of spending categories (seeded with a default 5 groups / 15 categories, but fully editable — add, rename, move, or delete via Manage); grocery receipts can be entered as
itemised lists with per-item flatmate cost-splitting. It shows live monthly views — a running
total, a grouping donut, a "vs last month" comparison, and a category×month trend matrix — plus
a light income → net-balance layer and a full UK **salary** breakdown (PAYE, NI, pension,
student loan). It runs two ways from one codebase: in the browser during development, and as an
installable offline desktop app.

The visual identity is **"Ledger"**: a warm, editorial account-book look (Fraunces + Hanken
Grotesk on paper tones).

## The surfaces

- **Overview** — the calm, read-mostly home. A *Month* view (running-total chart, grouping
  donut, "vs last month" bars) and a *Trends* view (category×month heat matrix). → [BUDGET.md](BUDGET.md)
- **Add** — *Single* (a fast amount field + category grid) and *List* (an itemised grocery
  receipt with flatmate splitting). → [BUDGET.md](BUDGET.md)
- **Manage** — edit/delete past entries and restructure the taxonomy. → [BUDGET.md](BUDGET.md)
- **Salary** — *Summary / Lifetime / Config* sub-tabs: a UK PAYE breakdown, lifetime
  cumulative-per-tax-year totals, a pension forecast, and a student-loan tracker. Writes the
  month's net pay into the income layer. → [SALARY.md](SALARY.md)
- **Desktop** — the Tauri shell that packages the web app as an offline installable.
  → [DESKTOP.md](DESKTOP.md)

## How it's built

npm workspaces, TypeScript end-to-end:

```
packages/core/   pure logic — money, shares, list, ledger, comparison, trends, netBalance,
                 salary*, studentLoan, time. No React / DB / DOM. Built test-first.
apps/api/        a thin Node + node:sqlite (Hono) HTTP store — returns raw rows, accepts
                 simple mutations, does NO analytics.
apps/web/        Vite + React + Tailwind. Loads the whole ledger once, lets @budget/core
                 derive every view, renders; a mutation refetches and the UI recomputes —
                 "everything live" by construction.
apps/desktop/    Tauri v2 (Rust) shell. Reuses apps/web verbatim; only the data transport
                 differs.
```

**Data flow.** The client fetches everything once (`bootstrap` — groups, categories, entries,
lists + items, income, salary config), `@budget/core` derives every total/chart/comparison,
React renders. Any mutation refetches and re-derives, so all views stay consistent by
construction. The server (and the desktop DB layer) only store and return raw rows — **all
money math lives in `core`**.

**The data seam (web vs desktop).** Every DB call goes through one `DataPort` interface
(`apps/web/src/data/port.ts`), chosen at runtime by `window.isTauri`:

- browser / `npm run dev` → `data/http.ts` → `apps/api` (Hono + node:sqlite)
- inside Tauri → `data/queries.ts` → `data/executor.ts` → `invoke()` →
  `apps/desktop/src-tauri/src/db.rs` (one rusqlite connection; multi-statement writes are
  dedicated Rust commands so they are real transactions)

Adding a new DB operation is the one thing that must be done on **both** paths — see the
operating rule in [../CLAUDE.md](../CLAUDE.md). Full detail in [DESKTOP.md](DESKTOP.md).

**Running it.** `npm run dev` = web (`:5001`) + API (`:8100`); `npm run tauri:dev` = the
desktop app (needs the Rust toolchain).

## Invariants

> The few real rules. Everything above is description you may change; these break the build or
> corrupt data if violated.

1. **Money integrity.** Store money as integer pence. Intermediate math may be fractional, but
   round **deterministically at the storage/display boundary** (the flatmate split is half-up
   with the remainder going to "mine", so `mine + flatmate === price` exactly). **A total shown
   to the user must always equal the sum of the parts shown to the user** — never round a total
   independently of its components. Displayed money is 2dp (`£x.xx`).
2. **Month bucketing by string slice.** Derive a month with `date.slice(0, 7)`, **never**
   `new Date(str)` — a bare date string parses as UTC midnight and can shift to the previous
   month in a local timezone.
3. **Category deletes never orphan.** Every DB connection runs `PRAGMA foreign_keys = ON`;
   all category references are `ON DELETE RESTRICT`. Deleting a category that is still in use
   must **reassign its rows, then delete, in one transaction**.
4. **Lists store items only.** An itemised list persists its **item rows**; its per-category
   contributions are **always recomputed** (`listCategorySubtotals`) and **never** written as
   `entries` rows. Materialising a list's totals as entries double-counts or desyncs.

## Known workarounds

> True today, but only because of fixable setup — not laws. A deliberate refactor should remove
> them. Logged in [IDEAS.md](IDEAS.md).

(A former entry here is resolved: `categories.exclude_from_discretionary` — vestigial since
saved Views replaced the discretionary concept — has been dropped from the schema, seed, both
adapters and tests; both `migrate` paths DROP COLUMN it from pre-existing databases.)

(A former entry here is resolved: `apps/api` now imports `@budget/core` directly — core's
internal imports carry explicit **`.ts`** extensions (with `allowImportingTsExtensions`), which
both `tsc`'s `nodenext` check and Node's runtime type-stripping resolve, so the salary-YTD math
lives in one place. `.js` extensions satisfy `tsc` but **not** Node's loader, which runs
`apps/api` off the `.ts` source directly.)
