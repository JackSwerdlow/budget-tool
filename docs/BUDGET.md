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
month picker); a running-total chart through the month (`RunningChart`) — a stepped line (impulse
on the spend day, flat between) over a **stacked** per-group fill (donut colours/proportions, via
`core/ledger.runningCumulativeByGroup`), toward toggleable reference lines (pill
toggles in the chart header; hiding one also releases the y-axis from its value): last month's
total (**dotted**, on by default) and two off-by-default income lines — the month's full
**income** (**dashed**; ignores the category filter, like Net Balance) and, only while the
filter hides spend, **Adj. Income** (**dash-dot**): income − hidden-category spend, clamped at
£0, i.e. "what's left for the categories in view"; crossing it is exactly the moment *total*
spend crosses total income. Each line and its toggle are green while spend-so-far is under that
line's value, red once over (Adj. Income compares against its un-clamped value, so a £0-clamped
line reads red); labels sit at the left end, later ones sliding right past earlier ones when the
lines run close. The hover tooltip
also breaks the day's cumulative down by group, each row with its own smaller day-delta; a
grouping donut that explodes a group into its categories on click
(`GroupingDonut`) — hovering a group slice or its legend row shows the same column-aligned
breakdown box as the bars below: the group's categories, each with its total and its % of the
group; and "vs last month" bars — each row (group, expandable to its categories) fills
toward 100% of *its own* last-month total, green under / red over (`ComparisonBars`,
`comparison.comparePct`); hovering a group row (or the Total row) shows a column-aligned
breakdown box — its categories (or the groups), each with this month's total and its own
vs-last %, matching the running chart's tooltip.

Every Overview summary surface (the totals above, the running chart, the donut, the bars, and
Trends below) shares one category/group show-hide filter: an "All" + saved-**View** button row
(the currently-active preset is highlighted), plus a "Categories ▾" toggle that unfolds an inline
filter section (it stays open until closed, not a dropdown): a master select/deselect-all tick +
per-group ticks, with the categories as CategoryGrid-style connected buttons — pressed = shown
(`components/CategoryVisibilityPanel.tsx`; both controls live in `App.tsx`, threaded down as a
`hiddenCategoryIds` prop). A View is a named, saved
preset of that filter — create/rename/edit/delete them from Manage → **Views** (its own tab,
capped at 4), or save the live ad hoc filter directly from Overview: when the checklist selection
matches no existing View (and the cap isn't hit), a "save as View" affordance appears next to
"Categories ▾". The filter always starts at "All" (no default exclusion) each session — Net
Balance's money is the one thing it never touches.

**Trends** (`features/OverviewTrends.tsx`) has two sections sharing one month range (default
last 6 months; custom From/To picker in the matrix header) and the same shared category filter
as Month:

- **Spend by month** (`charts/TrendsBars.tsx`) — a stacked per-month bar chart in the running
  chart's visual language: group colours/stack order matching the donut, and two pill toggles —
  **Avg. Spend** (on by default; a dotted line averaging *complete* months only, so a
  half-finished current month doesn't drag it down; the pill carries the value, so the chart
  needs no on-bar labels) and **Income** (off by default; a dashed step at each month's own
  resolved income, each step green while that month's bar is under it, red once over).
  Hovering a bar shows the running-chart-style breakdown box: month, total, ±delta vs the
  previous month (green up / red down, matching the matrix arrows), then per-group rows with
  their own deltas (the first month compares against the month before the range).
- **Category × month** heat matrix (`charts/TrendsMatrix.tsx`, `core/trends.ts`): cell colour
  is a **per-row** heatmap (which months were heaviest for that row), with an inline signed
  `±%` vs the previous month; near-flat rows are muted; groups expand to categories — a group
  with only one visible category (e.g. after filtering) can't expand, so its row shows that
  category's name and colour instead of the group's.

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
  lists** (list editing reuses `ListForm`); a category filter — the same "Categories ▾"
  unfolding multi-select panel as Overview (`CategoryVisibilityPanel`, pressed = shown; a list
  row matches while any of its categories is shown) + note/item search. A search stays
  scoped to the picked month by default — the term persists while browsing months (arrows /
  picker) — with a "This month / All months" toggle for finding an entry whose month is unknown
  (all-months hides the month picker). Deletes use a two-click arm/confirm.
- **Taxonomy** (`ManageTaxonomy.tsx`) — add / rename / move / delete categories and groups.
  Deleting a category in use reassigns its rows first (Invariant 3). Changes apply retroactively
  across all history, since entries reference categories by id.
- **Views** (`ManageViews.tsx`) — named, saved show/hide presets (max 4) used by Overview's
  category filter; a View just stores which category ids are hidden, so deleting one is a plain
  row delete (no reassignment needed).
- **Database** (`DatabaseTools.tsx`, **desktop only**) — Export (save a copy of `budget.db`) and
  Import (replace all data with a chosen `budget.db`). Hidden in the browser build.

Refunds/returns are handled here by editing or deleting the original entry.
