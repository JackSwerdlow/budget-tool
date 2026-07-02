# Budget Tool — Budgeting Surfaces

> A surface map for the everyday budgeting screens (Overview, Add, Manage). Living
> description — **update it when you change these screens.** The reading rules and the
> invariants live in [ARCHITECTURE.md](ARCHITECTURE.md); the Salary tab is in
> [SALARY.md](SALARY.md).

## What it records

- **Entry** (a single spend) — an amount, **one** category, a date (which places it in a
  month), and an optional note. The amount field accepts a sum (`8+8+8+5`) via the core
  `evalSum` helper, so repetitive same-category spend can be pre-summed into one line.
- **List** (an itemised grocery receipt) — item rows, each with a name, quantity, price,
  flatmate **share %**, and category, plus an optional collapsible delivery/bag fee. A list
  contributes one per-category subtotal each to the ledger; it does **not** create entries
  (see Invariant 4 in [ARCHITECTURE.md](ARCHITECTURE.md)).
- **Taxonomy** — categories grouped under top-level groups, **one category per entry**.
  Seeded with a default 5 groups / 15 categories but fully customisable via Manage.
- **Income** — a light per-month figure feeding Net Balance; populated by the Salary tab
  (see [SALARY.md](SALARY.md)).

Core model + math: `packages/core` (`ledger`, `list`, `shares`, `comparison`, `trends`,
`netBalance`, `money`, `time`).

## Overview

The calm, read-mostly home, with a **Month** and a **Trends** view (`features/OverviewMonth.tsx`,
charts in `apps/web/src/charts/`).

**Month** shows: a headline "This month" total, with year-to-date and average-per-month spend
underneath (`yearTotal`, `averageSpend` in `core/ledger.ts` / `core/netBalance.ts`) — both bounded
to the viewed month, so browsing to an earlier month excludes anything after it, never silently
averaging in the future; a Net Balance card (income − total spend, plus its own income/avg-net
line on the same viewed-month bound (`averageNet`) — the money itself always includes
*everything*, regardless of the category filter below, only the averaging window moves with the
month picker); a running-total chart through the month toward a dashed target at last month's
total (`RunningChart`); a grouping donut that explodes a group into its categories on click
(`GroupingDonut`); and "vs last month" bars — each row (group, expandable to its categories) fills
toward 100% of *its own* last-month total, green under / red over (`ComparisonBars`,
`comparison.comparePct`).

Every Overview summary surface (the totals above, the running chart, the donut, the bars, and
Trends below) shares one category/group show-hide filter: an "All" + saved-**View** button row
(the currently-active preset is highlighted), plus a "Categories ▾" checklist for ad hoc tweaks
(both live in `App.tsx`, threaded down as a `hiddenCategoryIds` prop). A View is a named, saved
preset of that filter — create/rename/edit/delete them from Manage → **Views** (its own tab,
capped at 4). The filter always starts at "All" (no default exclusion) each session — Net
Balance's money is the one thing it never touches.

**Trends** is a category×month heat matrix (`charts/TrendsMatrix.tsx`, `core/trends.ts`): cell
colour is a **per-row** heatmap (which months were heaviest for that row), with an inline signed
`±%` vs the previous month; near-flat rows are muted; groups expand to categories. Uses the same
shared category filter as Month.

## Add

- **Single** (`features/AddSingle.tsx`) — the fast path: amount (with the live sum-helper), a
  category picker with type-to-filter (`nic` ⏎ → Nicotine), date (defaults to today), optional
  note, and a **save-and-clear loop** (Enter saves and refocuses the amount) with an "added
  just now" session list that can undo a line. Categories render one group per row, each a
  connected button row (`components/CategoryGrid.tsx`, M3 "connected button group" styling) —
  buttons keep a per-category colour dot and morph to a rounder shape when selected; a row
  wraps onto a new line rather than scrolling if a group has too many categories to fit.
- **List** (`features/AddList.tsx` + the shared `features/ListForm.tsx`) — itemised rows with
  an inline average unit price (price ÷ qty), and three totals: **Full list**, **Your share**
  (what counts), and **Flatmate** (reference only). Flatmate shares are treated as **settled** —
  there is no running balance of what's owed. The delivery/bag fee is collapsed and £0 by
  default. On save the list fans out into one per-category your-share subtotal. Typing an item
  name suggests past items (case-insensitive substring match, most-recently-used first, drawn
  from all saved lists — same-day saves tie-broken by save time); picking a suggestion fills in
  that item's last price and category. Keyboard: **↑/↓** moves the highlight, **Enter** fills the
  highlighted suggestion, **Tab** fills it and then advances to Qty as normal.

## Manage

`features/manage/` — quieter "back of house", with four areas:

- **Entries** (`ManageEntries.tsx`) — a date-grouped stream; edit or delete past **entries and
  lists** (list editing reuses `ListForm`); a category filter + note/item search that looks
  **across all months** so an entry can be found without knowing its month. Deletes use a
  two-click arm/confirm.
- **Taxonomy** (`ManageTaxonomy.tsx`) — add / rename / move / delete categories and groups.
  Deleting a category in use reassigns its rows first (Invariant 3). Changes apply retroactively
  across all history, since entries reference categories by id.
- **Views** (`ManageViews.tsx`) — named, saved show/hide presets (max 4) used by Overview's
  category filter; a View just stores which category ids are hidden, so deleting one is a plain
  row delete (no reassignment needed).
- **Database** (`DatabaseTools.tsx`, **desktop only**) — Export (save a copy of `budget.db`) and
  Import (replace all data with a chosen `budget.db`). Hidden in the browser build.

Refunds/returns are handled here by editing or deleting the original entry.
