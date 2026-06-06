# Budget Tool — Concept & Intent

> **Status:** Idea / intent document. Captures *what* we are building and *why*, in
> enough detail that a fresh agent can pick it up cold and understand every choice and
> its reasoning.
>
> **Deliberately excluded:** anything about tech stack, frameworks, visual style, or
> implementation. Those are the *next* stage — a separate agent will read this doc and
> help decide style and implementation. Where this doc mentions UI concepts ("tab",
> "view", "chart"), treat them as conceptual, not prescriptive.
>
> **Date:** 2026-06-06

---

## 1. Purpose

A personal monthly budgeting tool for a single user. It replaces an existing Excel
workflow. The user reads their bank statements and records what they spent, sorted into
categories, and wants to see — clearly and live — where their money is going, which areas
they could cut, and how each month compares to the last.

### The current Excel workflow (what we're replacing)

- One **spreadsheet sheet per month**; within a sheet, **a row per day** and a **column
  per category**, so every entry lands in a day × category cell.
- The user reads transactions off their bank statement and fills them into the right
  cells, manually doing the calculation, summing, and placement.
- Grocery receipts get special treatment: a **separate per-receipt table** with columns
  for item name, price, amount (quantity), and *share* (cost split with a flatmate), plus
  an Excel-generated *price-per-item* column. The user totals these by category and writes
  the resulting numbers into the day × category cells.
- A **Notes** column per day row records *why* something happened (e.g. "£200 new shoes"),
  so a category spike has an explanation.
