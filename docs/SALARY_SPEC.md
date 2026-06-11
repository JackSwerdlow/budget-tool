# Salary Tab — Design Spec

> **Status:** Approved design, pre-implementation.
> **Date:** 2026-06-11 · Extends the base budget tool (see PLAN.md and SPEC.md).

---

## 1. Overview

A new top-level **Salary** tab that recreates the original Excel "Salary & Income" worksheet
as a proper UI. It performs a full UK salary breakdown (gross → deductions → net pay) and
feeds the resulting net monthly figure directly into the app's existing `MonthlyIncome`
layer — replacing the ad-hoc income entry previously buried in the Manage tab.

The Manage tab's income section is removed. Salary is the canonical way to set monthly income.

---

## 2. Data Model

### 2.1 New table: `salary_config`

Keyed by `(year, month)` — one row per month that has been explicitly saved. All pence
values stored as integers (pence), all percentages stored as real numbers (e.g. `5.45` for 5.45%).

**Gross & time fields**

| Column | Type | Example | Notes |
|---|---|---|---|
| `year` | INTEGER | 2026 | |
| `month` | INTEGER | 6 | |
| `gross_yearly_pence` | INTEGER | 5946600 | null until user enters salary |
| `note` | TEXT | "April pay rise" | optional label for this month's snapshot |

**Time & hours fields** (stored separately, drive the weekly/daily/hourly columns only — never used in tax calculations)

| Column | Type | Typical value |
|---|---|---|
| `hours_per_week` | REAL | 37 |
| `work_weeks_per_year` | REAL | 52 |
| `work_days_per_week` | REAL | 5 |

**Pension**

| Column | Type | Typical value |
|---|---|---|
| `employee_pension_pct` | REAL | 5.45 |
| `employer_pension_pct` | REAL | 28.97 |

**Income tax bands** (UK 2025/26 typical values — stored as empty/null on first entry)

| Column | Type | Typical value |
|---|---|---|
| `personal_allowance_pence` | INTEGER | 1257000 |
| `basic_rate_band_pence` | INTEGER | 3770100 |
| `additional_rate_threshold_pence` | INTEGER | 12514000 |
| `basic_rate_pct` | REAL | 20 |
| `higher_rate_pct` | REAL | 40 |
| `additional_rate_pct` | REAL | 45 |

Note: `additional_rate_threshold_pence` is a total income figure (£125,140). The implementation
must convert to a taxable income boundary by subtracting `personal_allowance_pence` before
applying the 45% band.

**National Insurance** (UK 2025/26 typical values — stored as empty/null on first entry)

| Column | Type | Typical value |
|---|---|---|
| `ni_lower_monthly_pence` | INTEGER | 104750 |
| `ni_upper_monthly_pence` | INTEGER | 418917 |
| `ni_primary_pct` | REAL | 8 |
| `ni_upper_pct` | REAL | 2 |

**Student Loan (Plan 2)**

| Column | Type | Typical value |
|---|---|---|
| `sl_enabled` | INTEGER | 0 — false by default; not everyone has a student loan |
| `sl_threshold_yearly_pence` | INTEGER | 2847000 |
| `sl_rate_pct` | REAL | 9 |
| `sl_balance_pence` | INTEGER | null |
| `sl_interest_rate_pct` | REAL | null |

### 2.2 Config inheritance

When loading the salary config for a given month, the API applies a three-step lookup:

1. **Look backwards** — most recent explicit config at or before the requested month:
   ```sql
   SELECT * FROM salary_config
   WHERE (year < :year) OR (year = :year AND month <= :month)
   ORDER BY year DESC, month DESC LIMIT 1
   ```
2. **Look forwards** — if nothing found, earliest config after the requested month:
   ```sql
   SELECT * FROM salary_config
   WHERE (year > :year) OR (year = :year AND month >= :month)
   ORDER BY year ASC, month ASC LIMIT 1
   ```
3. **Empty form** — if still nothing found, this is the first ever entry. All fields
   (including tax bands and gross) are left empty/null for the user to fill in.

No hardcoded UK defaults. The response always includes `inheritedFrom: { year, month } | null`
so the UI can show which month's values are being displayed when inherited.

This means a single saved config propagates forward to all subsequent months automatically.
Editing a month creates (or updates) an explicit row for that month only — months after it that
have no explicit row continue to inherit from it.

### 2.3 On save

Saving a config for `(year, month)`:

1. Upserts the `salary_config` row.
2. Calculates net monthly pay using the core salary engine.
3. Upserts `MonthlyIncome` for that month with the derived net pay.
4. **If the saved month ≥ the current calendar month**, also updates `defaultIncomePence`.
   Editing or adding a past month does not touch the default.

---

## 3. Salary Calculation Engine

Lives in `packages/core/src/salary.ts` — pure functions, no I/O, fully testable.

### Derived figures (matching the Excel layout)

