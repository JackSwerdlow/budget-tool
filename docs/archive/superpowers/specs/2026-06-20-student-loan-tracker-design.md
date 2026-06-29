# Student Loan Tracker — Design Spec (Spec B)

> **Status:** Approved design (brainstorm), pre-plan.
> **Date:** 2026-06-20 · **Builds on** Spec A — `2026-06-20-salary-subtabs-and-lifetime-design.md`.
> Spec A owns the shared month-walk and the Salary sub-tabs; this spec threads a running
> loan balance through that walk and adds the tracker UI.

---

## 1. Motivation

The salary feature records the **student-loan payroll deduction** (9% of gross above the
threshold) but does not track the **loan balance** — what's still owed, how interest grows it,
and when it will be paid off. This spec adds a stateful **balance tracker**: a running balance
that starts from a user-declared figure, grows by interest, and shrinks by the payroll
repayment plus any extra payments, producing a "remaining student debt" figure as of any month
and a payoff projection.

This is the second half of the Salary-area redesign. **Spec A is the foundation** — it builds
the month-by-month walk over all recorded salary history (resolving config inheritance and
computing each month's actual figures, including the payroll SL deduction via `calcSalary`).
Spec B reuses that exact walk and threads one extra piece of state through it: the loan balance.
**Do not create a second walk.**

---

## 2. The money model

Two distinct, deliberately separate concepts (see §6 "Two paid figures"):

1. **Payroll repayment** — 9% of gross above the SL threshold, computed by `calcSalary` for the
   month. A payslip fact. Already deducted in the Breakdown/Lifetime.
2. **Loan balance** — what's still owed. Not a payslip fact; it's a *tracker* the user seeds and
   that the recurrence below maintains.

### 2.1 Inputs (per month)

- **Set balance (anchor)** — `sl_balance_pence`. Already in the schema (nullable). When the user
  declares a balance for a month ("new loan terms / starting figure"), this is non-null **for
  that explicit month only**. It is an *event*, not standing config: it **does not inherit** (see
  §2.3 and Spec A §3.1 form-fork rule). A small **"Set balance (new loan terms)" checkbox** in
  Config reveals the amount input; unticked ⇒ `sl_balance_pence` null for that month.
- **Extra payment** — **new column** `extra_payment_pence` (INTEGER NOT NULL DEFAULT 0).
  Pay-down only, so **≥ 0** (validated). Also an *event*: does not inherit; 0 unless explicitly
  entered on that month's row. Increasing the loan is **not** an extra payment — that is done by
  *setting a new balance* (which represents new loan terms).
- **Annual interest rate** — `sl_interest_rate_pct`, **redefined as an annual nominal %**
  (see §7). Standing config: **inherits** like the other rate params.
- **Payroll repayment** — derived from `calcSalary` for the month (not stored).

### 2.2 The recurrence (per month M, in walk order)

Let `B_prev` = the balance series value carried out of month M−1 (0 before the first month).

- **Anchor month** (M `isExplicit` **and** `sl_balance_pence` non-null):
  `balance_M = sl_balance_pence` (a **declared closing figure** — no interest/payment math is
  applied to the balance that month; the user is stating "it's this now"). The recurrence
  resumes next month from this value.
- **Non-anchor month:**
  `interest_M = round( B_prev × (annualRate/100) × daysInMonth / daysInYear )`
  `balance_M = max( 0, B_prev + interest_M − payrollRepayment_M − extraPayment_M )`

  - `daysInMonth` = actual calendar days of month M; `daysInYear` = 365 (**366 in a leap year**).
    This is daily accrual on the opening balance, **summed for the month** (no intra-month
    compounding); interest **compounds month-to-month** because next month's `B_prev` includes
    it.
  - **Floor at £0** and **cap the payoff month**: if `B_prev + interest_M ≤ payrollRepayment_M +
    extraPayment_M`, the balance lands exactly at 0 (the final period only "needs" the
    outstanding amount). Once 0, it stays 0 — no further interest, and further payments don't
    drive it negative.

### 2.3 Anchor vs inheritance (correctness crux)

Config inheritance copies a prior explicit row forward to fill un-saved months. If the inherited
`sl_balance_pence` were treated as an anchor, **every** inherited month would re-anchor to a
stale figure and the recurrence would never run. Guard:

> **A month is an anchor iff it has its own saved row (`isExplicit` = true, from Spec A §3.1's
> per-month flag) AND that row's `sl_balance_pence` is non-null.** Inherited months are never
> anchors; their `sl_balance_pence`/`extra_payment_pence` are treated as null/0 regardless of
> the inherited row's contents.

Paired with Spec A §3.1's **form-fork rule** (forking an inherited month resets the two event
fields), this makes "non-null `sl_balance_pence` on an explicit row" a reliable, unambiguous
anchor signal.