- The sheet computes: a **cumulative running total** down the month (in two flavours —
  total, and total-minus-Rent), **sums across category groupings** feeding **pie charts**,
  and a **month-vs-month comparison table** with **colour coding** (e.g. "nicotine in May
  was 20% lower than April"). Everything updates **live**, so from day 1 of a month the
  comparisons already exist and can be used to plan that month's spending.

### The core problem

The thinking part — reading the statement, pricing items, deciding a category — is
**enjoyable and not the pain**. The pain is the **clerical faff around it**: building
lists, dragging items between groups, summing them, finding the right cell, and the fact
that the structure is **hard to change once entries exist** (you can't easily add or
refactor columns/categories after the fact).

---

## 2. Guiding Principles

These shaped every decision below. A future agent should keep them in mind.

1. **Remove the faff, not the judgement.** The tool does the *clerical* work — summing,
   filing into the right category and month, aggregating, recalculating live. The user
   keeps the parts they enjoy (reading, pricing, categorising).
2. **Richer categories are now affordable *because* the faff is gone.** In Excel the user
   stayed at ~9 broad categories *only* because more columns meant more manual pain. Once
   the tool removes that pain, finer, more meaningful categories become the *payoff* — not
   a burden. This is why the category list below is larger than the old one.
3. **One continuous, editable ledger.** Unlike Excel's sheet-per-month silos, all history
   lives in one place, and any past entry or the category structure itself can be changed
   at any time. This directly fixes Excel's "can't refactor after entries exist" pain.
4. **Keep the main view calm; quarantine mutation.** The everyday overview should feel
   stable and not overly "editable." Structural changes (adding/renaming/moving categories,
   editing old entries) live in a **separate management area**.
5. **Honesty over false precision.** The tool should not invent numbers it can't stand
   behind (see the rejection of spend *forecasting* in §7).
6. **Flexible unit of entry.** The user decides what counts as one "entry" — sometimes
   finer than a bank transaction, sometimes coarser (see §4).

---

## 3. Scope at a Glance

**In scope (build now):**

- Manual entry of spending, categorised, across one continuous ledger.
- A redesigned category + grouping taxonomy.
- Itemised grocery lists with flatmate cost-sharing.
- Live monthly views: running totals, grouping pie charts, a month-vs-last-month
  comparison, and a colour-coded category × month trend matrix.
- Light income tracking → monthly and average Net Balance.
- A separate management area for editing entries and restructuring categories.

**Explicitly out of scope for now (deferred — see §11):** recurring/auto-filled entries,
bank/CSV import, cross-time item-level analysis, spend pacing/forecasting, seasonal/yearly
views, per-entry cost sharing, refunds as negative entries, income/savings/net-worth
tracking beyond the light Net Balance.

---

## 4. The Entry Model

The atomic unit is an **entry** — *whatever the user decides to record as one line*. It is
**not** tied 1:1 to bank transactions. The user picks whatever grouping is least faff:

- **Coarser than the statement (merge):** six £8 pints at the pub → one entry of £45,
  category Alcohol. The user pre-sums repetitive same-category spend.
- **Finer than the statement (split):** one grocery receipt → an itemised list split across
  several categories (see §5).

The common thread is **least effort to reason about**. The tool must comfortably support
both directions.

**A normal entry has:**

- **Amount** (what the user paid / their cost)
- **Category** (exactly one — see §6)
- **Date** (so it lands in the right month; see §8)
- **Note** (optional — a free-text memory-jog, e.g. "new shoes", replacing Excel's Notes
  column; now attached per entry rather than per day)

**The tool does the clerical work:** summing, filing the entry into the correct category
and month, and recomputing all totals, charts, and comparisons **live**.

**Nice-to-have (not required):** a small sum-helper so the user can type `8+8+8+5+...` and
have it total into a single entry — removing even the pub-maths step.

---

## 5. Itemised Lists (grocery receipts)

A special, richer entry type for purchases that **mix categories** — typically a grocery
shop spanning **Groceries + Household** (and sometimes **Self-care**). This is the one
place the user *wants* item-level detail, because that's where splitting and cost-sharing
happen.

**Each item row has:**

- **Name**
- **Price** (what was paid for the line)
- **Amount** = **quantity**, which doubles as a way to **group similar items** into one
  line. Rather than enter five near-identical entries, the user records one — e.g. five
  different brands of cereal bar as name "cereal bars", amount 5, price £10 (the *total*) —
  and lets price-per-item give a useful **average unit cost** (£2). This keeps itemising
  fast while still capturing roughly what things cost.
- **Share %** (flatmate cost split — see §6)
- **Category** (which category this item belongs to)
- **Price-per-item** = derived unit price (price ÷ amount). For a grouped line this is an
  **average** unit cost across the items lumped together. Carried over from Excel as a
  helper; part of the parked item-analysis feature.

**Each itemised list shows three totals:**

- **Full list total** (sum of all item prices, before sharing)
- **My share** (what actually counts as the user's spend — see §6)
- **His share** (the flatmate's portion — shown for reference only)

**How an itemised list flows into the budget:** one itemised list produces **one entry per
category it touches**, each carrying the **my-share subtotal**
for that category (e.g. Groceries £40, Household £12). Those subtotals are what land in the
month's ledger and feed the views. The **individual item rows are persisted underneath the
list but kept off the main overview** — they exist to make splitting/summing painless and
to enable a *future* "track an item's price over time" feature (see §11). They are not part
of day-to-day analysis right now.

---

## 6. Cost Sharing (flatmate split)

The user sometimes splits grocery costs with a flatmate. This is modelled **only on
itemised grocery lines** — ordinary entries have no share field and never need one.

- **Share % = the flatmate's slice**, which is deducted from the user's cost:
  - **0%** → the user pays the whole item (their cost = full price). *Most common.*
  - **50%** → split evenly (their cost = half).
  - **100%** → bought for the flatmate (their cost = £0). *Rare.*
  - **My cost = price × (1 − share%).**
- **No debt tracking.** The tool does **not** track a running total of what the flatmate
  owes. Shared amounts are treated as already settled. The three list totals (full / mine /
  his) are shown purely for reference on that list.
- Only the user's **my-share** figures feed categories, budgets, and Net Balance.

---

## 7. Categories & Groupings (the taxonomy)

### Why it was redesigned

The old categories tried to answer **two questions with one label** — *what* was bought
(food, alcohol, nicotine…) and *why / in what context* (essential vs social vs one-off).
That collision caused every "this category is a bit meh" complaint: *Food* mixed social
dinners with solo Deliveroo; *Alcohol* mixed pub rounds with wine at home; *Subs/Digital*
became a dumping ground for anything that didn't fit.

**The chosen fix (single-axis, cleanly grouped):** keep **one category per entry**, but
*design the categories so each maps cleanly to exactly one grouping*. Where a category
straddled two groupings, **split it** (that's why *Food* became *Food Out* vs *Food In*).
The grouping is therefore implied by the category, with no ambiguity.

> **A note for the next agent — a rejected alternative.** We considered a **two-axis model**
> (every entry tagged with both a *what* and a *why/context*) and a **tag** system. It was
> **rejected** in favour of more granular single-axis categories, because the second axis
> adds effort to every entry and the user's whole goal is *less* effort. Please don't
> re-propose tags/second-axis unless the user raises it.

### The locked structure — 5 top-level groups, 15 categories

| Essentials | Social | Health | Subscriptions | Personal |
|---|---|---|---|---|
| Rent *(special)* | Food Out | Self-care | *(standalone, no sub-categories)* | Food In |
| Bills | Alcohol | Supplements | | Nicotine |
| Groceries | Events | Health Appointments | | Purchases |
| Household | | | | |
| Travel | | | | |

The hierarchy is **intentionally uneven**: *Subscriptions* is a "group of one" (a top-level
line with no children), sitting alongside groups that do have children. This is by design,
not an oversight.

### Category definitions & boundary rules

**Essentials** — money needed to live/function:
- **Rent** — single fixed monthly payment. Treated specially in views (see §9): it's ~60%
  of spend and constant, so it's *excluded* from the discretionary-analysis charts and from
  the "minus-Rent" running total. (It *is* still real money, so it counts in Net Balance.)
- **Bills** — flat bills (electricity, council tax, etc.). Recurring but **variable in
  amount and timing**.
- **Groceries** — the regular grocery shop: food and non-alcoholic drink.
- **Household** — things that **clean the flat**: cleaning supplies, bin bags.
- **Travel** — tube, rail, bus, etc.

**Social** — out, with people:
- **Food Out** — eating out, pub food, dinner with mates.
- **Alcohol** — drinks on a night out / at the pub.
- **Events** — club entry, gig/event tickets.

**Health** — *positive* health only (deliberately excludes Nicotine):
- **Self-care** — anything that goes **on the body**: skincare, face cream, shower gel,
  deodorant, toiletries.
- **Supplements** — vitamins and supplements.
- **Health Appointments** — physio, earwax cleaning, etc.

> **Key boundary rule (Self-care vs Household):** *goes **on your body** → Self-care
> (Health); **cleans the flat** → Household.* This is a fast, unambiguous rule for itemising
> a grocery shop, where toiletries and cleaning products sit side by side.

**Subscriptions** — recurring digital services/memberships (Netflix, Spotify, ChatGPT,
etc.). Kept as its own standalone top-level line because it's **recurring** and behaves
differently from one-off spend.

**Personal** — self-directed discretionary spend:
- **Food In** — solo food treats: Deliveroo eaten at home, sweets, milkshakes
  (discretionary, *not* social).
- **Nicotine** — cigs, vapes, snus, gum, patches. Deliberately **not** under Health
  (Health = positive only); this is the category the user most actively tracks to *reduce*.
- **Purchases** — discretionary goods and digital purchases: clothes, a new phone, gifts
  for others, Steam games, random Amazon orders. (This merges the old "Digital Purchases"
  and "Shopping" into one.)

> **Naming history (so it isn't re-litigated):** the Personal group was variously called
> "Misc", "Lifestyle", and "Indulgences" during design. The user found "Indulgences" too
> fancy and chose **"Personal"**. "Misc" was rejected because the goal was to *stop* having
> a dumping-ground category.

---

## 8. Time Model

- An entry simply **carries a date**, which places it in a **calendar month**. There are
  **no hand-maintained per-day rows** — that was an Excel layout artifact, not something the
  user needs to maintain.
- A **day timeline exists only as a *view***, to drive the running cumulative total (§9) and
  let the user watch spend climb through the month. The user does not analyse individual
  days as a first-class thing.
- All months live in **one continuous dataset** (not a sheet per month). This is what makes
  cross-month comparison and the trend matrix trivial.

---

## 9. Views & Analysis (the outputs)

All views update **live**, and the comparison baseline (last month) already exists from day
1 of a new month — enabling in-month planning.

1. **Running cumulative total** down the month, in **two flavours**:
   - **Total** (everything), and
   - **Total minus Rent** (Rent excluded because it's ~60% and constant, which otherwise
     dwarfs and flattens the view).

2. **Grouping pie charts** — the sums per top-level grouping, visualised. Include
   **Rent-excluded variants** where Rent would otherwise skew the chart.

3. **Comparison — Level 1 (L1) only.** Compare the user's **cumulative spend-to-date**
   against **last month's full total**, at both **category** and **grouping** level. The
   user judges the gap themselves (the signature move: when Nicotine nears 100% of last
   month's total, stop buying for the month). The headline % is always **vs last month**.

4. **Comparison matrix (trend view).** A **category × month** (and **grouping × month**)
   grid: every month is a column, and **each cell is colour-coded by change vs the *prior*
   month** — **red = higher spend, green = lower spend**. The colours let the user
   eyeball a trend or spot an outlier month across a whole row at a glance. (The colour does
   the trend-reading; the headline number stays "this month vs last".)

> **Rejected analysis features (record the reasoning so they aren't re-proposed):**
> - **L2 "pacing"** (comparing spend-to-date against *the same day* last month) — a fairer
>   like-for-like signal, but judged **low value for now**. Possible later (§11).
> - **L3 projection / forecasting** (extrapolating month-end totals from current pace) —
>   **rejected outright.** The user's spending isn't structured or patterned enough for a
>   forecast to be truthful; a confident-but-wrong number is worse than none. (This is
>   principle #5 in action.)

---

## 10. Income & Net Balance (light)

Expenses are the focus, but a thin income layer is included:

- An optional **monthly income** figure, entered per month (it **varies month to month**).
- A **monthly Net Balance** = that month's income − that month's total expenses.
  - Net Balance is **real money**, so it **includes Rent** (even though Rent is excluded
    from the discretionary-analysis charts in §9).
- An **all-time Average Net Balance** = the **mean of the monthly Net Balances across all
  months**.
- Nothing more — no savings, net-worth, or balance-carrying.

---

## 11. Editing & Structure Management

A **separate tab / section** dedicated to mutation, kept apart so the main overview feels
stable:

- **Add** new categories and sub-categories.
- **Rename** categories and sub-categories.
- **Move** sub-categories between groups.
- **Edit / delete** past entries.
- Changes apply **coherently across all history** (re-categorising an old entry, or
  restructuring the taxonomy, updates the whole ledger) — directly solving Excel's "can't
  refactor after entries exist" pain.
- **Refunds / returns** are handled here by **deleting or editing the original entry** —
  there are **no negative entries**.

---

## 12. Deferred / Future Ideas (not now)

Recorded so they aren't lost, and so a future agent knows they were *consciously* deferred,
not forgotten:

- **Recurring / auto-filled entries** (Rent, Bills, Subscriptions templates). Deferred
  because **Bills vary in amount and timing**, and **Subscriptions change price or get
  cancelled**, so naive auto-fill would create stale/wrong data. The user enters these
  manually for now. A "confirm a pre-filled checklist each month" version is a plausible
  later addition.
- **Bank / CSV import (auto-pull transactions).** Deferred — and note the user **enjoys**
  reading statements and pricing items manually, so automating it away is not purely a win.
  Possible future feature.
- **Cross-time item-level analysis** ("how much have I spent on milk this year?", "is my
  deodorant getting pricier?"). Item rows are **persisted now** but surfaced **later**, as
  its own analysis area, kept off the main overview.
- **L2 pacing view** (§9) — maybe later.
- **Seasonal / yearly view** (e.g. summer-vs-winter going-out trends, year-over-year). The
  user is curious about this but there **isn't enough data yet to justify it**; likely a
  later separate tab.
- **Per-entry cost sharing** beyond itemised lists — not needed.

---

## 13. Confirmed Detail Decisions

These were inferred during design and have since been **confirmed by the user**:

1. ✅ An **itemised grocery list produces one entry per category it touches** (the my-share
   subtotal), with item rows stored underneath (§5).
2. ✅ On an item, **"amount" = quantity** and **price-per-item = (average) unit price**;
   amount also serves to **group similar items into one line** to avoid entering many
   near-identical entries (§5).
3. ✅ **Net Balance includes Rent** as real money out (§10).

---

## 14. What's Intentionally Left to the Next Stage

This document defines the **idea** only. The following are **deliberately undecided** and
are for the next agent to work through with the user:

- Tech stack, frameworks, data storage, platform.
- Visual style, layout, and exact UI of every view.
- The precise interaction design for entry, itemisation, and the management area.
- How the views are arranged on screen and navigated.
