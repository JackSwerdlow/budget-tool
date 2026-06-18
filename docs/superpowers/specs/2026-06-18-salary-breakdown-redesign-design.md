# Salary Breakdown — Redesign Spec

> **Status:** Approved design (brainstorm), pre-plan.
> **Date:** 2026-06-18 · Extends `docs/SALARY_SPEC.md` and `docs/SALARY_PLAN.md`.
> Replaces the single flat breakdown table on the Salary tab with four focused sections.

---

## 1. Motivation

The current Salary tab renders one wide table (`calcSalary` → `rows[]`) with five columns
(Yearly / Monthly / Weekly / Daily / Hourly) covering everything from gross to effective tax
rate. Two problems:

1. **The "Yearly" tax figures are an annualise-this-month projection** (`taxOnCumulative` at
   period 12 on `adjustedNetM × 12`). When salary starts or changes mid-year this is wrong —
   e.g. a November start shows £0 tax annualised to £0, and net annualises to an over-inflated
   figure (a year of pay with almost no tax). The user noticed this.
2. **Mixed concerns in one grid** — per-period rates, tax-year totals, and percentages all
   share the same five columns, several of which are meaningless per row (hourly tax, etc.).

The redesign splits these into four purpose-built sections and replaces the inaccurate
annualised "Yearly" with an accurate **Forecast** (year-to-date actuals + the rest of the year
at the current rate).

**Hard constraint — do not touch the validated math.** `taxOnCumulative` and the monthly
cumulative-PAYE differencing in `calcSalary` are payslip-validated (see
`salary-paye-payslip-ground-truth` memory and `salary.test.ts`). This redesign **only changes
which earnings figure is fed into `taxOnCumulative`** and how results are presented. No
re-derivation of PAYE.

---

## 2. The two axes (core idea)

The old table tangled two different questions. The redesign separates them:

- **Rate axis** — "what is my standing rate, sliced into time units?" → Yearly / Monthly /
  Weekly / Daily / Hourly. A flat-year hypothetical; meaningful only for gross and take-home.
  **This is the one correct home for annualising.**
- **Tax-year-position axis** — "where am I in the actual tax year?" → This Month / YTD /
  Forecast. Carries the accurate, payslip-true figures including the full tax breakdown.

---

## 3. Layout — four sections

Rendered top to bottom on the Salary tab, below the existing month picker, gross input, and
config panel (those are unchanged). Sections ① and ② are full width with **6 columns each so
they stack tidily**; ③ and ④ are small and share one row.

### 3.1 ① Rate strip — standing current rate

| | Yearly | Monthly | Weekly | Daily | Hourly | % of Gross |
|---|---|---|---|---|---|---|
| **Gross Income** | … | … | … | … | … | 100% |
| **Net Income** | … | … | … | … | … | net ÷ gross |
| **Net incl. employer pension** | … | … | … | … | … | (net + employer pension) ÷ gross |

- **Annualise basis** (flat-year hypothetical — correct here): all figures derive from the
  current month's standing rate.
  - `gross_yearly = (grossM + bonusM) × 12`; `monthly = gross_yearly ÷ 12`;
    `weekly = gross_yearly ÷ work_weeks_per_year`; `daily = weekly ÷ work_days_per_week`;
    `hourly = weekly ÷ hours_per_week`.
  - **Net** uses a flat-year tax calc: `standingTax = taxOnCumulative(adjustedNetM × 12, 12, …)`,
    `standingNI = thisMonthNI × 12`, `standingSL = thisMonthSL × 12`;
    `net_yearly = adjustedNetM×12 − standingTax − standingNI − standingSL`, then sliced.
  - **Net incl. employer pension** = net + `employerPensionM × 12`, sliced.
- `% of Gross` is row-relative to the gross-income yearly figure.

### 3.2 ② Breakdown — accurate payslip (expandable rows)

| Row | Yearly (Forecast) | Monthly | Weekly | Daily | Hourly | YTD |
|---|---|---|---|---|---|---|

Rows are a **collapsible hierarchy** (click a parent to expand/collapse its children):

- **▾ Gross Income** → Base Pay · Bonus
- **▾ Deductions** → Employee Pension · **▾ Income Tax** (→ Allowance Used · Basic Rate ·
  Higher Rate · Additional Rate*) · National Insurance · Student Loan†
- **▾ Net Income** → Adjusted Net Income · Taxable Income

\* Additional Rate row shown only when the additional band is reached (>0).
† Student Loan row shown only when `sl_enabled`.

Column meanings (Option A, confirmed):

- **Monthly** = this month's actual figure (the existing validated monthly cumulative-PAYE
  result). For the parent/Net rows it is the real payslip figure for the viewed month.
- **Weekly / Daily / Hourly** = the Monthly figure annualised and re-sliced:
  `weekly = monthly × 12 ÷ work_weeks_per_year`, `daily = weekly ÷ work_days_per_week`,
  `hourly = weekly ÷ hours_per_week`. **Shown only for Gross/Base/Bonus and Net rows**; blank
  (—) for every deduction/tax row (an "hourly tax" is meaningless).
