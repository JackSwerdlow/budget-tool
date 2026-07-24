# Budget Tool — Ideas

> A store of possible features, changes, and refactors — **not** a roadmap or a commitment.
> Nothing here is "the spec": entries are candidates, may never be built, and carry **no
> priority** (order/grouping is for scanning, not ranking). An entry **graduates out** when it
> ships (described in the Map, removed here) or when you drop it. New ideas go in on **your**
> endorsement, not an agent's unprompted suggestion. Grouped by area for quick overlap-scanning;
> format: `title — note (context / why-not-yet)`.

## Add / entry

- Per-entry cost sharing beyond itemised lists — flatmate share on ordinary entries, not just grocery lists.
- Add → Monthly, properly — the checklist works for a stable set of bills but has no notion of an item's *life*, so it degrades as the set changes. The headline problem and its neighbours:
  - **Retiring a template.** `recurringChecklist` derives status per month from a `recurring_months` row, and a template with no row is *due* — so a cancelled sub is due **every month forever** and the only ways out are pressing "skip" again each month or deleting the template (framed as fixing a mistake, though it does keep past entries). Wants an **active span** on the template — an end month, probably a start month too so a sub that began in March doesn't read as un-actioned for all history — after which it drops off the checklist entirely and stops counting toward "x of y done". Past months keep their confirmed/skipped record. Schema column on `recurring_templates` + both data paths (see the `add-data-operation` skill).
  - **"Skip" should be able to mean "and from here on"** — the same gesture that skips this month offers to close the span at that month, since that's usually what a skip is telling you.
  - **Non-monthly cadences** — annual (insurance, domains) and quarterly items can't be templated at all today; they'd read as due 11 months out of 12.
  - **Amount drift at confirm time** — the row prefills from the last confirmed month but says nothing about the change; a bill £14 up on last month should say so before you confirm it.
  - **Reordering** — `sort_order` exists on the row and is set on insert, but no UI can change it.
  - **Phone layout** — a checklist row is a `flex-wrap` of name · category · date · £ · Confirm · skip, which wraps to three ragged lines at 360px.
- Add → List on a phone — under `lg` (not `sm`, so small laptops get it too) a row collapses to a 2-column grid of *unlabelled* boxes — the column header row is `lg:grid` only — so qty/price/share/category are identified by position alone, and a 20-item shop is a long stack of them. Wants a mobile shape of its own: per-field labels or a compact "line item" card, a thumb-reachable share control (the ½ button is a 10px target), and a way to review the list without scrolling past every input.

## Overview / analysis