---

## 3. Outputs

From the same first→selected walk (Spec A §3), additionally accumulate/return:

- **Remaining student debt as of the selected month** = `balance_M` at the selected month
  (= the running series value; June shows one fewer repayment than July, matching Lifetime).
- **Total interest accrued to date** = Σ `interest_M` through the selected month.
- **Total paid toward balance to date** = Σ (`payrollRepayment_M` + `extraPayment_M`) actually
  applied to the balance (i.e. after the final-period cap; excludes anything past £0).
- **Balance series** (per-month closing balance) — for future charts, same shape as Lifetime.

### 3.1 Payoff projection (forward-walk — *flagged as an addition, see §9*)

A **separate forward walk** beyond recorded data: starting from the selected month's balance,
continue the recurrence with the **latest month's rate and payroll repayment held constant** and
no further extra payments, until the balance hits £0. Report the **payoff month/year** and the
**remaining interest** to be paid. This is distinct from Spec A's first→selected walk over
*recorded* months and must be budgeted for separately in the plan.

---

## 4. UI placement

- **Lifetime tab** — a **"Student Loan tracker"** box (its own box, below Lifetime totals):
  - *Remaining balance* (as of selected month) · *Total interest accrued* · *Total paid toward
    balance* · *Projected payoff* (month/year + remaining interest). Headline figures, no
    per-month table for now (the balance series exists for future charts).
- **Config tab** — under the tax/deduction params, the SL inputs:
  - existing `sl_enabled`, `sl_threshold_yearly_pence`, `sl_rate_pct`, **`sl_interest_rate_pct`
    relabelled "Annual interest rate (%)"**;
  - **"Set balance (new loan terms)"** checkbox + amount (writes `sl_balance_pence`, this month
    only);
  - **"Extra payment this month"** amount, ≥ 0 (writes `extra_payment_pence`).
- **Summary tab** — the **"Remaining student debt"** key-figure (reserved by Spec A) is wired to
  the §3 remaining-balance output.

---

## 5. Data layer — the "one rule" (CLAUDE.md)

The only new persisted field is **`extra_payment_pence`**. Follow the `bonus_pence` precedent
(most recently added column) exactly — it touches every salary_config read/write on both
adapters:

- **Schema:** `apps/api/src/db/schema.sql` — add `extra_payment_pence INTEGER NOT NULL DEFAULT 0`.
- **Type:** `packages/core/src/types.ts` `SalaryConfig` — add `extra_payment_pence?: number`.
- **HTTP:** `apps/api/src/repo.ts` — add to the upsert column list, `excluded.` clause, bind
  params, and the read select (local type alias per the TS2835 ban).
- **Tauri:** `apps/web/src/data/queries.ts` — add to the upsert + select; `apps/desktop/src-tauri/src/db.rs`
  if its salary_config insert/select enumerates columns.