- **Yearly (Forecast)** = YTD actuals + remaining months at the current rate (see §4).
  Note: in a salary-change month `Monthly × 12 ≠ Yearly(Forecast)` — that gap is intentional
  and informative.
- **YTD** = actual cumulative figures from the start of the tax year through the viewed month.

> The old `Effective Tax Rate` and `Net Pay % of Gross` rows are removed from this table —
> they move to §3.3.

### 3.3 ③ Stats (small, single value)

| | |
|---|---|
| Effective tax + NI rate | (income tax + NI + student loan) ÷ gross |
| Effective tax + NI rate (incl. employer pension) | (income tax + NI + student loan) ÷ (gross + employer pension) |

- **Single figure each** (no per-period columns). Computed on the **Forecast basis** (this tax
  year's projected totals — see §4), so the figure is consistent with the breakdown and stays
  accurate in the case that motivated the redesign: a November starter's *actual* effective rate
  this year (full allowance against partial earnings → low) rather than a standing-rate
  hypothetical (~20%+). Excludes pension from the numerator (pension is saving, not tax). The
  second row shows the lower effective rate once the employer's contribution is counted as part
  of total package.
  > The user initially assumed this figure "should be the same" regardless of period — true only
  > in a steady year. **Basis (Forecast vs standing-rate) is an open confirm — see §8.**

### 3.4 ④ Pension (small)

| | Month | Yearly (Forecast) | All-time |
|---|---|---|---|
| Employer | … | … | … |
| Employee | … | … | … |
| **Into pot** | … | … | … |

- **Month** = this month's employer / employee contribution.
- **Yearly (Forecast)** = contribution YTD + remaining months at current rate.
- **All-time** = total contributions recorded across **all months in the database**
  (every tax year), from the first recorded config through the viewed month, applying config
  inheritance.

---

## 4. Calculation semantics

Let `p` = tax period of the viewed month (Apr = 1 … Mar = 12), `r = 12 − p` remaining months,
and "current bands" = the viewed month's config (PA, rate bands, NI thresholds, rates).

All three "position" columns reuse the **existing** `taxOnCumulative`:

- **This Month** — unchanged. The existing monthly cumulative-PAYE result (`basicM`, `higherM`,
  `addlM`, `niMonthly`, `slMonthly`, `netPayMonthly`, `PAUsedM`, …).
- **YTD** — `[basicYTD, higherYTD, addlYTD] = taxOnCumulative(adjustedNetYTD, p, currentBands)`;
  this equals the sum of monthly deductions to date. Gross/employee-pension/adjusted-net/NI/SL
  YTD come from `computeSalaryYTD` (already returned by `getSalaryYTD`: `grossYTDPence`,
  `employeePensionYTDPence`, `adjustedNetYTDPence`, `niYTDPence`, `slYTDPence`). `taxableYTD`,
  `allowanceUsedYTD`, income-tax YTD, and `netYTD` are **derived** from these + current bands.
  Today only `adjustedNetYTDPence`/`priorAdjNetYTDPence` are passed into `calcSalary`; Phase 1
  simply **widens the `ytdInput` object** to carry the already-fetched gross/NI/SL/pension YTD.
  **No new query** is needed for the breakdown's YTD column.
- **Forecast** — `forecastAdjNet = adjustedNetYTD + r × adjustedNetM`;
  `[basicF, higherF, addlF] = taxOnCumulative(forecastAdjNet, 12, currentBands)`;
  `forecastNI = niYTD + r × thisMonthNI`; `forecastSL = slYTD + r × thisMonthSL`;
  `forecastNet = forecastAdjNet − forecastTax − forecastNI − forecastSL`. Likewise gross,
  employee pension, taxable, allowance-used forecast by the same `YTD + r × thisMonth` pattern.

This makes the November-start case correct: YTD tax is the real (low) amount, the remaining
months are projected at the current rate, and `taxOnCumulative(forecastAdjNet, 12)` applies the
full annual allowance to the actual partial-year earnings — never the spurious full-salary tax.

**Approximations (carried over / acceptable, document in code):**
- PA taper above £100k uses the monthly effective-PA approximation already in `salary.ts`
  (the existing "fix later" note).
- YTD/Forecast use the **current** month's bands/rates even if earlier months in the year used
  different ones — this matches how PAYE applies the live tax code; exact mid-year band changes
  are not reconstructed.

---

## 5. Data model & code changes

### 5.1 Core (`packages/core`)

- **New structured output** from the salary engine (replacing the flat `SalaryBreakdown.rows`
  shape). A typed model with: `rateStrip` (3 rows × {yearly, monthly, weekly, daily, hourly,
  pctGross}), `breakdown` (hierarchical line items, each with {forecast, monthly, weekly, daily,
  hourly, ytd} where applicable + flags for deduction/group/expandable), `stats`
  ({effectiveRate, effectiveRateInclEmployerPension}), `pension` (3 rows × {month, yearlyForecast,
  allTime}), and `netMonthlyPence` (preserved — the save path writes this to `MonthlyIncome`).
- **Keep** `taxOnCumulative` and the monthly cumulative differencing verbatim.
- **Test fidelity (critical).** Replacing the output shape breaks every assertion in
  `salary.test.ts`, which currently checks payslip-validated pence values against `rows`. When
  migrating those tests, the **same validated pence numbers must be re-asserted** through the new
  structure (this-month basic/higher/NI especially). The new shape reproduces those figures — it
  does **not** get to redefine them. Do not "realign" the tests to whatever the new code emits;
  the payslip is the ground truth (see `salary-paye-payslip-ground-truth` memory). Add YTD /
  Forecast assertions on top; never weaken the existing this-month checks.
- **`SalaryYTD`** (`types.ts`): add `employerPensionYTDPence` (and, if base/bonus are split in
  the YTD column, `grossBaseYTDPence` / `bonusYTDPence`).
- **`computeSalaryYTD` + `YTDConfigRow`** (`salaryYtd.ts`): add `employer_pension_pct` to the
  selected columns and accumulate `employerPensionYTD` inside the existing month loop.
- **All-time pension**: a new pure aggregation over **all** config rows (all tax years),
  applying inheritance month-by-month from the first recorded config to the viewed month. Either
  a new function `computeAllTimePension(allConfigs, …)` or an extension of the YTD path.

### 5.2 Data layer — the "one rule" (CLAUDE.md)

`getSalaryYTD` is a `DataPort` method, so widening it (employer-pension YTD + all-time pension)
is a **both-adapters change**:

- **HTTP path:** `apps/web/src/data/http.ts` → new/updated `apps/api` route + `apps/api/src/repo.ts`
  (which keeps its **own inline copy** of the YTD math due to the TS2835 `@budget/core` import
  ban — keep it in step with `computeSalaryYTD`).
- **Tauri path:** `apps/web/src/data/queries.ts` (SQL via the executor); add a Rust command in
  `apps/desktop/src-tauri/src/db.rs` only if a new multi-statement/transactional read is needed
  (a plain all-rows select can go through `sql_select`).
- **Parity:** cover the new fields in **both** `apps/web/src/data/queries.test.ts` (node:sqlite)
  and the `db.rs` Rust tests.

### 5.3 UI (`apps/web/src/features/salary/`)

- Replace the single breakdown `<table>` in `Salary.tsx` with the four sections. Extract focused
  sub-components — e.g. `RateStrip`, `BreakdownTable` (with expand/collapse state), `StatsPanel`,
  `PensionPanel` — into the `salary/` folder. `Salary.tsx` is already ~580 lines; this split is
  part of the work.
- Preserve constraints from CLAUDE.md: `PoundInput` / `PctInput` stay at module scope;
  `onGrossChange` derives only the other fields; `window.isTauri` adapter switch untouched.
- Expand/collapse is local UI state; default expanded/collapsed state TBD in plan (suggest:
  Gross + Deductions + Net expanded, Income Tax collapsed).

---

## 6. Build phasing

Recommended two phases (the engine/UI work is cheap and self-contained; the pension data work is
the only piece that crosses the adapter seam):

- **Phase 1 — engine + layout (no cross-adapter data change).** New structured output; rate
  strip; breakdown with This Month / W·D·H / **Forecast** / YTD — all derivable from the
  already-fetched `SalaryYTD` (gross/NI/SL/pension/adjusted-net YTD) + current config, by
  widening the `ytdInput` object passed into `calcSalary` (no query change); stats; Net Income
  expansion; full UI restructure. Pension section ships with **Month** (fully available) and
  **Yearly** shown as an interim annualise, **All-time hidden**, until Phase 2.
- **Phase 2 — pension data (both adapters + parity).** Extend `computeSalaryYTD` with employer-
  pension YTD and add the all-time aggregation across `http.ts` + `queries.ts` (+ `repo.ts`
  inline copy, + Rust if needed), with parity tests. Wire the accurate pension Forecast and
  All-time columns.

Splitting this way lands the visible win (accurate Forecast + tidy layout) first and isolates the
seam-crossing change.

---

## 7. Out of scope / preserve

- **Do not** modify `taxOnCumulative` or the monthly cumulative-PAYE logic.
- **Do not** let migrated tests redefine the payslip-validated this-month figures (see §5.1).
- **Do not** build §9-deferred salary features (student-loan payoff tracker, unpaid-days
  effective rate).
- `MonthlyIncome` write path and `netMonthlyPence` semantics unchanged.
- Month picker, gross input (5 fields), Pay Details disclosure, and the Tax & Deduction
  Parameters config panel are unchanged.

---

## 8. Open questions for plan stage

- **Stats basis (§3.3) — Forecast vs standing-rate.** Spec currently picks **Forecast** (accurate
  for the actual tax year, incl. mid-year starters). Standing-rate would be period-independent but
  reintroduces the inaccuracy the redesign targets. Confirm Forecast is what you want.
- Exact effective-rate definitions in §3.3 — confirm numerator/denominator wording with a real
  payslip before locking.
- Whether the YTD column splits Base vs Bonus (needs two extra YTD accumulators) or shows only
  the combined Gross Income YTD at the parent level.
- Default expand/collapse state of the breakdown hierarchy.
