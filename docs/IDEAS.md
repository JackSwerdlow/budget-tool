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

## Mobile — round 2 (device testing on the 0.2.2 APK)

> Issues found running the signed 0.2.2 APK on a real phone; they refine the mobile pass already
> shipped (sticky bar, chart inspect strip, swipe, sankey). The **shared touch-gesture layer** the
> gesture bugs all needed now exists — zoom disabled app-wide, `touch-action`/`user-select`
> discipline and press-and-hold arming in `apps/web/src/lib/useScrubGesture.ts` (see MOBILE.md).
> What's left here should **adopt** that layer rather than reinvent it; the sankey in particular
> still runs its own overlapping pointer handlers.

### Sticky control bar

- **View-preset buttons wrap; want a space-budgeted row.** The All / saved-view buttons sit in a `flex-wrap` group with no width control, so long names push buttons to a second line. Want a single non-wrapping row budgeted like a segmented control: **no minimum** button width (shrink to fit text when there's room); the **selected** button always shows its full name; non-selected buttons fit to their text if they all fit, otherwise are forced to equal width (remaining width ÷ count) with text **truncated** ("Groc…"); enforce a **max** width with ellipsis. Selecting a button expands it to full text and recomputes the others' equal max width.
- **Trends row: Categories vs range picker stack.** Both now sit in `PinnedTabBar`'s wrapped second row (row one is the non-wrapping sub-tabs + month slot), so on the Trends sub-tab the Categories toggle and the month-range picker can still fall onto separate lines. Want them on one row: Categories pinned left, the range picker aligned to the far **right** (justify-between).

### Add — category buttons wrap with wrong corners

- `CategoryGrid.tsx:42–50` picks each button's rounded corners from its index in the flat list (first → rounded-left, last → rounded-right, middle → square). When the row wraps (`flex-wrap`), the visual first/last of each line don't match the array first/last, so a wrapped end button keeps middle-square corners and the next row's lone button gets left-square / right-round. Want corners correct per **visual row** — simplest robust fix is **uniform rounding** (all `rounded-md`, selected `rounded-full`) so wrapping can't look broken; or make the group genuinely wrap-aware.

### Sankey — redesign as a coherent tap-only model

- Currently overlapping `onPointerDown` (hover) + `onClick` (drill), no `user-select:none`, and the strip/box duality make it flaky: a long-press sometimes selects text or shows a non-persistent strip + greys sections; a single tap sometimes hovers, sometimes drills, sometimes both and mis-renders. Want a clean **tap-only** model (no press-and-hold on the sankey):
  - **Default:** everything highlighted; the summary strip shows the **Gross Pay** breakdown.
  - **Tap a section →** (a) expand it into its components if it has any; (b) highlight that section **and everything downstream of it** in the flow (Gross → everything; Net pay → the groups; a group → just itself); (c) show that section's breakdown in the summary strip.
  - After a group expands into sub-categories, the sub-category nodes are non-interactive (no new info to show) — that's fine.
  - **Tap the currently-selected section again →** return to the default (all highlighted, Gross Pay summary). **Tap a different section →** switch to it.
  - No text selection; no scrub gesture.

## Data

- Improve the data export — the shipped CSV/JSON export (Manage → Export) is a first pass kept as-is for now; revisit its format, columns, and scope after real use.
- Savings / net-worth / balance carry-forward — a heavier money layer beyond the light Net Balance.

## Style / IA

- Sidebar nav + persistent summary figures — replace the top tabs with a left sidebar that also surfaces key balances/figures at all times. (On a phone the title row and control bar are now pinned above self-scrolling panels; this larger idea — a persistent sidebar surfacing balances — is still open, and is really a desktop-shape question.)

## Desktop

- Code signing / notarization — unsigned installers warn on first run (SmartScreen / Gatekeeper). (Android is signed locally with the personal keystore; CI APK publishing deliberately not set up — see MOBILE.md.)
