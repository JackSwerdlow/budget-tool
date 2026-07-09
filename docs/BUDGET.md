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
- **Recurring item** (a monthly template — rent, bills, subs) — a name, one category, and a
  default amount. It never holds spend itself: confirming it for a month writes a normal
  **Entry** (see Add → Monthly), linked via a per-month row so the checklist knows what's done.
- **Taxonomy** — categories grouped under top-level groups, **one category per entry**.
  Seeded with a default 5 groups / 15 categories but fully customisable via Manage.
- **Income** — a light per-month figure feeding Net Balance; populated by the Salary tab
  (see [SALARY.md](SALARY.md)).

Core model + math: `packages/core` (`ledger`, `list`, `shares`, `comparison`, `trends`,
`netBalance`, `money`, `time`).

## Overview

The calm, read-mostly home, with a **Month**, a **Trends**, and an **Items** view
(`features/OverviewMonth.tsx`, charts in `apps/web/src/charts/`; the shared
frame/£-axis/breakdown-box primitives they draw with live in `charts/kit.ts` +
`charts/kitComponents.tsx`).

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
vs-last %, matching the running chart's tooltip; and a **Money flow** sankey
(`charts/FlowSankey.tsx`) — when the salary engine's net pay for the month exactly equals the
recorded income (true by construction for months saved via the Salary tab; it fetches
`getAllSalaryConfigs` and reruns `calcSalary` client-side), the month reads as a payslip-to-
ledger flow: **Gross pay** (left) splits into the deduction stubs (Pension / Income tax /
National Ins. / Student loan, a quiet warm-neutral ramp; zero-value ones dropped) and **Net
pay** (middle), which fans out into the month's groups (right, donut colours/order). One-off
**untaxed income** (gifts) rides alongside as a second green left-column source feeding Net pay,
so Gross pay stays true payroll earnings (a £0-gross gift month reads simply as Untaxed → Net pay
→ groups). A month
whose income doesn't reconcile (hand-edited, or no config) falls back to a two-column Net pay →
groups flow rather than drawing a join that doesn't add up. Income − spend shows as a green
**Left over** band; a month that spent past its income instead gets a red **From savings**
source beside Net pay filling the difference (a group's ribbon can straddle both sources). The
middle and spend columns are top-aligned (spend hangs from Net pay's top edge) so the
deduction-label zone stays ribbon-free. Clicking a group drills it into its categories in place
(donut-style; "‹ all groups" collapses); hover boxes: a group shows its category make-up, Net
pay shows where it all went (each row's % is its share of net pay, so an overspent month's rows
sum past 100%), Gross pay shows the payslip split. Like Net Balance it is real money — the one
Month chart the category filter never touches (a header note says so while a filter is active),
since hidden spend would otherwise masquerade as left over.

Every Overview summary surface (the totals above, the running chart, the donut, the bars, and
Trends below) shares one category/group show-hide filter: an "All" + saved-**View** button row
(the currently-active preset is highlighted), plus a "Categories ▾" toggle that unfolds an inline
filter section (it stays open until closed — **Esc** also dismisses it, here and in Manage,
along with the save-as-View form — not a dropdown): a master select/deselect-all tick +
per-group ticks, with the categories as CategoryGrid-style connected buttons — pressed = shown
(`components/CategoryVisibilityPanel.tsx`; both controls live in `App.tsx`, threaded down as a
`hiddenCategoryIds` prop). A View is a named, saved
preset of that filter — create/rename/edit/delete them from Manage → **Views** (its own tab,
capped at 4), or save the live ad hoc filter directly from Overview: when the checklist selection
matches no existing View (and the cap isn't hit), a "save as View" affordance appears next to
"Categories ▾". The filter always starts at "All" (no default exclusion) each session — Net
Balance's money is the one thing it never touches.

**Trends** (`features/OverviewTrends.tsx`) has three sections sharing one month range (default
last 6 months; custom From/To picker — `features/TrendsRangePicker.tsx` — lives in the page
header next to the view switcher, in the same slot Month's month picker uses, since it drives
all three sections below) and the same shared category filter as Month. Clicking a bar (or a
matrix month-header) opens that month in the Month view:

- **Spend by month** (`charts/TrendsBars.tsx`) — a stacked per-month bar chart in the running
  chart's visual language: group colours/stack order matching the donut, and two pill toggles —
  **Avg. Spend** (on by default; a dotted line averaging *complete* months only, so a
  half-finished current month doesn't drag it down; the pill carries the value, so the chart
  needs no on-bar labels) and **Income** (off by default; a dashed step at each month's own
  resolved income, each step green while that month's bar is under it, red once over).
  Hovering a bar shows the running-chart-style breakdown box: month, total, ±delta vs the
  previous month (green up / red down, matching the matrix arrows), then per-group rows with
  their own deltas (the first month compares against the month before the range).
- **Category trend** (`charts/TrendsLines.tsx`) — one line per group (donut colours/order)
  across the range, so rising/falling spend is readable as slope where the stacked bars
  above only show composition. Clicking a group's line or legend chip drills into that
  group's category lines in place (donut/sankey drill pattern; "‹ all groups" collapses,
  and a filter change that empties the drilled group falls back to the groups view).
  Hovering a legend chip or line emphasises it; hovering a month shows a crosshair, dots,
  and the bars' breakdown box (per-series values + vs-last-month deltas, sorted desc).
  The segment into the half-finished current month is dashed so the tail-off reads as
  incomplete data, not a collapse.
- **Category × month** heat matrix (`charts/TrendsMatrix.tsx`, `core/trends.ts`): cell colour
  is a **per-row** heatmap (which months were heaviest for that row), with an inline signed
  `±%` vs the previous month; near-flat rows are muted; groups expand to categories — a group
  with only one visible category (e.g. after filtering) can't expand, so its row shows that
  category's name and colour instead of the group's.

**Items** (`features/OverviewItems.tsx`, `core/items.ts`) is cross-time item analytics over the
persisted list-item rows ("how much on milk?"): a searchable table of every item ever bought
(grouped case-insensitively; latest casing wins) — times bought, last unit price, unit-price
**drift** (latest vs first, red up / green down), full total and your-share total. Every column
header is sortable (click cycles desc ▼ → asc ▲ → none; "none" falls back to total-spend
order); the view starts with **Total** sorted desc. Under `sm` only **Item · Last unit ·
Total** show (six money columns would starve the item name on a phone); the rest — bought,
drift, your-share — return from `sm` up and stay reachable via the row detail. Top 15 by
default ("Show all" expands; searching always searches everything). Clicking a row opens the
item's unit-price history: a
stepped kit-frame chart, one dot per purchase, hover for the date/qty/price. Uses the same
shared category filter as Month/Trends; analysis only — the ledger itself is untouched.

All the kit-frame charts share a **dynamic money y-axis** (`kit.moneyScale`, tested): the
gridline step is the smallest "nice" value (1/2/5 × a power of ten) keeping the chart to ≤6
intervals — a full month lands on the familiar £500 grid, a filtered-down month on £100, a
cheap item's history on pennies (sub-£1 grids label ticks at 2dp). An empty chart keeps the
£0–£500 frame.

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
  highlighted suggestion, **Tab** fills it and then advances to Qty as normal. A "Start from"
  picker (recent 8 lists) seeds the form with a past list's items **dated today** — the weekly
  shop rarely changes much, so most rows just need a price check; Clear returns to a blank form.
- **Monthly** (`features/AddMonthly.tsx`, checklist math in `core/recurring.ts`) — a
  confirm-a-pre-filled checklist for the spends that arrive every month (rent, bills, subs).
  Each **recurring item** is a template (name, category, default amount); a month shows every
  item as *due*, *confirmed* (✓ with its entry's date and amount), or *skipped this month*
  (struck through), with an "x of y done" count. Confirming writes a **normal entry** — amount
  prefilled from the **last confirmed month's** amount (bills vary; falls back to the template
  default), date editable (today, or the 1st when browsing another month), Enter confirms —
  so every view/export sees it like any hand-typed spend; the entry's note carries the item
  name when it differs from the category name. The template↔entry link lives in
  `recurring_months` (one row per item×month; `entry_id` NULL = skipped): undoing a
  confirmation is just deleting its entry (row ✕, or later via Manage) — the FK cascade
  returns the item to due — and re-confirming an already-confirmed month is rejected outright,
  so a double count can't happen. "edit items" flips the checklist into template management
  (rename / recategorise / change default / two-click delete / add); deleting a template keeps
  its past entries, and templates count as category usage for Manage's reassign-on-delete.

## Manage

`features/manage/` — quieter "back of house", with four areas:

- **Entries** (`ManageEntries.tsx`) — a date-grouped stream; edit or delete past **entries and
  lists** (list editing reuses `ListForm`); a category filter — the same "Categories ▾"
  unfolding multi-select panel as Overview (`CategoryVisibilityPanel`, pressed = shown; a list
  row matches while any of its categories is shown) + note/item search. A search stays
  scoped to the picked month by default — the term persists while browsing months (arrows /
  picker) — with a "This month / All months" toggle for finding an entry whose month is unknown
  (all-months hides the month picker). Deletes use a two-click arm/confirm. An **Edit Multiple**
  toggle enters multi-select mode: tick entry rows (whole row is the click target; "Select all
  shown" respects the current filter/search), then recategorise or delete the selection in one go —
  bulk ops loop the existing per-entry operations, so no new data operation. Lists stay
  per-row (they hold many categories).
- **Taxonomy** (`ManageTaxonomy.tsx`) — add / rename / move / delete categories and groups.
  Deleting a category in use reassigns its rows first (Invariant 3). Changes apply retroactively
  across all history, since entries reference categories by id.
- **Views** (`ManageViews.tsx`) — named, saved show/hide presets (max 4) used by Overview's
  category filter; a View just stores which category ids are hidden, so deleting one is a plain
  row delete (no reassignment needed).
- **Export** (`ExportData.tsx`, below the tabs on every Manage screen) — portable data exports
  built client-side from the loaded ledger (`lib/export.ts`, tested): **CSV** (one
  spreadsheet-ready row per entry, list item, and delivery fee, using the same per-item share
  maths as the ledger so the my-share column sums exactly) and **JSON** (a full structured
  dump with a format marker). The browser downloads a file; the desktop app saves via dialog +
  a `save_text_file` Rust command.
- **Database** (`DatabaseTools.tsx`, **desktop only**) — Export (save a copy of `budget.db`) and
  Import (replace all data with a chosen `budget.db`). Hidden in the browser build.

Refunds/returns are handled here by editing or deleting the original entry.
