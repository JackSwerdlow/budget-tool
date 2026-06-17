# Budget Tool — Design & Implementation Plan

> **Status:** FINAL pre-implementation artifact. This is the last planning document before code.
> A coding agent should read this top-to-bottom and build from it, phase by phase.
>
> **Read first:** [`docs/SPEC.md`](docs/SPEC.md)
> — the *what & why* (category taxonomy, entry model, views, scope, deferred features). It is the
> source of truth for the **product idea** and is not re-litigated here. **This** document is the
> *how*: tech stack, data model, app structure, visual/UX system, and the build plan.
>
> **Date:** 2026-06-06 · **Single-user, local, no auth.**

---

## 0. How to use this document (coding agent)

1. Read the idea spec first, then this whole file.
2. Build in the **phase order** of §7. Keep the app **runnable and clickable after every phase** — the goal is one demo app you launch with a single command, click through the tabs, add an entry, and watch every stat update live.
3. **TDD the core** (§4, §8): the pure-logic layer holds all the money maths and must be tested first.
4. **Do not build anything in §9 (deferred) or §10 (rejected).** They are recorded so they are not accidentally added.
5. Verify exact library syntax/versions via **Context7 MCP** before writing framework code (per `CLAUDE.md`).

---

## 1. Summary

A personal monthly budget tool that replaces an Excel workflow. The user records spending into a
fixed taxonomy (5 groups, 15 categories), itemises grocery receipts (splitting some costs with a
flatmate), and reads live monthly views: running totals (±Rent), grouping pies, a "vs last month"
comparison, and a colour-coded category×month trend matrix — plus a light income → Net Balance layer.
The whole point is **removing clerical faff** while keeping manual entry, so every entry interaction
is built for **speed and low effort**.

---

## 1.5 Deviations & additions vs the idea spec (user-approved)

The idea spec is the product source of truth, but during design the user consciously changed or added
three things. These are intentional and **override the spec where noted**:

1. **Running total — ex-Rent only.** Spec §9.1 asks for two running-total *flavours* (incl- and
   excl-Rent). The user chose to draw the **running line always ex-Rent** (Rent's day-1 step scuffs the
   shape), while **both totals (incl/excl Rent) are surfaced as headline figures** in the top band — so
   the incl-Rent magnitude is still visible, just not as a second cumulative line.
2. **Trends matrix colour — per-row heatmap, not vs-prior-month.** Spec §9.4 colours each cell by
   change vs the prior month. The user moved that signal into an explicit inline **±% with a signed
   diagonal arrow (sized to the swing)** and repurposed **cell colour to a per-row heatmap** (which
   months were heaviest for that category). Both signals are present — split across colour (magnitude
   within row) and number (change vs last month).
3. **Delivery / bag-fee line (new).** Not in the spec; added at the user's request for online grocery
   orders — a collapsible, hidden-by-default fee on a list with its own amount + share% + category
   (defaults to Groceries).

Everything else follows the idea spec faithfully.

---

## 2. Tech stack & rationale

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | One language client→server→core; strongest for the agent; portable to a future mobile build. |
| UI | **React + Vite** | Fast dev/runtime; ideal for the data-dense, polished dashboard; strong ecosystem. |
| Styling | **Tailwind CSS** + a small design-token layer | Fast path to the distinctive "Ledger" look; tokens keep the palette/typography centralised. |
| Persistence | **SQLite** via Node's built-in **`node:sqlite`** (`DatabaseSync`) → a real `*.db` file on disk | Durable, inspectable, "owned" like the old `.xlsx`; relational integrity makes retroactive re-categorisation trivial; **zero native build step** (verified available on Node v24.15 here). `better-sqlite3` is a drop-in fallback (near-identical sync API) if ever needed. |
| Server | **Thin Node HTTP API** (a minimal framework such as **Hono**, or `node:http`) | Tiny CRUD surface over the DB; the server does *no* analytics — it just stores and returns raw rows. Keep it thin so the core stays portable. |
| Shared logic | **Framework-agnostic TS "core"** package (no React, no DB, no DOM) | All derivation lives here as pure functions (see §4). Reused untouched by a future Expo/mobile app. |
| Charts | **Hand-rolled SVG** + **`d3-shape`** (path maths only) | Full control over the aesthetic; pies/bars/matrix are plain CSS/SVG. **No heavy charting dependency.** |
| Data fetching | Load-all-and-derive: client fetches the raw ledger once, the core derives every view, React renders; mutations call the API then refresh | At single-user scale the dataset is small; deriving everything client-side is simplest, snappiest, and keeps "everything live" true by construction. (TanStack Query optional for cache/refetch ergonomics.) |
| Tests | **Vitest** | Unit-tests the core (TDD); a few API/DB integration tests. |
| Money | **Integer pence** stored everywhere; displayed as decimal **£234.23** (en-GB, GBP) | Exact totals, honouring "no false precision." |
| Run | One command (`npm run dev`) launches client + API together | "One demo app to run." |
| Node | **≥ 22.13** (built-in stable `node:sqlite`); here **v24.15.0** | — |

