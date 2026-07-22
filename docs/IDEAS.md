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

- **Tabs + month picker on one row.** The compacted MonthPicker still wraps *below* the view tabs at ~360px because the left group (Segmented + View buttons + Categories toggle + "save as View") fills the `flex-wrap` row, so the month control drops to a second line. Want: the view sub-tabs and the month picker guaranteed on the **same** row — tabs left, month picker right — restructuring the bar (e.g. a fixed two-slot row) so the month control can't wrap under the tabs.
- **Scroll bounce near the top.** `useHideOnScrollUp` hides the bar via a fixed 80px pixel threshold that doesn't match where the bar actually becomes stuck. Scrolling up near the top applies the hide-transform (translateY) even though the bar's natural non-sticky flow position is still in view → a visible gap, then a "bounce" when crossing the threshold. Want: apply the hide **only once the bar is genuinely stuck** (its natural position has scrolled above the viewport top); when not stuck, no transform at all — the bar just flows with the page beneath the "Budget Tool" title. Replace the pixel threshold with stuck-detection (a sentinel element + IntersectionObserver, or measuring the bar's document offset). Keep the hide-on-scroll-up once genuinely stuck.
- **Closing Categories hides the whole bar.** Bar visibility is currently `barHidden && !showFilter`; closing the Categories panel (`showFilter` → false) while `barHidden` is true makes the bar vanish until the next scroll-down. Want: toggling the filter must never change bar visibility — it should follow only the scroll/stuck state. (Likely falls out of the stuck-detection rework, but verify explicitly.)
- **View-preset buttons wrap; want a space-budgeted row.** The All / saved-view buttons sit in a `flex-wrap` group with no width control, so long names push buttons to a second line. Want a single non-wrapping row budgeted like a segmented control: **no minimum** button width (shrink to fit text when there's room); the **selected** button always shows its full name; non-selected buttons fit to their text if they all fit, otherwise are forced to equal width (remaining width ÷ count) with text **truncated** ("Groc…"); enforce a **max** width with ellipsis. Selecting a button expands it to full text and recomputes the others' equal max width.
- **Sticky bar in every tab (not just Overview).** Want the sub-tab (+ optional month picker) row sticky — with the one-row + stuck-detection behaviour above — on **all** tabs: Add (sub-tabs Single/List/Monthly, no month), Salary (Summary/Lifetime/Config + month; currently a non-sticky month row above a separate Segmented, `Salary.tsx:176-195`), and Manage (its sub-tabs + month where applicable — verify structure). If a tab has no month picker, show just the sub-tabs. Likely means extracting the sticky bar into a shared component/slot each tab feeds its sub-tabs + optional month picker into.
- **Trends row: Categories vs range picker stack.** On the Trends sub-tab the Categories toggle and the month-range picker wrap onto separate lines. Want them on one row: Categories pinned left, the range picker aligned to the far **right** (justify-between).

### Swipe between sub-tabs

- **Doesn't fire at all on device.** Even after moving to pointer events, no swipe registers on the phone. Same root as the scrub: with no `touch-action`, the browser claims the horizontal drag for scrolling and fires `pointercancel` instead of the `pointerup` the swipe detection needs; plus most of Overview is chart area marked `data-noswipe`. Want a reliable horizontal swipe to change sub-tab, designed **together with the scrub** as one touch-gesture layer (touch-action discipline, early horizontal-intent detection). Reconsider `data-noswipe` on charts once the scrub is long-press-gated (a short horizontal flick that isn't a long-press could be a swipe); consider an edge-swipe fallback if chart coverage is still a problem.

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

- Sidebar nav + persistent summary figures — replace the top tabs with a left sidebar that also surfaces key balances/figures at all times. (The mobile control bar is now sticky; this larger idea — a persistent sidebar surfacing balances — is still open.)

## Desktop

- Code signing / notarization — unsigned installers warn on first run (SmartScreen / Gatekeeper). (Android is signed locally with the personal keystore; CI APK publishing deliberately not set up — see MOBILE.md.)
