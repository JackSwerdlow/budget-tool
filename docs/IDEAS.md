# Budget Tool — Ideas

> A store of possible features, changes, and refactors — **not** a roadmap or a commitment.
> Nothing here is "the spec": entries are candidates, may never be built, and carry **no
> priority** (order/grouping is for scanning, not ranking). An entry **graduates out** when it
> ships (described in the Map, removed here) or when you drop it. New ideas go in on **your**
> endorsement, not an agent's unprompted suggestion. Grouped by area for quick overlap-scanning;
> format: `title — note (context / why-not-yet)`.

## Add / entry

- Recurring / auto-filled entries — Rent/Bills/Subs templates. Bills vary and subs change, so a "confirm a pre-filled monthly checklist" form is safer than naive auto-fill.
- Per-entry cost sharing beyond itemised lists — flatmate share on ordinary entries, not just grocery lists.

## Overview / analysis

- Seasonal / yearly view — year-over-year, summer-vs-winter trends. Parked: not enough data yet.
- Optional per-category target — a user-set number shown next to actual spend (display only; no enforcement/rollover). Note: partly overlaps the existing "vs last month" baseline — weigh whether it adds signal or competes with it.
- Configurable widget dashboard — let the user pick which charts/summaries appear on Overview instead of the fixed layout. Heaviest of these for the least obvious payoff on a single-user tool.

## Salary

- Employment-gap marker — a way to mark a period as "not employed" so the brought-forward salary stops filling it. Since inheritance now fills every month from the first config forward (Summary forecast, Lifetime, and the student-loan tracker all carry the last salary forward), there's no way to represent an actual break in employment — a gap between two saved salaries is filled with the earlier one. Would need an explicit "no salary this period" config state that the core walk (`resolveEmploymentStart` / `computeSalaryYTD` / `walkMonths`) treats as a hard stop, not an inherit.
- Unpaid-days-off effective rate — display-only effective daily/hourly rate for days actually worked; must never affect tax/NI/SL. Data model supports it.

## Data

- Improve the data export — the shipped CSV/JSON export (Manage → Export) is a first pass kept as-is for now; revisit its format, columns, and scope after real use.
- Savings / net-worth / balance carry-forward — a heavier money layer beyond the light Net Balance.

## Style / IA

- Sidebar nav + persistent summary figures — replace the top tabs with a left sidebar that also surfaces key balances/figures at all times.

## Desktop

- Code signing / notarization — unsigned installers warn on first run (SmartScreen / Gatekeeper).