**Process shape (dev):** Vite serves the client (`:5001`, host `0.0.0.0`); the Node API runs on a second port (`:8100`); Vite proxies `/api/*` → the API. `npm run dev` runs both (e.g. via `npm-run-all`/`concurrently`). For a built demo, the API also serves the static client. **DB path comes from an env var** (`BUDGET_DB`), enabling the empty-vs-demo switch (§6.7, §7).

**Mobile later (non-goal now, kept cheap):** because *all* logic is in the framework-agnostic core and the store is SQLite, a future mobile build is **Expo + `expo-sqlite`** reusing the core + schema, rebuilding only the view layer. Nothing in v1 should block this (no server-only logic leaking into views).

### 2.1 Project structure, scripts & conventions

**Layout — npm workspaces** (keeps `core` independently importable and portable to mobile):

```
budget-tool/
  packages/core/   # pure TS logic — money, shares, list, ledger, comparison, trends, netBalance (NO React/DB/DOM)
  apps/api/        # Node + node:sqlite HTTP server (Hono); imports @budget/core
  apps/web/        # Vite + React + Tailwind client; imports @budget/core
  data/            # budget.db (git-ignored) · budget-demo.db (committed once built)
```

**Scripts (root):**
- `npm run dev` — API (`:8100`, `BUDGET_DB=data/budget.db`) + web (`:5001`, host `0.0.0.0`) concurrently; Vite proxies `/api` → `:8100`.
- `npm run dev:demo` — same, but the **API** uses `BUDGET_DB=data/budget-demo.db` (the only difference). Use `cross-env`/Node `--env-file` so it isn't bash-only.
- `npm run build` — `vite build` (web) + compile API.
- `npm start` — production demo: the API serves the built web `dist/` (SPA fallback) **and** `/api` on one port (`:8100`).
- `npm test` — Vitest (core + integration).

**Resolved forks / defaults:** server = **Hono** over `node:http`; **no** TanStack Query initially (a small data-context that loads `/api/bootstrap` and re-fetches on mutation suffices — add caching only if pain appears); open every DB connection with **`PRAGMA foreign_keys = ON`**.

**Styling:** the §6 palette hexes live as **CSS custom properties** consumed by a **`tailwind.config` theme extension** (one source of truth). Fonts are **self-hosted** (e.g. `@fontsource/fraunces`, `@fontsource-variable/hanken-grotesk`) — no CDN/`localhost` dependency.

**Money/date conventions:** integer pence end-to-end, formatted en-GB `£x.xx`. **Month is derived by string-slice `date.slice(0,7)` (`YYYY-MM`) — never `new Date(str)`** (avoids a timezone month-shift). `created_at` exists only where ordering matters (`entries`, `lists`, `list_items`); `groups`/`categories`/`monthly_income` omit it by convention.

---

## 3. Data model (SQLite schema)

All money columns are **integer pence**. Entries/items reference categories **by id**, so a rename,
a group-move, or a re-categorisation is a one-row change that **applies across all history with no
versioning** (idea spec §11). Money is never duplicated: itemised lists are stored as their **item
rows only** — the per-category numbers they contribute are **always recomputed** (idea spec §5/§13,
decision "A").

