# Cross-tax-year salary inheritance — unified core walk (Approach B)

**Date:** 2026-06-30 · **Status:** Approved design, ready for implementation

## Problem

When the latest saved salary config is in one tax year (e.g. June 2026, TY 2026/27) and you
view a month in a **later** tax year with nothing saved (e.g. anything from April 2027 on,
TY 2027/28), the figures are wrong. The salary *parameters* inherit forward fine, but the
cumulative-PAYE engine has no `employmentStart` anchor in the new tax year, so the year-to-date
never accumulates and each month is computed as a brand-new starter with a full year of unused
allowance. PAYE decays to £0 and net pay drifts up.

Reproduced (only June 2026 saved, £50,282 base + £918,396 DDaT bonus; correct answer is a steady
≈ −£843/mo):

| Month viewed | PAYE (now, buggy) | Correct |
|---|---|---|
| Apr 2027 | −£842.86 | ≈ −£843 ✓ (period 1, coincidentally close) |
| May 2027 | −£526.00 | ≈ −£843 |
| Jun 2027 | −£316.40 | ≈ −£843 |
| Sep 2027 | **£0.00** | ≈ −£843 |
| Mar 2028 | **£0.00** | ≈ −£843 |

Note `ytdAdjNet` is stuck at one month (£4,727.13) for every row — the tell-tale that the walk
never accumulates.

### Root cause

`employmentStart` is resolved as "first saved config **within** the viewed tax year"
(`getFirstConfigInTaxYear` in `apps/api/src/repo.ts`, mirrored client-side). A future tax year
with no saved config resolves to `null`, so both `previewYtd` (`apps/web/.../salaryState.ts`) and
`calcSalary` (`packages/core/src/salary.ts`) fall back to treating the **viewed month itself** as
the employment start. The YTD reconstruction (`computeSalaryYTD`, and its duplicate inline in
`repo.ts`) additionally filters candidate configs to the current tax year, so a salary inherited
from a prior year is never applied to the months it should cover.

## Goals / non-goals

**Goal (foundation only):** make the cumulative-PAYE engine produce correct figures for *any*
viewed month in *any* tax year, by modelling an inherited salary as **continuous employment**, and
do it through **one shared core month-walk** that the Summary path, the API, and (later) a forecast
feature all use.

**Non-goals (explicitly out of scope — later, separate work):**
- No projection *assumptions* — salary growth %, statutory band uprating, inflation. Statutory
  params stay **frozen** at the inherited config.
- No "total net income over N years" aggregation or any forecast UI/surface.
- No change to Lifetime or the student-loan tracker **behaviour** — they remain bounded to tax
  years that have saved configs (they must not start projecting the future). They are in scope only
  insofar as they share the unified walker without behaviour change.
- No new UI. Projected months keep the existing "Showing values inherited from {month}" label.

## Decisions locked (during brainstorming)

1. **Scope:** foundation only (above).
2. **Bounds:** forward-only, **unbounded**. Project the latest saved salary forward into any future
   month. Months **before the first-ever saved config are blank** (no backward projection) — this
   removes today's forward-inheritance of the earliest-later config for pre-first-config months.
3. **UX:** no special treatment; existing inherited-from label unchanged.
4. **Anchor rule:** continuous employment (below).

## The anchor rule

`taxYear(y, m) = m >= 4 ? y : y - 1`. Let `F` = the earliest saved config overall.

```
resolveEmploymentStart(configs, year, month):
  if F is null:                          return null      # nothing saved anywhere
  if (year, month) < (F.year, F.month):  return null      # before first-ever config -> blank
  ty  = taxYear(year, month)
  tyF = taxYear(F.year, F.month)
  if ty > tyF:  return { year: ty, month: 4 }   # continuous: anchor at this tax year's April
  else:         return { year: F.year, month: F.month }   # genuine mid-year start (first year)
```

- April of tax year `ty` falls in calendar year `ty` (since `taxYear(y, 4) = y`), so the anchor is
  simply `{ year: ty, month: 4 }`.
- Consequence we want: a mid-year **raise** saved in a future year still anchors that year to April
  (because `ty > tyF`), not to the raise month.