All figures are computed from the stored config. The five time columns are:

- **Yearly**: base figure
- **Monthly**: yearly ÷ 12
- **Weekly**: yearly ÷ work_weeks_per_year
- **Daily**: weekly ÷ work_days_per_week
- **Hourly**: weekly ÷ hours_per_week

Rows in the breakdown:

| Row | Calculation |
|---|---|
| Gross Income | user input |
| Employer Pension | gross × employer_pension_pct |
| Total Compensation | gross + employer pension |
| (Employee Pension) | −(gross × employee_pension_pct) |
| Adjusted Net Income | gross + employee pension deduction |
| Taxable Income | adjusted net − personal allowance |
| (Income Tax) | −(min(taxable, basic_rate_band) × basic_rate + max(0, min(taxable, add_threshold_taxable) − basic_rate_band) × higher_rate + max(0, taxable − add_threshold_taxable) × additional_rate) — where add_threshold_taxable = additional_rate_threshold − personal_allowance |
| (National Insurance) | monthly NI × 12 — where monthly NI = max(0, min(monthly_gross, ni_upper) − ni_lower) × primary_rate + max(0, monthly_gross − ni_upper) × upper_rate |
| (SLC Deduction) | −roundDown(max(0, (gross − sl_threshold) × sl_rate) ÷ 12) × 12 — only if sl_enabled |
| Total Deductions | sum of all deduction rows |
| **Net Pay** | adjusted net + tax + NI + SLC |
| Effective Tax Rate | −total_deductions ÷ gross |
| Net Pay % of Gross | net_pay ÷ gross |
| incl. Compensation | total_compensation + total_deductions |

---

## 4. UI Structure

The Salary tab is a new top-level nav tab (alongside Overview, Add, Manage).
A **month picker** sits at the top, same pattern as the Overview tab, for navigating to
any month. When the selected month has no explicit config, the UI displays inherited values
with a subtle indicator showing which month they were last saved from.

### 4.1 Gross Input section

Five side-by-side fields: **Yearly · Monthly · Weekly · Daily · Hourly**. Editing any one
immediately derives and fills the others (live, no calculate button — the math is trivial).

A **note** field sits below the five inputs — a short free-text label for this month's
snapshot (e.g. "April pay rise + 2026/27 tax year"). Optional.

### 4.2 Time & Hours disclosure

A collapsible row (collapsed by default, same pattern as the delivery fee in the Lists tab).
Contains: **hours per week**, **work weeks per year**, **work days per week**.
These rarely change but affect the Weekly / Daily / Hourly columns.

### 4.3 Config panel

Displays all tax/pension/NI/SLC parameters as a compact read-only summary.
An **Edit** button reveals all fields in-place; **Save / Cancel** to commit.
The panel looks visually immutable until Edit is triggered.

Two visual sub-sections within the panel:
- **Pension**: employee %, employer %
- **Tax & Deductions**: personal allowance, rate bands, NI thresholds, SLC settings

### 4.4 Breakdown table

Full derived table matching the Excel layout.
Rows as listed in §3. Columns: Yearly / Monthly / Weekly / Daily / Hourly.
Deduction rows styled in a muted negative colour (consistent with the app's existing
visual language for negative figures).
Summary rows (Net Pay, Effective Tax Rate, Net Pay % of Gross, incl. Compensation)
visually separated or emphasised.

### 4.5 Save button

**"Save Income"** button below the breakdown table.

When the selected month ≥ current calendar month: saves config + MonthlyIncome + updates
default. When the selected month is in the past: saves config + MonthlyIncome only, with a
small note below the button: "Saving to [Month YYYY] only · won't update default."

---

## 5. API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/salary-config/:year/:month` | Returns config for the given month (with inheritance applied) |
| PUT | `/api/salary-config/:year/:month` | Upserts config; triggers MonthlyIncome write and optional default update |

The GET response includes a `inheritedFrom: { year, month } | null` field so the UI can
show which month's values are being displayed when inherited.

---

## 6. Deferred / Follow-on

- **Student Loan payoff tracker**: the per-month `sl_balance_pence` field already supports
  this. A future iteration could display a balance trajectory and project a payoff date based
  on the monthly deduction and `sl_interest_rate_pct`.
- **Unpaid days off / annual leave**: an additional display-only concept that would show an
  "effective" daily/hourly rate accounting for actual days worked. Importantly, this must
  never affect the core tax/NI/SLC calculations — those always operate on the contracted
  yearly gross. Noted for future consideration.
- **Bonus / irregular income**: out of scope; the existing MonthlyIncome manual override
  remains available for one-off adjustments.

---

## 7. What is NOT changing

- `MonthlyIncome` table structure: unchanged — the salary engine writes to it, the rest of
  the app reads from it exactly as before.
- The Manage tab's income section is removed (its functionality is superseded by this tab).
- No other tabs are affected.