- Seasonal / yearly view — year-over-year, summer-vs-winter trends. Parked: not enough data yet.
- Optional per-category target — a user-set number shown next to actual spend (display only; no enforcement/rollover). Note: partly overlaps the existing "vs last month" baseline — weigh whether it adds signal or competes with it.
- Configurable widget dashboard — let the user pick which charts/summaries appear on Overview instead of the fixed layout. Heaviest of these for the least obvious payoff on a single-user tool.
- Item unit-price history as a first-class chart — the in-row chart in Items (`ItemDetail` in `OverviewItems.tsx`) has the kit frame, the £ grid, the scrub gesture and a hover box, but stops short of the running chart's language: no `LineToggle` pills for reference lines (first price, mean unit price, the item's own category average?), and no second series, so "unit price" and "what I actually spent on it" can't be read together. The sharper flaw is the x-axis: it's **purchase index**, not time (`x = i/(n−1)`), so five buys in one week and one a year later come out evenly spaced and the slope lies. A real month axis (shared with the rest of the Overview's charts) would also let it sit under a Trends-style range. Pairs with the student-loan sparkline below — same treatment, same kit.
- Reach every Items sort key on a phone — sorting lives on the column headers, and three columns (`bought` / `drift` / `your-share`) are `hidden sm:block`, so their sort buttons don't exist under `sm`: a phone can only sort by Item, Last unit and Total. Wants a sort control that isn't a header — a "Sort ▾" chip row or a small sheet listing all six keys with direction — so "which item has drifted most?" is answerable on the device the shop is entered on.
- Card the Trends sections — Month wraps each chart in a `Panel` (bordered card on `bg-panel`); Trends stacks its four sections bare in a `space-y-8`, so the tabs read as two different apps and long charts run together with nothing to bound them. Card the bars / lines / matrix / sankey the same way. Watch the matrix's horizontal scroll and the sankey's measured viewBox — both currently size against the full content width, and the mobile ones are tight already.
- Put the figure on the Trends bars' Income pill — the Avg. Spend pill carries its value (`Avg. Spend: £1,240`), which is why the chart needs no on-bar labels; the Income pill is a bare "Income" because income resolves **per month** and there's no single number to print. Decide what it should say — average income over the range reads best next to Avg. Spend, though "latest" or the range total are defensible — or give each step its own small end-label instead. Same question applies to the running chart's income lines, which label at the left end.

## Salary

- Unpaid-days-off effective rate — display-only effective daily/hourly rate for days actually worked; must never affect tax/NI/SL. Data model supports it.
- Student-loan balance history as a first-class chart — `BalanceSparkline` is a bespoke fixed 640×64 SVG: no `useChartFrame` (so it never measures its container), no `moneyScale` grid or £ axis, no month labels along the bottom, and its own inline pointer handlers rather than the shared `useScrubGesture`, so it's the one chart without press-and-hold scrubbing on Android. Rebuild it on the chart kit like the running chart: £ grid, month axis, the shared scrub + breakdown box, and `LineToggle` pills for the lines that matter — the declared anchor balance, the payoff projection the tracker already computes, maybe a no-extra-payments counterfactual. Keep two things it gets right deliberately: the **min→max y-axis** (a £60 payment is invisible against £40k on a zero-based scale) and up = red / down = green. A stacked fill splitting interest accrued vs repaid, in the running chart's manner, would answer "am I outrunning the interest?" at a glance. Pairs with the item-history chart above.

## Data

- Improve the data export — the shipped CSV/JSON export (Manage → Export) is a first pass kept as-is for now; revisit its format, columns, and scope after real use.
- Savings / net-worth / balance carry-forward — a heavier money layer beyond the light Net Balance.

## Style / IA

- Sidebar nav + persistent summary figures — replace the top tabs with a left sidebar that also surfaces key balances/figures at all times. (On a phone the title row and control bar are now pinned above self-scrolling panels; this larger idea — a persistent sidebar surfacing balances — is still open, and is really a desktop-shape question.)

## First run / shipping

- Ship-ready defaults — the app currently boots into *one particular person's* assumptions. Nothing here is wrong for the current user; it's the work between "my tool" and "a tool someone else could install". The pieces:
  - **The seed taxonomy.** 5 groups / 15 categories, hardcoded — including Nicotine, Food In/Out, Supplements. Fully editable via Manage, so this is a *starting point* question, not a lock-in: keep it as-is, offer a first-run choice (a neutral starter set / this set / start empty), or ship empty behind a guided setup. Note the wrinkle: the seed exists **twice** — `apps/api/src/seed.ts` and a `WHERE NOT EXISTS` SQL block in `db.rs` — so any change is two edits kept in step.
  - **Tax figures as presets.** `EMPTY_CONFIG_FIELDS` (`salaryState.ts`) pre-fills one tax year's statutory values into a blank Config; a new tax year means retyping ~12 fields. Wants **preset buttons** — a tax-year preset (bands, rates, NI thresholds, allowance) and **student-loan plan presets** (Plan 1 / 2 / 4 / 5 / Postgrad thresholds, rates, and the VIR income thresholds), so switching is one click. Two hard constraints: a preset is **data typed into the same fields**, never a code path around the payslip-validated `calcSalary` (see SALARY.md); and applying one must not silently rewrite months already saved. Also decide what "current year" means when the app is opened in a year nobody has added a preset for — a stale preset presented as fact is worse than a blank field. Care needed with the allowance in particular: the shipped `12579.12` is deliberately the payslip-derived, evenly-divisible-by-12 figure, not the statutory £12,570 — a preset table must carry the reasoning, not just the round number.
  - **The empty-state path.** Overview has its welcome card, but a fresh install has no income, no salary config and no categories the user chose — worth walking end-to-end once as a stranger and fixing what that surfaces (and deciding whether the demo seed, `seed-demo.ts`, should be reachable from the UI as a "show me what this looks like full" button).

## Desktop

- Code signing / notarization — unsigned installers warn on first run (SmartScreen / Gatekeeper). (Android is signed locally with the personal keystore; CI APK publishing deliberately not set up — see MOBILE.md.)