```sql
-- 5 groups (seeded). Editable: add / rename.
CREATE TABLE groups (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  color      TEXT NOT NULL          -- base hue (hex), e.g. Essentials '#6b7d5e'
);

-- 15 categories (seeded). Editable: add / rename / move group / delete (with reassign, §6.6).
CREATE TABLE categories (
  id                        INTEGER PRIMARY KEY,
  name                      TEXT NOT NULL,
  group_id                  INTEGER NOT NULL REFERENCES groups(id),
  sort_order                INTEGER NOT NULL,
  color                     TEXT NOT NULL,           -- a SHADE of the group hue
  exclude_from_discretionary INTEGER NOT NULL DEFAULT 0  -- 1 for Rent only
);

-- Normal single entries (NOT list-derived; lists are never written here).
CREATE TABLE entries (
  id          INTEGER PRIMARY KEY,
  amount_pence INTEGER NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  date        TEXT NOT NULL,          -- 'YYYY-MM-DD'; month derived from it
  note        TEXT,
  created_at  TEXT NOT NULL
);

-- Itemised grocery lists (the receipt). Delivery/bag fee lives here (default 0, hidden).
CREATE TABLE lists (
  id                  INTEGER PRIMARY KEY,
  date                TEXT NOT NULL,
  note                TEXT,
  delivery_fee_pence  INTEGER NOT NULL DEFAULT 0,
  delivery_share_pct  INTEGER NOT NULL DEFAULT 0,
  delivery_category_id INTEGER NOT NULL REFERENCES categories(id),  -- defaults to Groceries
  created_at          TEXT NOT NULL
);

-- Item rows under a list (the source of truth; kept off the main overview).
CREATE TABLE list_items (
  id          INTEGER PRIMARY KEY,
  list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price_pence INTEGER NOT NULL,       -- line total
  quantity    INTEGER NOT NULL DEFAULT 1,  -- "amount"; also groups similar items
  share_pct   INTEGER NOT NULL DEFAULT 0,  -- flatmate's slice, 0..100, ANY integer %
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sort_order  INTEGER NOT NULL
);

-- Light income: one figure per calendar month (varies month to month).
CREATE TABLE monthly_income (
  year         INTEGER NOT NULL,
  month        INTEGER NOT NULL,      -- 1..12
  amount_pence INTEGER NOT NULL,
  PRIMARY KEY (year, month)
);
```

**Foreign keys & deletes:** open every connection with `PRAGMA foreign_keys = ON`. All three category
references — `entries.category_id`, `list_items.category_id`, `lists.delivery_category_id` — use
**`ON DELETE RESTRICT`**, so the DB itself refuses to delete a category that's still in use; the Manage
flow must **reassign-then-delete in a transaction** (deleting or moving the Groceries category must also
rewrite any list whose `delivery_category_id` points at it). `list_items` keeps `ON DELETE CASCADE` to
`lists`.

**`price_per_item`** is surfaced **only** as an inline entry-time average (a display helper);
aggregating it across time is a deferred feature (§9), not built now.

**Derived (never stored):** `price_per_item = price_pence / quantity` (an average for grouped lines);
per-item my-cost; list totals; all month/category/group aggregates; comparisons; the matrix.

**Seeded taxonomy** (idea spec §7 — locked):

- **Essentials** `#6b7d5e`: Rent *(`exclude_from_discretionary=1`)*, Bills, Groceries, Household, Travel
- **Social** `#b08537`: Food Out, Alcohol, Events
- **Health** `#4a6b6f`: Self-care, Supplements, Health Appointments
- **Subscriptions** `#9c8a73`: Subscriptions *(group-of-one: the group holds a single category of the same name, so every entry still attaches to a **category** — uniform model)*
- **Personal** `#8c3b2e`: Food In, Nicotine, Purchases

