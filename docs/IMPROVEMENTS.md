# Ledger — Improvement Suggestions

> **Author:** review pass, 2026-06-14 · **Reviewed against:** `docs/SPEC.md`, `docs/PLAN.md`,
> `docs/SALARY_SPEC.md`, the live demo DB (419 entries), and the rendered UI on desktop + mobile.
>
> **How to read this:** the app is already polished and coherent — this is a punch-list, not a
> rewrite. Each item has an **effort** (S / M / L) and a **scope tag**:
> - `[in-scope]` — fits the existing spec/plan, just not built yet.
> - `[net-new]` — a genuinely new idea, **not** on the deferred list; safe to consider.
> - `[⚠ near-deferred]` — borders a PLAN §9 / §10 boundary; read the note before building.
>
> Nothing in §9 (deferred) or §10 (rejected) is proposed as work — those are listed at the end
> (§10 of this doc) so it's clear they were considered and deliberately left out.

---

## 0. Salary suite — RESOLVED (historical note)

This section originally flagged a red `salary.test.ts` (10/27). That turned out to be **wrong
test expectations, not a code bug** — the engine already matched real payslips. The tests were
rewritten to be validated against an actual payslip (May 2026: taxable YTD £9,304.71 → tax YTD
£1,626.53, PAYE £983.27, net £3,562.94 — reproduced to the penny). Suite is green (151/151).

Lesson recorded for this area: **for the salary engine, a real payslip is ground truth — make
tests match the payslip-verified code, never change working code to match a test.**

---

## 1. Quick wins (high value, low effort)

| # | Fix | Where | Effort |
|---|-----|-------|--------|
| 1 | Header collides with the date block on narrow screens — add `flex-wrap` | `App.tsx:71` | S |
| 2 | Footer keyboard hints overflow off-screen on mobile (and are useless on touch) — hide below `sm` | `App.tsx:165–173` | S |
| 3 | The `+-%` cell label reads like a rendering glitch — show `new` instead | `TrendsMatrix.tsx:356, 417` | S |
| 4 | `ink-faint` body text is ~2.5:1 contrast (fails WCAG AA) — darken the token | `index.css:18` | S |
| 5 | Add a **"Today"** affordance to the month picker (arrows move, nothing resets) | `components/ui.tsx:59` | S |
| 6 | Per-month empty state — a populated history but an empty *current* month shows bare £0 cards | `OverviewMonth.tsx:19` | S |

---

## 2. Responsive / mobile (the weakest area today)

The app is built desktop-first and it shows. This matters because PLAN §2 names a **mobile app**
as the eventual target. Findings from a 390px viewport:

- **Header overlap `[in-scope]` (S).** `App.tsx:71` uses `flex items-baseline justify-between`
  with no wrap, so "14 June 2026 / last entry…" overlaps the "Ledger / A personal budget account
  book" block. Add `flex-wrap gap-y-1`, or stack the date under the title below `sm`.
- **Footer overflow `[in-scope]` (S).** The `a / o / s / m / ← →` hint row (`App.tsx:165–173`)
  runs off the right edge ("month" is clipped). These shortcuts don't apply to touch — wrap
  them in `hidden sm:flex`.
- **Trends matrix is cramped `[in-scope]` (M).** With `minmax(88px, 1fr)` columns
  (`TrendsMatrix.tsx:215`) only ~2 months fit before horizontal scroll, and the controls row
  (Expand all / 6 months / incl-excl) wraps untidily. Options: a **sticky first (label)
  column** so the row name stays visible while scrolling months; and/or a compact mobile mode
  that drops the inline `±%`/arrow and keeps just the heat + amount.
- **General audit (M).** Add-List's 7-column grid, the Salary breakdown table, and the
  comparison bars' fixed `w-32 / w-28` label/figure columns all assume desktop width. The
  Salary table already wraps `overflow-x-auto` (good); apply the same discipline elsewhere and
  do one pass at 360–414px.

---

## 3. Visual & aesthetic polish

The "Ledger" identity (Fraunces + Hanken on warm paper, oxblood accent) is genuinely
distinctive and well-executed — keep it. Refinements *within* that system:

- **Atmosphere / texture `[net-new]` (S–M).** The paper is a flat fill. A barely-there paper
  grain or a faint vignette would sell the "heirloom account book" concept the spec leans on —
  a single SVG noise overlay at ~3% opacity, no new deps. Keep it subtle; this aesthetic wins
  on restraint.
