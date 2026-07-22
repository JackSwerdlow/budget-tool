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
The engine also powers Overview → Month's **Money flow** sankey, which reruns `calcSalary`
client-side to draw the month's gross → deductions → net stage (see [BUDGET.md](BUDGET.md)).

## Data model & inheritance

`salary_config` is keyed by `(year, month)` — one row per month you **explicitly save**.
Loading a month resolves inheritance (`repo.ts:getSalaryConfig`, and `core/salaryWalk.walkMonths`):

1. **Backward** — the latest saved config at or before the month (so one saved config propagates
   forward to all later months automatically).
2. **Blank** — a month **before the first-ever saved config** shows a blank form (no backward
   projection); and if there are no configs at all, likewise blank.

The response carries `inheritedFrom` (which month's values are shown).

**Employment gaps (£0 gross).** A saved config with **£0 gross** marks a *not-employed* period: it
inherits forward like any other config, but the engine contributes **zeros** for every month it
covers (`calcSalary` returns an all-zero breakdown; no PAYE/NI/SL/pension). It's the explicit
"employment stops here" state — a gap between two salaried periods is filled by whichever saved
config precedes it, so to represent a real break you **save a £0 month** where it starts and a
normal salary again where work resumes (a P45-style continuation: re-employment in a later month
anchors YTD afresh per the rules below). Zero-gross months are **excluded from Lifetime's
`monthsCount`** (months actually earned) but still span the tax-year walk. Student-loan **interest
keeps accruing** across a gap; there's just no payroll repayment (earnings are below threshold).
The Summary shows a muted "not employed" hint when gross is £0.

**Untaxed income (gifts).** A separate **one-off** amount (birthday money, gifts) that is added to
**net pay only** — it never touches gross, tax, NI, pension or student-loan earnings. Like the
extra student-loan payment it applies **only in the explicitly saved month** (it does *not* inherit
forward; an inherited month blanks it). It flows into `monthly_income` (so Net Balance reflects it)
and appears as its own **Untaxed Income** line in the breakdown and a split under Lifetime's net
take-home. Combined with £0 gross this lets a not-employed person (e.g. a child) still record money
to offset spending.

**Continuous employment (the YTD anchor).** Cumulative PAYE accumulates from an
`employmentStart` anchor, resolved in core by `salaryWalk.resolveEmploymentStart` over **all**
saved configs (`taxYear(y,m) = m>=4 ? y : y-1`):

- A month in a **later** tax year than the first config anchors at **that tax year's April** —
  an inherited salary is treated as continuous employment, so YTD accumulates Apr→now instead of
  decaying to a fresh-starter £0. A future mid-year **raise** still anchors April (the raise's
  config simply applies from the raise month onward).
- The **genuine first** employed tax year keeps its real mid-year start (e.g. first job in
  November → that year's YTD starts in November).
- Before the first-ever config → `null` (blank).

The same anchor + walk feed every surface: the API/desktop `getSalaryYTD`, the Summary preview
(`salaryState.previewYtd`, which seeds the inherited prior-year config so every month resolves),
`calcSalary`, Lifetime, and the student-loan tracker. All of them carry the brought-forward salary
forward, so a non-saved future (or gap) year is treated **as if** its inherited config were saved
— a rough/cheap forecast with no growth or band-uprating assumptions (those are a later, separate
forecast surface).

**On save:** upsert the config, compute net pay, upsert `monthly_income` for that month, and —
**only if the saved month ≥ the current calendar month** — update the default income too
(editing a past month never touches the default).

**On save, later months' income is refreshed too.** `monthly_income` for a salary month is a
**cache** of the engine's net at save time — and because PAYE is cumulative, editing an earlier
month re-derives every *later* month in the same tax year, leaving their cache stale (Net Balance
would read the old figure until each was re-saved by hand). So `onSave` recomputes the later saved
months in the same tax year (`staleIncomeAfterSave` / `netForSavedMonth` in `salaryState.ts`) and
writes back only the ones whose net actually moved, via the existing `setIncome` op — no new data
operation, and the payslip-validated engine is untouched (it's the same `calcSalary`, just re-run).
Scoped to the tax year because cumulation resets each April. Net is only ever *derived* from gross,
so a divergence between cache and recompute is always staleness, never a second source of truth.

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

For the income-tax rows specifically, the breakdown's **Monthly** column is the cumulative PAYE
actually deducted that month (what feeds net pay / the ledger) while **Yearly** is the
full-year-equivalent liability at this salary (the cumulative routine evaluated at period 12) — so
for the tax rows `Monthly × 12 ≠ Yearly` **by design**.

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
**Remaining student debt** (from the tracker below). The rate strip and breakdown each carry six
period columns (Yearly/Monthly/Weekly/Daily/Hourly/…); under `sm` those collide, so a period
toggle shows one column at a time (Monthly by default) and the full table returns from `sm` up.

## Lifetime

Cumulative earnings/tax/pension **per UK tax year** (`core/salaryLifetime`). Because PAYE
resets each April, this sums per-tax-year slices rather than one continuous span. Every tax year
from the first saved config through the viewed month is counted — a year with no saved config is
**filled with the brought-forward salary** (April-anchored), so Lifetime keeps climbing into
future/forecast years instead of freezing at the last saved year (matching the Summary forecast
and the tracker; see "Data model & inheritance"). It also shows **Student loan paid** = Σ of the
payroll deductions over time.

> Two "paid" figures exist and are **deliberately different**: Lifetime's *Student loan paid*
> is payroll-only (a historical fact); the tracker's *paid toward balance* (below) is payroll +
> any extra payments, capped at the balance. They answer different questions — don't reconcile
> them.

## Student-loan tracker (`core/studentLoan`)

A running balance threaded through the same month-walk as Lifetime. It starts from a
user-declared **anchor** ("Set balance" on a Config row), grows by **interest** (daily-apportioned
from the annual rate), and shrinks by the **payroll repayment** plus any **extra payments**
(extra applies only in months with an explicit config).

**Interest** is either **flat** (the entered annual rate — right for Plan 1/4/5-style loans) or,
with the Config **Variable interest rate** toggle on (gov.uk Plan 2), **income-scaled**: the
entered rate becomes the minimum (RPI-only) rate and the effective rate climbs linearly to the
max rate as the tax year's income moves between the lower and upper income thresholds
(`rate = min + (max − min) × clamp((income − lower)/(upper − lower), 0, 1)`). Income is the
same base the payroll repayment uses (gross + bonus), summed over the actual months of each
tax year — a part-year start yields the real lower income (the SLC does not annualise), and a
raise saved later in the year raises the whole year's rate. The VIR is applied
contemporaneously per tax year; the SLC's real charge-RPI-then-adjust-after-HMRC-data mechanism
trues the year up to the same figure, so the simpler model converges with it (the intra-year
compounding difference is second-order). RPI/threshold changes over time (each Sept/April) are
represented the usual way — save a config that month with the new figures. The statutory
formula: [reg 21A, SI 2009/470](https://www.legislation.gov.uk/uksi/2009/470/regulation/21A). The balance is floored at zero, and a
**payoff projection** forward-walks from the latest rate + payroll until it clears. The tracker
box ends with a per-month balance **sparkline** (`BalanceSparkline` in `SalaryView.tsx`, drawn
from the already-computed `series`; the pre-anchor £0 lead-in is trimmed, and the y-axis spans
min→max so ~£60 monthly movements stay visible against a large balance). Hovering it shows a
crosshair and swaps the strip below to that month's balance and its change vs the previous month
(up = red, down = green).

## Config

All tax/pension/NI/SL parameters, always editable in place: the five gross fields (which accept
**£0** — an employment gap; see "Data model & inheritance"), the monthly **bonus** and the one-off
**untaxed income** box (both on the Summary form), pension %s, income-tax bands & rates, NI
thresholds & rates, and the student-loan settings (including the variable-interest-rate toggle with
its max rate + income thresholds) — plus the "Set balance" anchor and the optional extra monthly
payment. A first-ever month pre-fills the
statutory tax/NI/SL parameters (allowance, bands, rates, thresholds) and the time fields with
current UK values as a convenience (`EMPTY_CONFIG_FIELDS` in `salaryState.ts`, kept matching the
payslip-validated set); gross pay, pension %s and the student-loan balance/interest start blank,
and nothing persists until you Save.