- **Seed:** `apps/api/src/seed-demo.ts` — set a sane `sl_balance_pence` anchor on the start month
  and leave `extra_payment_pence` 0 (so the tracker has data to show in the demo).

The lifetime/SL walk needs **all** `salary_config` rows — that fetch (`getAllSalaryConfigs`) is
**already added by Spec A**; Spec B needs no new query, only the new column on the existing
read/write path. The SL recurrence itself lives in `packages/core` on top of Spec A's walk.

---

## 6. Two paid figures (state both; they are not equal)

These diverge **the moment there is any extra payment** (not only after payoff) — define both so
neither is later "fixed" as a bug:

- **Lifetime "Student loan paid"** (Spec A) = Σ payroll 9% deductions. A payslip fact; ignores
  the balance entirely (it keeps accruing even past payoff, exactly as payroll would until the
  user disables `sl_enabled`).
- **Tracker "Total paid toward balance"** (this spec) = Σ (payroll + extra) actually applied to
  the balance, **capped at payoff** (stops once the balance reaches £0).

Likewise the **anchor month's payroll deduction still counts** toward Lifetime "paid" but does
**not** reduce the declared balance (the user overrode it) — expected, not a bug.

---

## 7. Interest-rate semantics (redefine, no migration needed)

`sl_interest_rate_pct` is currently **stored but never used in any calculation**; the only UI is
a neutral `PctInput label="Interest rate (optional)"` and the demo seed value is `4.3` (coherent
as an annual %, absurd as a monthly one). So redefine it as **annual nominal %** with no data
migration; just **relabel the Config input "Annual interest rate (%)"**. (If, before
implementation, any code is found to treat it as monthly, that becomes a migration note — but
none exists today.)

---

## 8. Testing

- **Recurrence unit tests** (`packages/core`): anchor seeds the series; non-anchor month applies
  `interest − payroll − extra`; interest uses 365/**366** correctly; balance **floors at £0** and
  the **final payment caps** at the outstanding amount; a paid-off balance stays 0 with later
  payments not going negative.
- **Anchor-vs-inheritance:** a fixture where an explicit anchor month is followed by inherited
  months asserts the inherited months **do not** re-anchor (recurrence runs), and that an
  explicit non-balance edit (gross change) **doesn't** create a false anchor (relies on the
  form-fork reset + `isExplicit` guard).
- **Two paid figures:** a fixture with an extra payment asserts Lifetime "Student loan paid"
  (Σ payroll) **≠** tracker "paid toward balance" (payroll + extra), by exactly the extra.
- **Payoff projection:** from a known balance/rate/payment, the forward walk reaches £0 at the
  hand-derived month with the hand-derived remaining interest.
- **Parity:** `extra_payment_pence` round-trips in **both** `apps/web/src/data/queries.test.ts`
  (node:sqlite) and the Rust `db.rs` tests, alongside the Spec A all-configs/YTD parity.

---

## 9. Open questions / for the user-review gate

- **Payoff projection (§3.1) is an addition, not an explicit request.** Keep it (low cost,
  natural fit on the tracker box) or cut per YAGNI? Recommend keep.
- Whether the tracker box should later show a **per-month mini-table / sparkline** (deferred for
  now — the balance series is computed and available).
- Exact wording/order of the tracker headline figures.

---

## 10. Out of scope / preserve

- **Do not** change the payslip-validated `calcSalary` SL **payroll** computation (9% above
  threshold) — the tracker consumes it, it doesn't replace it.
- Real-world **payroll-deduction cessation at payoff** is out of scope: `calcSalary` keeps
  computing 9% from gross (it doesn't know the balance). The tracker floors the *balance* and
  caps the *paid-toward-balance* figure; the Lifetime "paid" figure intentionally still reflects
  raw payroll. The user disables `sl_enabled` when truly paid off.
- Student-loan **plan type selection** (Plan 1/2/4/5 preset thresholds & rates) is not added; the
  existing threshold/rate fields stay free-form.