- **Animated live values `[net-new]` (M).** The whole pitch is "everything updates live"
  (header tagline, footer). A short count-up / cross-fade on the headline totals and the
  running-line endpoint when data changes would make that promise *felt*, not just true. CSS
  transitions or a tiny tween — don't reach for a library.
- **Loading states `[in-scope]` (S).** `App.tsx:113` and `Salary.tsx:360` show bare
  "Loading…" panels. A skeleton of the cards/chart would feel more finished and avoid layout
  jump on first paint.
- **Category swatches read near-black at small sizes `[in-scope]` (S).** The darkest shades
  (e.g. Rent `#3f4d36`, several Personal/Health shades) are hard to tell apart in the 8–10px
  legend/row dots, even though they're correct in the donut. Consider a slightly wider shade
  spread per group, or a hairline ring on the swatch so the hue reads at thumbnail size.
- **Running-chart "Last Month" label width is hand-computed (S).** `RunningChart.tsx:158`
  sizes the pill via `label.length * 5.35` — fragile if the font or copy changes. Measure with
  `getBBox()` or render text + a `paint-order` stroke instead of a fixed rect.

---

## 4. Functional gaps & features

- **You can't edit a saved itemised list `[in-scope]` (M).** In Manage → Entries, lists are
  **delete-only** (`ManageEntries.tsx:90`); `EntryEditor` handles single entries only. Fixing a
  mistyped receipt means deleting and re-entering the whole thing. PLAN §6.5 ("edit / delete
  past entries") implies parity. Add a list editor (it can largely reuse `AddList`'s row UI).
- **Income entry is now coupled to the full salary calculator `[in-scope]` (M).** Income was
  deliberately moved out of Manage (`cdf6fad`) and a month's income is whatever
  `breakdown.netMonthlyPence` the Salary tab computes (`Salary.tsx:303`). The Gross Pay inputs
  *do* let you back-solve from a monthly figure, but there is **no path to record a plain
  take-home / non-salary amount** (irregular income, a one-off payment, "I just know my
  take-home was £X"). Consider a lightweight manual-income override that still writes the same
  `monthly_income` row. Related: a user who never opens Salary has income = £0 everywhere, so
  Net Balance silently reads as "all expense" — worth a nudge from the Overview net-balance
  card when no income exists for the month.
- **No way to find an entry except by month `[in-scope]` (S–M).** Manage → Entries is
  month-paged only. With hundreds of rows, locating "that £200 shoes entry" means hunting
  month by month. A category/note/amount filter on the entries list would help. *(Keep it a
  filter on existing data — cross-time **item-level** analytics is deferred, §9.)*
- **CSV / JSON export `[net-new]` (S).** Note: only CSV **import** is deferred (§9) — **export
  is not**. A "download my ledger" button (and/or DB backup) is cheap, gives the user the same
  "I own my data" feeling the `.xlsx` gave them, and is a natural safety net for a local-only
  app. The core already has all the rows.
- **Number-key category selection isn't implemented `[in-scope]` (S).** PLAN §6.2 specifies
  "number-key / type-to-filter shortcuts" for Add·Single; only type-to-filter + Enter exists
  (`AddSingle.tsx:115`). Adding 1–9 quick-pick (or arrow-to-highlight) finishes the spec'd fast
  path.

---

## 5. Interaction / UX micro-details

- **Discoverability of the global hotkeys `[net-new]` (S).** `a / o / s / m` fire on a single
  keypress (`App.tsx:40–52`) but are only hinted in a footer line that's invisible on mobile. A
  `?` overlay (or a tooltip on the tabs) would surface them; it also documents the
  arrow-key month nav, which is currently undiscoverable.
- **Inconsistent delete confirmation `[in-scope]` (S).** Manage uses a blocking
  `window.confirm()` (`ManageEntries.tsx:38,43`); the Salary "Clear month" uses a nicer
  two-click arm/confirm (`Salary.tsx:315`); Add·Single's session "✕" deletes instantly with no
  confirm. Pick one pattern — the Salary arm/confirm is the most on-brand and avoids the native
  dialog that breaks the aesthetic.
- **Add·Single "Added just now" list is session-only (S).** It's component state, so navigating
  away or refreshing loses the undo affordance for entries you just made. Minor, but a
  "recently added (this month)" strip sourced from the ledger would survive navigation.

---

## 6. Accessibility

- **Contrast `[in-scope]` (S).** `ink-faint #9a8b6e` on `paper #efe6d2` ≈ **2.5:1** and
  `ink-muted #7c6f5b` ≈ **3.6:1** — both below the WCAG AA 4.5:1 floor for normal text.
  They're used widely for labels, dates, axis ticks, and the footer. Darken `ink-faint`
  (and/or reserve it for large/bold text only). This is the single highest-impact a11y fix.
- **Colour-only signals (S–M).** The comparison bars lean on red/green fill + colour-coded
  `%` (`ComparisonBars.tsx`). The text `%` is a secondary cue (good), but for
  deuteranopia/protanopia the under/over distinction is weak. The Trends matrix handles this
  well already (signed arrows do the work) — bring a small ▲/▼ or under/over glyph to the
  comparison bars too.
- **Matrix cell detail is mouse-only (S).** Per-cell figures live in `title=` attributes
  (`TrendsMatrix.tsx:317`) — not keyboard- or touch-reachable. A tap/focus popover would make
  the detail available everywhere (and is needed for mobile anyway).

---

## 7. Code health / maintainability

- **Design tokens are bypassed in the matrix `[in-scope]` (S–M).** PLAN §2.1/§6 make CSS
  custom properties the single source of truth, but `TrendsMatrix.tsx` hardcodes greens/reds
  (`#1a7a3c`, `#a8432f` at lines 359/367/427), RGB literals in `totalPriceStyle` (37–48), and
  the `raised` colour as a raw `rgba(236,227,207,…)` (line 32, with a comment admitting it).
  Promote these to tokens / a shared heat helper so a palette change stays one-file.
- **`TrendsMatrix.tsx` is doing a lot (M).** At 449 lines it mixes heat math, per-cell border
  bookkeeping (`groupBorder`/`subcatBorder`/right-trim spacer), and three near-duplicate cell
  renderers (`CellContent`, the Infinity branch, `TotalRow`). Extracting the cell renderer and
  the heat/colour helpers would cut the duplication and make the `+-%` and border edge-cases
  easier to reason about.
- **No component/UI tests (M).** The core and API are well-covered (TDD), but there are zero
  tests on the React layer. A couple of React Testing Library tests for the Add·Single
  save-and-clear loop and the List fan-out totals would guard the highest-traffic flows.

---

## 8. Optional bigger bets (clearly net-new — discuss before building)

- **An "evening ledger" dark theme `[net-new]` (M).** `index.css:42` locks `color-scheme:
  light`. A warm, candle-lit dark variant (deep ink-brown paper, same oxblood accent) would fit
  the heirloom concept beautifully and is low-risk because the palette is already tokenised —
  it's mostly a second `@theme` block + a toggle. Worth doing *well* or not at all.
- **A `/` command palette for Add `[net-new]` (M).** PLAN §6.2 floats this as an optional
  power-mode: type `/` → `nicotine 8+8+8` → Enter files it. Big speed win for rattling through a
  statement; pairs with the number-key picker above.

---

## 9. Suggested order

1. **Get the salary suite green** (§0) — unblocks everything; it's the only *broken* thing.
2. **Quick wins** (§1) — an afternoon; immediately fixes the embarrassing mobile overlaps and
   the `+-%` glitch, and clears the worst a11y contrast.
3. **Mobile pass** (§2) — the biggest gap relative to the stated roadmap.
4. **List editing + income flexibility** (§4) — the two real functional holes.
5. **Polish & a11y** (§3, §6) and **token/refactor cleanup** (§7) as ongoing.
6. **Bigger bets** (§8) only after a brainstorm — they're aesthetic/UX direction calls, which
   are yours to drive.

---

## 10. Deliberately NOT suggested (respecting PLAN §9 / §10)

Listed so it's clear they were considered and left out, per the spec's reasoning:

- Recurring / auto-filled entries; bank/CSV **import**; cross-time **item-level** analytics;
  L2 pacing view; seasonal / yearly view; per-entry cost sharing; savings / net-worth / balance
  carry-forward; the student-loan balance/payoff tracker (data model supports it, UI deferred).
- **Rejected outright** (§10): spend forecasting/projection, two-axis/tag categorisation,
  flatmate debt tracking, hand-maintained per-day rows, negative entries for refunds.

If any of these now feels worth pulling forward, that's a spec-level decision to make
explicitly — not something to slip in via a refactor.