Each category's `color` is a **shade of its group hue** (used by the explodable pie and the matrix). Example Essentials shades: Bills `#4f5e44`, Groceries `#6b7d5e`, Household `#8a9a72`, Travel `#a6b48f`. (Shades are **stored explicitly** as seeded hexes — deterministic, no runtime generation.)

---

## 4. The TS core (pure logic — the heart of correctness)

A standalone package with **no React/DB/DOM**. Everything is a pure function of raw rows. **Built TDD**
(§8). Modules:

- **`money`** — `formatGBP(pence) → "£234.23"`, `parsePounds("234.23") → 23423`, and the **sum-helper** `evalSum("8+8+8+5") → 2900` (supports `+`/`-`, whitespace, decimals; rejects anything else).
- **`shares`** — `splitCost(pricePence, sharePct) → { mine, flatmate }` with the **no-half-pence rule**:
  `flatmate = Math.round(pricePence * sharePct / 100)`, `mine = pricePence - flatmate`. Rounding is
  **half-up** (JS `Math.round`) — any reimplementation must match (not banker's rounding) or the canonical
  examples flip. *Invariant:* `mine + flatmate === pricePence` exactly; both integers.
  *Canonical tests:* `splitCost(7, 50) → { mine: 3, flatmate: 4 }`; `splitCost(900, 33) → { mine: 603, flatmate: 297 }`.
- **`list`** — `itemMyCost(item)` (per-item, via `shares`), `listTotals(list) → { full, mine, flatmate }`,
  `listCategorySubtotals(list) → Map<categoryId, minePence>`. **Critical rule — always per-item-then-sum,
  never round-the-total:** `listTotals.mine ≡ Σ itemMyCost(item) + deliveryMyCost`, and
  `Σ listCategorySubtotals.values() ≡ listTotals.mine` exactly. *(Counter-example to forbid: two `7p @ 50%`
  items → per-item sum `3+3 = 6p`; rounding the £0.14 total once gives `7p` — a 1p drift between the list's
  displayed "Your share" and the filed subtotals. Never do the latter.)* `full = mine + flatmate` exactly;
  the delivery fee splits the same way and adds to its category.
- **`ledger`** — combine **entries + list subtotals** into `monthCategoryTotals(ym)`, `monthGroupTotals(ym)`,
  and `±Rent` variants (drop categories where `exclude_from_discretionary`). Running cumulative is a sorted scan of (entries + list dates) within a month, **always ex-Rent**. *(Month bucketing uses `date.slice(0,7)` everywhere — entries, lists, income. Two distinct baselines live nearby: the running chart's dashed target is **last month's ex-Rent total**, whereas the comparison bars use **last month's full per-row totals** — don't conflate them.)*
- **`comparison`** — `vsLastMonth(thisToDatePence, lastMonthFullPence) → pct`, computed **per row** (each category vs *its own* last-month full total, each group vs *its own*); pct rounded to a whole number; flags over/under 100%. **Zero-baseline:** when `lastMonthFullPence === 0` (a brand-new category, or the first ever month) return a `null`/"new" result — render a "new" chip and no bar, never `Infinity`/`NaN`.
- **`trends`** — `matrix(months, rows)` producing, per cell: `amountPence`, `pctVsPrevMonth` (signed; `null` for the first column), and a **row-relative heat level** (normalise each row between its own min/max → bucket to the green→red ramp). Starting params: **6 heat buckets**; a row is **muted** (held neutral) when its spread `(max − min)` is `< 12%` of its `max`, so a £2 wobble doesn't blaze red.
- **`netBalance`** — `monthNet(ym) = income(ym) − totalInclRent(ym)` (missing income = £0 that month). `averageNet()` = mean of `monthNet` over **every month with any activity** (≥1 entry/list, or an income figure); a truly empty gap month is skipped (not counted as £0). *(This concretises the spec's "mean across all months" — confirmed with the user: skip empty months, don't count them as £0.)*

---

## 5. App structure, navigation & live recompute

**Three top-level tabs** (start minimal, room to grow):

```
  Overview            + Add            ⚙ Manage
  └ [Month | Trends]   └ [Single|List]  (quiet, options-style)
```

- **Overview** (home) — segmented **Month** / **Trends** sub-views + a month picker. The calm, read-only-feeling everyday screen.
- **+ Add** — **Single** (fast default) / **List** (itemised grocery). Reachable from anywhere via a **global hotkey** so adding is never more than a keystroke, while still being a visible tab.
- **⚙ Manage** — visually quieter "back of house": edit/delete entries, restructure taxonomy, set income.

**Live recompute:** the API is a thin SQLite store exposing raw rows + simple mutations. The **client loads the raw ledger and the core derives every view**; React renders. Any mutation (add/edit/delete entry, edit a list, rename/move a category, set income) → re-fetch/re-derive → **every view updates live and stays internally consistent by construction**. No analytics on the server.

**API sketch** (all JSON): `GET /api/bootstrap` (groups, categories, entries, lists+items, income — everything); `POST/PATCH/DELETE /api/entries`; `POST/PATCH/DELETE /api/lists` (+ items); `POST/PATCH/DELETE /api/categories` & `/api/groups`; `PUT /api/income/:year/:month`.

---

## 6. Visual / UX system — the "Ledger" direction

> The interactive mockups live under `.superpowers/brainstorm/…` (git-ignored, may not persist). **This
> section is the authoritative visual spec** — build from it, not the mockups.

**6.0 Identity.** Warm, editorial, "an heirloom account book." Calm, characterful, non-generic.

- **Type:** display & all numerals in **Fraunces** (serif); UI text/labels in **Hanken Grotesk**. Fallbacks: `Georgia, serif` and `system-ui, sans-serif`. Numerals use tabular figures.
- **Palette:** paper `#efe6d2` (panels `#f6efdd`, raised `#ece3cf`); ink `#2b2620`; muted ink `#7c6f5b`/`#9a8b6e`; hairlines `#d9c9a6`/`#ddccaa`; **accent oxblood `#8c3b2e`**. Group hues as in §3; **category = shade of group hue**. Semantic: **lower/under `#5f7d54` (green)**, **higher/over `#a8432f` (red)**. Matrix heat scale (less→more, per row): `#8aa861 → #aec188 → #eadfc8 → #e3c3b3 → #c07a5c`.

**6.1 Overview · Month.**
- **Top band shows BOTH totals always:** headline **£incl. Rent** (large) and **£excl. Rent** beside it (no toggle). Plus a **Net balance** card — *always incl. Rent* — showing `income − spend` and the all-time **avg net / month**.
- **Running total chart: ALWAYS excludes Rent** (Rent's day-1 step otherwise scuffs the shape). Line climbs through the month toward a **dashed horizontal target at last month's ex-Rent total**. *(That target is last month's **ex-Rent** total; the comparison bars below use last month's **full** per-row totals — two different baselines.)*
- **Grouping pie (donut):** has its own **incl/excl Rent** toggle. Each group is one hue; **sub-categories are shades of it**. **Clicking a slice explodes it** into its categories (shown as shades of that group's hue). Legend with amounts beside it.
- **"Vs last month" comparison:** every row — group **and** category — is a **bar filling toward 100% of *its own* last-month full total** (each category compares to *that category's* last-month total; the signature case: **Nicotine** nearing 100% of last month → ease off). **Green under / red over**, with a 100% marker. **Over 100%:** the bar fills to the marker, turns **red**, and shows the figure (e.g. `113%`) past it — it does not keep growing off the track. The headline **% vs last month + amount** inherits the same under/over colour. **Groupings expand to their categories** (e.g. Personal → Nicotine/Food In/Purchases). An **incl/excl Rent** toggle pulls Rent out of the Essentials total (default **excl. Rent** — Rent sits flat ~100% and is noise here). A row with no last-month baseline shows a "new" chip, not a bar.

**6.2 Add · Single** (the fast path, idea spec §4).
- **Amount** with the **sum-helper** (type `8+8+8+5` → `£29.00`).
- **Category = an always-visible colour grid** of all 15, grouped under their 5 headings, shaded by group; one tap; number-key / type-to-filter shortcuts. *(Chosen mechanism: grid. A `/` command-bar power-mode is an optional later add — see §9.)*
- **Date** defaults to today; optional **note**.
- **Save-and-clear loop** (Enter saves and resets for the next line) with a small "added just now" session list — so a bank statement can be rattled through; each entry files itself into the right month/category.

**6.3 Add · List** (itemised grocery, idea spec §5/§6).
- **Free note** on the list.
- **Item rows:** name · quantity (`amount`, also groups similar items into one line) · price (line total, sum-helper enabled) · **inline average unit price** (`price ÷ qty`, faint) · **Share** (a small, unobtrusive field, **default 0%**, accepts **any integer %** — e.g. `33%` when the flatmate covers 1 of 3; 50/100 offered as focus shortcuts) · **Category** (shaded chip).
- **Per-item my-cost** = `price − round(price × share%)` (the §4 rule).
- **Three totals:** **Full list** · **Your share (counts)** · **Flatmate (reference only — no debt tracking)**.
- **Collapsible Delivery / bag fee:** **hidden & £0 by default** (in-store, reusable bags); when expanded for online orders it carries its **own fee amount + share % + category (defaults to Groceries)**.
- **Fan-out preview:** on save the list contributes **one *virtual* per-category subtotal** (your-share) to the ledger — **compute-only; no `entries` row is ever written** (decision A). Raw item rows persist underneath, off the overview.

**6.4 Trends matrix** (idea spec §9.4).
- Rows = groupings (expand to categories); columns = months; **June (current) is month-to-date**.
- **Cell colour = relative spend WITHIN that row** (a per-row heatmap; which months were heaviest), *not* vs last month. First column neutral.
- **Each cell shows the £ amount with a `±%` vs the previous month inline to its right** — with an **explicit sign and a DIAGONAL arrow (`↗`/`↘`)**, **text sized to the swing** (tiny for ±6%, loud for +167%), in **muted ink** so it reads on any cell. **Cells are fixed-height** so growing arrows never warp the grid.
- **Near-flat rows muted** (e.g. Subscriptions — a row is held neutral when its spread `< 12%` of its max; heat = 6 buckets across the §6.0 ramp; see §4 `trends`). **incl/excl Rent** toggle. Tap a cell for the exact figures/note; tap a grouping to expand/collapse.

**6.5 Manage** (quiet, idea spec §11).
- Edit / delete past **entries**.
- Restructure **taxonomy**: add / rename categories & groups; move a category between groups; **delete a category only after reassigning its entries** (no silent orphans, no data loss) — same for groups.
- All changes recompute the whole ledger live (retroactive, via the id references).
- Set each month's **income**.
- **Refunds/returns** = edit or delete the original entry (no negative entries).

**6.6 Deletion rule.** Deleting a non-empty category prompts to **reassign its entries/items to another category** first. Deleting a group requires it be empty (or move its categories out first).

**6.7 Demo vs empty data.** Default run = **empty `budget.db`** (only seeded taxonomy). A separate **`budget-demo.db`** (pre-populated) is selectable via `npm run dev:demo` / `BUDGET_DB`. *(Built last — see §7 Phase 6; values to be agreed with the user.)*

---

## 7. Implementation phases

Each phase ends **runnable, tested, committed**. The app is clickable from Phase 1 onward.

- **Phase 0 — Scaffold.** Vite+React+TS+Tailwind; design tokens (palette, Fraunces/Hanken); `core` package + Vitest; Node API with `node:sqlite` and `BUDGET_DB` env; schema + **seed groups/categories** (with explicit shade hexes); `npm run dev` (client+API). Empty `budget.db`. Tab shell (Overview/Add/Manage) with placeholders. Stand up the **npm workspaces** layout and wire `npm run build` / `npm start` (API serves built `dist/`) + the `dev:demo` switch per §2.1 now, so the "built demo" path exists from day one.
- **Phase 1 — Single entry + Month overview (vertical slice).** Core `money`, `shares`, `ledger`, `netBalance` (TDD). Add·Single (grid, sum-helper, save-and-clear). Overview·Month: both totals, running chart (ex-Rent, target line), grouping donut (±Rent), net balance. **Add an entry → watch the overview update live.**
- **Phase 2 — Itemised lists.** Core `list` logic (TDD, incl. the rounding example). Add·List editor (rows, any-% share, three totals, delivery fee, fan-out). Lists feed the ledger; donut **explode-on-click**.
- **Phase 3 — Comparison + Trends.** Core `comparison` + `trends` (TDD, incl. row-heat + flat-muting). Overview comparison bars (±Rent, expandable). Trends matrix (per-row heat, signed diagonal arrows scaled by swing, fixed cells).
- **Phase 4 — Manage.** Edit/delete entries; taxonomy add/rename/move/delete-with-reassign (retroactive recompute); set monthly income. Confirm all ±Rent toggles behave.
- **Phase 5 — Polish.** Global Add hotkey; empty states; formatting edge cases; light responsiveness; a11y/contrast pass; optional `/` command-bar for Single.
- **Phase 6 — Demo database (LAST).** **STOP and ask the user for the sample values** (how many months, rough amounts per category, a couple of realistic itemised lists incl. a shared/online one, monthly incomes). Then build `budget-demo.db` + the `npm run dev:demo` switch.

---

## 8. Testing strategy

- **Unit (Vitest, TDD) for the whole core**: `money` (format/parse/sum-helper), `shares` (incl. `splitCost(7,50)=({3,4})`, half-up), `list` (`full = mine+flatmate`; **`listTotals.mine === Σ listCategorySubtotals`**; the two-`7p@50%` no-drift case), `ledger` (entries+lists combine; ±Rent), `comparison` (per-row baseline; **`lastMonthFull===0` → "new", no `Infinity`**), `trends` (row-heat, flat-muting, first-column null), `netBalance` (gap-month denominator), and a **month-bucketing** test asserting `date.slice(0,7)` (no `Date` timezone shift).
- **Integration**: a few API/DB round-trips (insert→bootstrap→derive; rename category → history reflects it).
- **Manual click-through checklist** per phase (add entry updates overview; list fan-out; matrix colours; recategorise reflows history).

---

## 9. Deferred / future (DO NOT BUILD — idea spec §12, plus new)

- Recurring / auto-filled entries (Rent/Bills/Subs templates).
- Bank / CSV import.
- Cross-time **item-level analytics** (item rows are persisted now; surfaced later).
- **L2 pacing** view (spend-to-date vs same-day last month).
- **Seasonal / yearly** view.
- Per-entry cost sharing beyond itemised lists.
- **Savings / net-worth / balance carry-forward** — out of scope; the income layer stays the light Net Balance only (idea spec §10).
- **Item memory / autocomplete-with-last-price** *(new, user-requested for later)*: typing `Mi` suggests a previously-entered item (e.g. "Milk – 2L") and auto-fills its **last saved price** (still overwritable, since prices drift); dropdown-style so it works on mobile. **Architecture already supports it cheaply:** every `list_items` row persists `name + price + (list) date`, so "last price for a name" is just a query, and the item-name input is a component that can later gain a suggestions source **with no schema change**. Keep item names as a clean field; consider a normalised-name index when built.
- **Mobile app** (Expo + `expo-sqlite`), reusing the core + schema. *(Still deferred.)*
- ~~**Desktop wrapper** (Tauri)~~ — **now being built** on branch `desktop-tauri`; see
  `docs/DESKTOP_SPEC.md` / `docs/DESKTOP_PLAN.md`. (rusqlite, not the SQL plugin — see that spec.)

## 10. Rejected / non-goals (idea spec §7/§9 — do not propose)

Two-axis/tag categorisation · spend **forecasting/projection** · flatmate **debt tracking** (shares treated as settled; flatmate totals are reference-only) · hand-maintained **per-day rows** · **negative entries** for refunds (edit/delete instead).

## 11. Open items (resolve during build)

- **Demo data values** — gather from the user at Phase 6.
- Exact category shade hexes — **hand-pick & seed** during Phase 0 (must read clearly when a slice is exploded and in the matrix).