- The genuine first employed year keeps its real mid-year start (e.g. first config Nov 2025 → that
  year's YTD starts in November, unchanged).

**Per-month effective config** (for the YTD walk and for the displayed config): the latest saved
config at or before the month, considered across **all** configs (not filtered to the tax year), so
an inherited prior-year salary is applied to every month from the anchor. Statutory params frozen
at whatever that resolved config holds.

## Architecture (Approach B — unify)

One core source of truth for the month-walk; delete the `apps/api` duplicate.

1. **`packages/core`** — add the anchor + reconstruction as pure functions (extend
   `salaryWalk.ts` or a small new module; keep `salary.ts`'s tax maths untouched):
   - `resolveEmploymentStart(configs, year, month)` — the rule above.
   - The per-month effective-config resolver (latest config ≤ month, across all configs).
   - `computeSalaryYTD` refactors to use the resolver and the resolved anchor, and to consider all
     configs for the per-month lookup (not just the tax year). Its walk stays bounded to
     `[anchor, viewedMonth]`, which is within the tax year by construction.
2. **Resolve the `nodenext` workaround** (ARCHITECTURE.md "Known workarounds"): add `.js` extensions
   to `packages/core`'s internal relative imports so `apps/api` can `import '@budget/core'`. Verify
   `@budget/core` package exports/`main` and the `apps/api` tsconfig module resolution.
3. **`apps/api/src/repo.ts`** — `import` from `@budget/core`; **delete** the inline `getSalaryYTD`
   math and `getFirstConfigInTaxYear`; the route + `getSalaryConfig` response use the core
   functions. Change `getSalaryConfig` inheritance so months **before the first-ever config return
   blank** (drop the forward "earliest-after" fallback for that case).
4. **`apps/web`** — `previewYtd` (`salaryState.ts`) and `Salary.tsx` use the core
   `resolveEmploymentStart` (compute the anchor in core from `allConfigs`) instead of the server's
   `employmentStart`, and include the inherited prior-year "seed" config so every month resolves.
   `apps/web/src/data/queries.ts` (desktop) already calls core `computeSalaryYTD`; confirm it
   inherits the fix. `apps/web/src/data/http.ts` (web) calls the API, now core-backed.
5. **Desktop (`apps/desktop`)** — no Rust change expected (transactions/seed only; YTD is computed
   in `queries.ts` which is core-backed). Confirm parity.

**Web/desktop sync (operating rule):** no new `DataPort` method is added. `getSalaryYTD` stays in
the port but becomes core-backed on both adapters. The Summary breakdown is computed client-side via
`previewYtd` (shared React), so web and desktop are covered by the core change. Verify parity in
tests rather than assuming it.

## Testing strategy

**TDD throughout. The PAYE engine is payslip-validated ground truth — never change the maths
(`taxOnCumulative`, NI, SL) to satisfy a test. See `docs/SALARY.md`.**

1. **Regression guard — all existing suites stay green untouched**, especially the TY 2026/27
   April/May/June payslip suites in `packages/core/src/salary.test.ts`. The engine maths is not
   touched; only the walk/anchor feeding it changes.
2. **Parity** — pin that the new core `computeSalaryYTD` equals the *old* behaviour for every
   saved-config case (capture current outputs for the demo configs before refactoring, assert after).
3. **New cross-year suite** (the bug): with a single saved config (£50,282 base + £918,396 DDaT
   bonus, TY 2026/27 statutory params), every month Apr 2027–Mar 2028 shows steady PAYE within ~£1
   of the period-1 figure and **does not decay to £0**; `ytdAdjNet` accumulates month over month.
   Derive exact pins from the engine (it is the ground truth).
4. **Mid-year first year preserved** — first config Nov 2025: that year's YTD starts in November
   (existing nil-first-month behaviour), April 2026 is period 1 of the next year.
5. **Future mid-year raise still anchors April** — configs at June 2026 and a raise at Sept 2027;
   viewing Nov 2027 anchors April 2027 (not September), with Sept's config applying from September.
6. **Pre-first-config blank** — months before the first-ever config return blank (behaviour change).
7. **`apps/api` builds and runs against `@budget/core`** (proves the `nodenext` fix); the API's
   `getSalaryYTD` route returns the same values as core.

## Constraints

- **Payslip is ground truth**, not the tests. Do not touch the tax/NI/SL formulae.
- Run `npm run typecheck` · `npm test` · `npm run lint` before calling it done (root `CLAUDE.md`).
- **Money is integer pence everywhere** (`packages/core/src/money.ts`).
- Follow the `CLAUDE.md` doc rules for *where* notes live (scope decides): this is feature-level
  work, so on completion **graduate** the relevant `IDEAS.md` entries (the `nodenext` import-workaround
  item, and any cross-year item) and update the Map docs — remove the `nodenext` bullet from
  ARCHITECTURE.md "Known workarounds" once it's actually gone, and update `docs/SALARY.md`'s
  "Data model & inheritance" to describe the continuous-employment model and the pre-first-config
  blanking. Match the existing comment density (avoid extraneous comments).

## Acceptance criteria

- Viewing any month in a future tax year with an inherited salary shows correct, steady cumulative
  PAYE (no £0 decay); YTD accumulates across the year.
- Genuine mid-year first-year start unchanged; future mid-year raises anchor to April.
- Months before the first-ever config are blank.
- `apps/api` imports `@budget/core`; the duplicated YTD math in `repo.ts` is gone.
- All existing tests green; new tests cover the cases above. typecheck/test/lint clean.
- ARCHITECTURE.md, SALARY.md, IDEAS.md updated per the scope rules.

## Forecast-readiness (why this shape)

Per-month resolution becomes a pure core function over `configs`. A later "net income over N years"
feature is then a loop over that function plus an assumptions layer (growth, uprating) — no
re-plumbing of the engine, which is the reason for doing the unify now.

## Risks & mitigations

- **Touching payslip-validated paths.** Mitigation: the engine maths is untouched; the parity test +
  the full payslip suites are the guardrail. Refactor the *walk*, not the *formula*.
- **`nodenext` change is broad** (every core file's relative imports). Mitigation: mechanical; the
  build + full suite catch breakage. Do it as its own commit so it's bisectable.
- **Accidentally projecting Lifetime/student-loan into the future.** Mitigation: explicit tests that
  those surfaces still stop at saved-config tax years.
