# Budget Tool — Ideas

> A store of possible features, changes, and refactors — **not** a roadmap or a commitment.
> Nothing here is "the spec": entries are candidates, may never be built, and carry **no
> priority** (order/grouping is for scanning, not ranking). An entry **graduates out** when it
> ships (described in the Map, removed here) or when you drop it. New ideas go in on **your**
> endorsement, not an agent's unprompted suggestion. Grouped by area for quick overlap-scanning;
> format: `title — note (context / why-not-yet)`.

## Add / entry

- Recurring / auto-filled entries — Rent/Bills/Subs templates. Bills vary and subs change, so a "confirm a pre-filled monthly checklist" form is safer than naive auto-fill.
- Item memory / autocomplete-with-last-price — typing an item name suggests it and its last saved price. Cheap: `list_items` already store name + price + date.
- Number-key category quick-pick — 1–9 / arrow-to-highlight in Add·Single (only type-to-filter + Enter exists today).
- Per-entry cost sharing beyond itemised lists — flatmate share on ordinary entries, not just grocery lists.

## Overview / analysis

- Cross-time item-level analytics — "how much on milk this year?", item price drift over time. Item rows are persisted for exactly this.
- Seasonal / yearly view — year-over-year, summer-vs-winter trends. Parked: not enough data yet.
- L2 pacing view — spend-to-date vs the *same day* last month (a fairer like-for-like than vs last month's full total).
- Sankey / flow view — net pay flowing into the month's categories. Pure re-visualisation of existing numbers (no new logic); bridges the Salary take-home and the ledger.
- Per-category show/hide toggle on the trends matrix — generalise the existing incl/excl-Rent toggle into show/hide for any row.
- Optional per-category target — a user-set number shown next to actual spend (display only; no enforcement/rollover). Note: partly overlaps the existing "vs last month" baseline — weigh whether it adds signal or competes with it.
- Configurable widget dashboard — let the user pick which charts/summaries appear on Overview instead of the fixed layout. Heaviest of these for the least obvious payoff on a single-user tool.

## Manage / entries

- Multi-select + bulk edit of entries — select several rows and recategorise/delete in one go.
- Saved / reusable filters — persist a category/note/amount filter (the across-months search exists, but filters aren't saved).

## Salary

- Employment-gap marker — a way to mark a period as "not employed" so the brought-forward salary stops filling it. Since inheritance now fills every month from the first config forward (Summary forecast, Lifetime, and the student-loan tracker all carry the last salary forward), there's no way to represent an actual break in employment — a gap between two saved salaries is filled with the earlier one. Would need an explicit "no salary this period" config state that the core walk (`resolveEmploymentStart` / `computeSalaryYTD` / `walkMonths`) treats as a hard stop, not an inherit.
- Unpaid-days-off effective rate — display-only effective daily/hourly rate for days actually worked; must never affect tax/NI/SL. Data model supports it.
- Student-loan plan-type presets — Plan 1/2/4/5 threshold & rate presets (fields are free-form today).
- Student-loan mini-table / sparkline — per-month balance series on the tracker box (the series is already computed).

## Data

- CSV / JSON export — a portable, per-table export (and a browser path). A full-`.db` backup/restore already exists, but desktop-only.
- Savings / net-worth / balance carry-forward — a heavier money layer beyond the light Net Balance.

## Style / IA

- Sidebar nav + persistent summary figures — replace the top tabs with a left sidebar that also surfaces key balances/figures at all times.

## Tech debt / tooling

- Turn "add a data operation" into a skill — the both-adapters + parity recipe as an on-demand skill, to keep CLAUDE.md lean.

## Desktop

- Replace default Tauri icons — installers currently ship the placeholder icons.
- Code signing / notarization — unsigned installers warn on first run (SmartScreen / Gatekeeper).
