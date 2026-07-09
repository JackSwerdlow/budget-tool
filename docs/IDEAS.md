# Budget Tool — Ideas

> A store of possible features, changes, and refactors — **not** a roadmap or a commitment.
> Nothing here is "the spec": entries are candidates, may never be built, and carry **no
> priority** (order/grouping is for scanning, not ranking). An entry **graduates out** when it
> ships (described in the Map, removed here) or when you drop it. New ideas go in on **your**
> endorsement, not an agent's unprompted suggestion. Grouped by area for quick overlap-scanning;
> format: `title — note (context / why-not-yet)`.

## Add / entry

- Per-entry cost sharing beyond itemised lists — flatmate share on ordinary entries, not just grocery lists.

## Overview / analysis

- Seasonal / yearly view — year-over-year, summer-vs-winter trends. Parked: not enough data yet.
- Optional per-category target — a user-set number shown next to actual spend (display only; no enforcement/rollover). Note: partly overlaps the existing "vs last month" baseline — weigh whether it adds signal or competes with it.
- Configurable widget dashboard — let the user pick which charts/summaries appear on Overview instead of the fixed layout. Heaviest of these for the least obvious payoff on a single-user tool.

## Salary

- Unpaid-days-off effective rate — display-only effective daily/hourly rate for days actually worked; must never affect tax/NI/SL. Data model supports it.

## Mobile

> Phone-width / touch fixes to the shared `apps/web` build. Each is gated behind the existing
> seams — Tailwind `sm:`, the `<480px` compact chart frame, or `pointerType === 'touch'` — so the
> desktop-width web view is unchanged; verify them in a ~360px browser viewport (DevTools device mode).

- Chart tap-tooltip covers the chart — on touch the breakdown box (`CursorBreakdownBox` / `useCursorPos` in the chart kit) is revealed by a tap and drawn *over* the chart at the tap point, hiding most of it. Reveal on press-and-hold and render it in a fixed slot above/below the chart instead. Shared kit change → affects every Overview/Trends chart; desktop mouse-hover stays as-is.
- Sankey touch behaviour — (a) a node/ribbon tap fires both the drill-in (`onClick`) and the hover box (`onPointerDown`), so tapping a group expands it *and* pops the tooltip; split so touch reveals the breakdown without also expanding (pairs with the tap-tooltip fix above). (b) compact two-line labels drift out of alignment with their nodes at phone width.
- Salary tables cramped on mobile — `RateStrip` / `BreakdownTable` are 7-column `w-full` tables whose money columns overlap at ~360px. Trading-212-style: at base width show one range at a time (toggle Yearly / Monthly / Weekly / …); keep the full table from `sm` up.
- Swipe between sub-tabs — left/right swipe to move across Overview's Month/Trends/Items (and Add's Single/List/Monthly). Touch-only gesture; new interaction.
- Pinned view/category control on mobile — the Segmented view toggle + View buttons + Categories filter scroll away with the page (only the tab bar is fixed). Make that control bar sticky at base width. Small-scope cousin of the *Sidebar nav + persistent summary figures* entry under Style / IA — decide whether it's a standalone sticky header or the first slice of that.
- Trends matrix cramped on mobile — only ~3 month columns fit before horizontal scroll (`minmax(72px,…)` cols + a `38vw` label column), and each cell's `absolute w-8` up/down arrow (up to 24px) overlaps the £/% text. Rethink cell density, arrow placement, and how many months fit at phone width.

## Data

- Improve the data export — the shipped CSV/JSON export (Manage → Export) is a first pass kept as-is for now; revisit its format, columns, and scope after real use.
- Savings / net-worth / balance carry-forward — a heavier money layer beyond the light Net Balance.

## Style / IA

- Sidebar nav + persistent summary figures — replace the top tabs with a left sidebar that also surfaces key balances/figures at all times. (See the *Pinned view/category control on mobile* entry under Mobile — a small-scope phone slice of this.)

## Desktop

- Code signing / notarization — unsigned installers warn on first run (SmartScreen / Gatekeeper). (Android is signed locally with the personal keystore; CI APK publishing deliberately not set up — see MOBILE.md.)
