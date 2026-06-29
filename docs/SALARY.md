# Budget Tool — Salary

> A surface map for the Salary tab — the most involved area. Living description — **update it
> when you change the tab.** Reading rules and invariants are in
> [ARCHITECTURE.md](ARCHITECTURE.md). The exact, payslip-validated maths lives in `packages/core`
> (`salary`, `salaryYtd`, `salaryWalk`, `salaryLifetime`, `studentLoan`) — this doc describes the
> approach and points there; it does **not** restate the formulae (one source of truth).

## What it is

A UK salary breakdown that turns a yearly gross into a monthly take-home, and writes that
month's net pay into the budget's income layer (so Net Balance on the Overview reflects it).
A month picker sits at the top; the tab has three sub-tabs: **Summary**, **Lifetime**, **Config**.

## Data model & inheritance

`salary_config` is keyed by `(year, month)` — one row per month you **explicitly save**.
Loading a month resolves inheritance (`repo.ts:getSalaryConfig`, and `core/salaryWalk.walkMonths`):

1. **Backward** — the latest saved config at or before the month (so one saved config propagates
   forward to all later months automatically).
2. **Forward** — if none, the earliest saved config after the month.
3. **Empty** — if there are no configs at all, a blank form.

The response carries `inheritedFrom` (which month's values are shown) and `employmentStart`
(the first saved config in the tax year — where YTD accumulation begins).

**On save:** upsert the config, compute net pay, upsert `monthly_income` for that month, and —
**only if the saved month ≥ the current calendar month** — update the default income too
(editing a past month never touches the default).

## The engine (approach, not formulae)

Per-month PAYE is computed by the **cumulative method** (`core/salary.taxOnCumulative` +
`salaryYtd.computeSalaryYTD`): tax is figured on cumulative adjusted-net earnings across the
tax year and differenced to get this month — which is why mid-year starts and pay changes come
out right. The UK **tax year starts in April** (`month >= 4`), and YTD resets each April.
NI is a monthly two-band calculation; the student-loan payroll deduction is the rate above the
threshold, floored to whole pounds; a bonus is folded into gross for tax/NI/SL.

Rather than a naive "this month × 12" projection, the year figure is a **forecast** =
year-to-date actuals + the rest of the year at the current rate. Pension uses the
**employer-pension YTD** so the pension-pot forecast is real, not an interim annualisation.

> **Provenance & ground truth.** UK PAYE has two official HMRC methods: the **manual tax tables**
> (a hand-calculation approximation that rounds band limits to whole pounds) and the
> **exact-percentage method** (the precise cumulative formula computerised payroll runs). They use
> the same rates/bands/allowance but round differently at the boundaries. Real payslips come from
> payroll software, so this engine implements the **exact-percentage method** — which is why it
> reproduces the payslip to the penny. It is deliberately *not* the manual tables: at the band
> boundary it uses the **exact** cumulative band (via a marginal-relief form); "simplifying" to the
> tables' rounded-band split drifts ~10–25p/period off the payslip (see the comment in `salary.ts`).
> Taxable pay to date is rounded **down** to the whole pound. Bands, rates and thresholds are
> **user-entered statutory values** (no hardcoded defaults); the key correctness detail is entering
> the **true allowance** (e.g. £12,570 — the figure HMRC uses — not a rounded £12,500). When tax
> rules change or a figure looks off, verify against an **actual payslip**, not the test suite.

## Conformance & known simplifications

The authoritative source is HMRC's **[Specification for PAYE Tax Table Routines](https://www.cipp.org.uk/static/uploaded/7f93046f-e182-418e-856f44a8034cef5e.pdf)**
(the exact-percentage / table-routines spec). The engine follows it for the standard
rest-of-UK case and is validated to the penny against real payslips (TY 2026/27 April,
May, and June suites in `salary.test.ts`), but it does **not** implement the full spec.
Known simplifications:

- **£100k personal-allowance taper** — computed on the annual adjusted net income (spec-correct;
  previously approximated on monthly figures).
- **Higher/additional-rate boundary** — selected on the exact threshold, not the rounded-up
  value the spec uses for its Income Tests (only matters at ~£125k).
- **Free-pay / final-penny rounding** — uses exact `PA ÷ 12` and component flooring, not the
  spec's round-up-free-pay / round-down-final-1p steps. No rounding error when the configured
  allowance divides evenly by 12 (e.g. £12,579.12 → exactly £1,048.26/month); a nominal
  £12,570 would leave a 50p/month remainder.
- **Not implemented** — the Maxrate regulatory cap (§4.5.2), Scottish/Welsh tax-code variants,
  K-codes (additional pay), and the week-1/month-1 non-cumulative basis.

None of these affect the standard sub-£100k rUK case the app is built around.

## Summary

The standing picture for the selected month: a current-rate strip, the expandable payslip
breakdown (gross → deductions → net), small stat figures, and a pension panel (with the
forecast pension pot). A key-figures box surfaces the headline numbers, including
**Remaining student debt** (from the tracker below).

## Lifetime

Cumulative earnings/tax/pension **per UK tax year** (`core/salaryLifetime`). Because PAYE
resets each April, this sums per-tax-year slices rather than one continuous span. It also shows
**Student loan paid** = Σ of the payroll deductions over time.

> Two "paid" figures exist and are **deliberately different**: Lifetime's *Student loan paid*
> is payroll-only (a historical fact); the tracker's *paid toward balance* (below) is payroll +
> any extra payments, capped at the balance. They answer different questions — don't reconcile
> them.

## Student-loan tracker (`core/studentLoan`)

A running balance threaded through the same month-walk as Lifetime. It starts from a
user-declared **anchor** ("Set balance" on a Config row), grows by **interest** (daily-apportioned
from the annual rate), and shrinks by the **payroll repayment** plus any **extra payments**
(extra applies only in months with an explicit config). The balance is floored at zero, and a
**payoff projection** forward-walks from the latest rate + payroll until it clears.

## Config

All tax/pension/NI/SL parameters, always editable in place: the five gross fields, pension %s,
income-tax bands & rates, NI thresholds & rates, and the student-loan settings — plus the
"Set balance" anchor and the optional extra monthly payment. No hardcoded UK defaults; the
first-ever entry starts blank.
