# Salary Sub-tabs + Lifetime Aggregation — Design Spec (Spec A)

> **Status:** Approved design (brainstorm), pre-plan.
> **Date:** 2026-06-20 · Extends the Phase-1 redesign (`2026-06-18-salary-breakdown-redesign-*`).
> **Sibling:** Spec B — `2026-06-20-student-loan-tracker-design.md` (builds on this).

---

## 1. Motivation

The Salary tab is becoming a long single page, and two new capabilities are wanted:
a **lifetime view** of cumulative earnings/tax/pension, and (in Spec B) a **student-loan
balance tracker**. This spec restructures the Salary tab into **sub-tabs** (like the Overview
tab's Month/Trends control), adds a **Lifetime cumulative aggregation**, and folds in the
deferred **pension-accuracy work** (the old "Phase 2": employer-pension YTD so the pension
panel's forecast is real, not the interim annualise).

This spec is the **foundation**: it owns the shared month-by-month walk over all recorded
salary history that Spec B's stateful loan-balance recurrence builds on.

---

## 2. Information architecture

The **Salary** top-level tab gains a segmented sub-tab control (same component/pattern as
Overview's Month/Trends): **Summary · Lifetime · Config**.

- The **month picker stays at the top, shown on all three sub-tabs.**
- Form state (gross input + all config params) is **lifted once** (it already lives in
  `Salary.tsx`) and **shared across sub-tabs**, so switching tabs preserves edits.
- A single **Save** persists the whole month's `salary_config` row (gross + params). It is
  shown on **Summary and Config**; **Lifetime is read-only** (no Save).
- **Lifetime reflects saved data only** — unsaved Summary/Config edits don't appear in
  Lifetime until Save. (State the note in the UI or accept it as expected.)

### 2.1 Summary tab (default)

Top-to-bottom: **Gross Pay** box, **Rate** box, **Breakdown** box, **Key figures** box, Save.

- **Gross Pay:** the five fields (Yearly/Monthly/Weekly/Daily/Hourly) unchanged. The old
  "Pay Details" disclosure is removed. **Bonus** is surfaced as a sixth field **the same width
  as a gross field, aligned under "Yearly"**, with **Note** spanning the remaining four
  columns on the same row. Bonus stays a **monthly** bonus value (as today).
- **Rate** and **Breakdown** boxes: exactly as shipped in Phase 1.
- **Key figures** box (replaces the standalone Stats + Pension panels; tight, single values,
  no period columns), all **as of the selected month**:
  - *Effective rates* (the four from current Stats): income tax · of gross; income tax · of
    taxable; total deductions · of gross; … incl. employer pension.
  - *Position (cumulative to date):* **Total pension fund**; **Remaining student debt**
    (the latter wired by Spec B — shows once the loan tracker lands).
  - No other position lines (user chose to keep it tight; full detail lives on Lifetime).

### 2.2 Lifetime tab

A single **"to-date" column**: cumulative from the first recorded month **through the
selected month** (so June shows one fewer paycheck than July — a clean running series for
future charts). Same **expandable hierarchy** as the Breakdown:

- **▾ Gross earned** → Base pay · Bonus
- **▾ Deductions** → Employee pension · **▾ Income tax** (→ Allowance used · Basic rate ·
  Higher rate · Additional rate*) · National Insurance · Student loan paid
- **Net take-home**
- **▾ Pension pot** → Employer contributed · Employee contributed

\* Additional rate shown only when non-zero. A **Student Loan tracker** box (Spec B) also
lives on this tab.

### 2.3 Config tab

The **Tax & Deduction Parameters**, **always editable** (no Edit/expand toggle — fields are
inputs by default), **plus** the **Hours per week / Work weeks per year / Work days per week**
fields moved here from the old Pay Details disclosure. Same save semantics (writes the month's
`salary_config`). **Keep the "Showing values inherited from {month}" indicator** so the user
knows when they're forking an inherited month into an explicit one.

---

## 3. Lifetime aggregation engine (correctness-critical)

A pure function over **all** recorded configs that walks months **from the first recorded
month through the selected month**, applying config inheritance, and **sums each month's
actual figures**.

**Income tax must be the sum of per-month *actual* PAYE, with the cumulative system reset
each April — NOT one `taxOnCumulative` call spanning all years.** Each month's real income
tax is cumulative *within its own tax year*; the lifetime total is the sum of those monthly
actuals, which automatically handles tax-year resets, mid-year pay changes, and PA tapering.
Concretely: group the walk by tax year (April→March); within each tax year reuse the existing
validated per-month PAYE (`taxOnCumulative` differenced month-over-month, exactly as
`calcSalary`/`computeSalaryYTD` do); sum the per-month results across all years.

Gross, bonus, employee pension, employer pension, NI, and student-loan *paid* follow the same
rule: **sum the per-month actuals**. Net take-home = gross − (employee pension + income tax +
NI + student loan). Pension pot = Σ(employer + employee contributions).

Output: cumulative totals (with the band/child breakdown) through the selected month, plus the
**current-tax-year slice** (used to reconcile against the Breakdown YTD).

### 3.1 Shared month-walk foundation

This month-iteration scaffold (iterate months first→selected, resolve inherited config per
month, compute that month's figures) is the **shared foundation Spec B extends** with its
stateful loan-balance recurrence. Build it as a reusable unit in `packages/core`; Spec A sums
its output, Spec B threads a running balance through the same walk. Do **not** create two
divergent walks.

**Per-month output must include an `isExplicit` flag** (true when that month has its own saved
`salary_config` row; false when the figures came from an inherited row). Spec A doesn't need
it, but Spec B's loan-balance recurrence depends on it to tell a *deliberately set* balance
from an *inherited* one — so it is a required field of the shared walk's per-month output, not
a Spec-B-local concern.

**Form-fork rule (event fields don't inherit):** when the user forks an inherited month into
an explicit one (editing any field on Summary/Config), pre-fill the standing config from the
inherited row **except** reset the two Spec-B *event* fields — `sl_balance_pence` (the
set-balance anchor) to null/unticked and `extra_payment_pence` to 0. Editing gross must never
silently create a false balance anchor or repeat last month's extra payment.

---

## 4. Pension accuracy (folds in the deferred "Phase 2")

- Widen `computeSalaryYTD` + `YTDConfigRow` + the YTD SQL select to accumulate **employer
  pension YTD**; add `employerPensionYTDPence` to `SalaryYTD`.
- Replace the Phase-1 **interim annualise** pension figures (`SalaryView` pension panel /
  `salary.ts`) with the **true forecast** (YTD + remaining at current rate), now that employer
  pension YTD exists. Keep employee/employer on one consistent basis.
- The **Total pension fund** (Summary key-figures) and **Pension pot** (Lifetime) come from
  the §3 lifetime aggregation.

---

## 5. Data layer — the "one rule" (CLAUDE.md)

The lifetime aggregation needs **all** `salary_config` rows; pension-accuracy needs the
widened YTD. Both cross the `DataPort` seam, so they are **both-adapters** changes:

- **HTTP:** `apps/web/src/data/http.ts` → `apps/api` route(s) + `apps/api/src/repo.ts`
  (which keeps its own inline YTD copy per the TS2835 ban — keep it in step).
- **Tauri:** `apps/web/src/data/queries.ts` (SQL via the executor); a plain all-rows select
  goes through `sql_select` (no new Rust command unless a transaction is needed).
- **Parity:** new fields/queries covered in **both** `apps/web/src/data/queries.test.ts`
  (node:sqlite) and the Rust `db.rs` tests.

New/changed `DataPort` surface: a method to fetch all configs (e.g. `getAllSalaryConfigs`) for
the lifetime walk, and the widened `getSalaryYTD` (employer pension).

---

## 6. Testing

- **Lifetime reconciliation:** the lifetime engine's **current-tax-year slice must equal the
  Breakdown YTD column**; lifetime totals must equal **Σ of the per-month engine outputs**
  (independent loop) — not a tautology against the same accumulator.
- **PAYE-reset correctness:** a fixture spanning ≥2 tax years with a mid-year change asserts
  the lifetime income tax = Σ of each year's actual monthly PAYE (hand-derived anchor).
- **Validated kernel untouched:** all existing `salary.test.ts` numbers unchanged.
- **Parity:** the new all-configs query + widened YTD covered in both `queries.test.ts` and
  Rust `db.rs`.

---

## 7. Build phasing (for the plan)

1. **Shared month-walk + lifetime engine** in `packages/core` (pure, fully tested) + widen
   `computeSalaryYTD` (employer pension).
2. **Cross-adapter data** (all-configs fetch + widened YTD) across `http.ts`/`repo.ts` and
   `queries.ts`, with parity tests.
3. **UI:** sub-tab nav; Summary reorg (bonus surfacing, key-figures box, accurate pension);
   Lifetime tab; Config-tab move. Wire `Remaining student debt` as a placeholder until Spec B.

---

## 8. Out of scope / preserve

- **Do not** modify the payslip-validated `taxOnCumulative` / monthly cumulative-PAYE logic.
- The Student Loan **tracker** (balance/interest/payoff) is **Spec B**; here the Lifetime tab
  only shows **Student loan *paid*** (Σ payroll deductions) and the Summary box reserves the
  **Remaining student debt** line. Note this Lifetime "Student loan paid" (payslip-fact Σ of
  payroll 9%) is **deliberately distinct** from Spec B's tracker "paid toward balance"
  (payroll + extra payments); they measure different things — see Spec B §"Two paid figures".
- `MonthlyIncome` write path and `netMonthlyPence` semantics unchanged.

---

## 9. Open questions for plan stage

- Exact key-figures wording/order on Summary.
- Whether to unify `computeSalaryYTD` and the lifetime engine on one shared walk now, or keep
  the validated YTD function parallel and add the lifetime engine alongside (lower risk).
- Naming of the Config sub-tab ("Config" vs "Settings" vs "Parameters").
