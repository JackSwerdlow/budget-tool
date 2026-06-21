# Project Instructions

## Project Overview

A personal monthly **budget tool** that replaces a manual Excel workflow. The user records
spending (read off bank statements) into categories, splits some grocery costs with a
flatmate, and wants live monthly breakdowns, month-vs-month comparisons, and trend views.

**The idea — and every design decision with its reasoning — lives in the concept spec:**

> `docs/SPEC.md`

Read that spec before making any design or implementation decision. It defines *what* we're
building and *why* — the category taxonomy, entry model, itemised grocery lists, views,
scope, and the features deliberately deferred. It intentionally contains **no** tech-stack
or visual-style decisions.

**The HOW — tech stack, data model, app structure, visual/UX system, and the phased build plan
— lives in:**

> `docs/PLAN.md` (repo root)

`docs/PLAN.md` records the design that the app was built from. It also records §1.5
deviations from the idea spec (all user-approved) and the §9 deferred features that must
**not** be built yet.

**Current stage:** active iterative refinement. The initial build phases (0–6) are complete,
and features, polish, and UX improvements are being added incrementally. The spec and plan
are now design references — consult them for the rationale behind existing decisions and for
the §9 deferred-feature boundary before adding anything new. **At the start of a new
session, run `git log --oneline -20` to understand recent work before making changes.**

## Salary Tab — COMPLETE

The UK salary breakdown tab is fully built and shipped. Design and implementation references:

- **Design spec:** `docs/SALARY_SPEC.md` — data model, UK tax formulae, config inheritance logic, UI structure, API contract.
- **Implementation notes:** `docs/SALARY_PLAN.md` — 8-task build log with code and decisions.

**Salary redesign (shipped 2026-06-21):** the tab now has **Summary / Lifetime / Config**
sub-tabs; a **Lifetime** view aggregating cumulative totals per UK tax year (PAYE resets each
April, so it sums per-tax-year slices rather than one cumulative span); **pension-accuracy**
(employer-pension YTD feeds the forecast); and a **student-loan tracker** (running balance
seeded by a "Set balance" anchor config row, interest accrual, payroll 9% + optional extra
repayments, and a payoff projection). Design + build logs:
`docs/superpowers/specs/2026-06-20-*` and `docs/superpowers/plans/2026-06-20-*`.

**Key constraints to preserve if touching this area:**

- **Do NOT `import` (even `import type`) from `@budget/core` in `apps/api/`** — Node 24's
  ESM resolver (`moduleResolution: nodenext`) walks into core's extensionless relative
  imports and fails with TS2835. Use local type aliases in `apps/api/src/repo.ts` instead.
- **`PoundInput` / `PctInput` must stay at module scope** (outside `Salary()`) — inline
  sub-components get new identities on every render, causing inputs to lose focus.
- **`onGrossChange` derives the other 4 fields only** — never overwrite the field being typed.

**Deferred (do NOT build yet):** unpaid days off effective rate. The data model
(`salary_config` table) already supports it. (The student-loan balance/payoff tracker,
formerly deferred here, shipped 2026-06-21 — see the redesign note above.)

## Desktop App — COMPLETE

The app ships as an installable, fully-offline **Tauri v2 desktop app** (merged to `main`).
Design + build log: `docs/DESKTOP_SPEC.md` and `docs/DESKTOP_PLAN.md`.

**Architecture.** The desktop app **reuses `apps/web` and `packages/core` verbatim** — it is
not a fork. The only desktop-specific code is `apps/desktop/` (the Tauri/Rust shell) and the
rusqlite half of the data-adapter seam. All DB access goes through one `DataPort` interface
(`apps/web/src/data/port.ts`), with the adapter chosen at runtime by `window.isTauri`:

- **browser / `npm run dev`** → `data/http.ts` → `apps/api` (Hono + node:sqlite).
- **inside Tauri** → `data/queries.ts` → `data/executor.ts` → `invoke('sql_select'|'sql_execute')`
  → `apps/desktop/src-tauri/src/db.rs` (one `rusqlite` connection). Multi-statement writes go
  through dedicated Rust commands (`create_list`, `delete_category`, reorders, `import_database`).

**KEEP WEB & DESKTOP IN SYNC — the one rule.** Because the desktop app builds `apps/web`,
**UI / styling / component / `packages/core` / `apps/api` changes apply to both automatically —
no extra work.** The *only* thing that must be done twice is a **new data operation** (a new
`DataPort` method): implement it in **both** `data/http.ts` (fetch → new `apps/api` route +
`repo.ts`) **and** `data/queries.ts` (SQL via the executor) — plus a Rust command in `db.rs` if
it needs a transaction. Cover it in **both** `apps/web/src/data/queries.test.ts` (parity, via
node:sqlite) and the `db.rs` Rust tests. If you only touch the API/HTTP side, the desktop app
silently breaks — the parity tests exist to catch exactly that.

**Running & shipping.**

- `npm run dev` (web + API) is unchanged and needs **no** Rust.
- `npm run tauri:dev` runs the desktop app live (needs the Rust toolchain; on Linux also
  `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev patchelf libssl-dev`).
- **Release:** push a `desktop-v*` tag → `.github/workflows/release.yml` builds Windows `.exe` /
  macOS `.dmg` / Linux `.AppImage`+`.deb` on real runners → a draft GitHub Release.

**Constraints to preserve.** `window.isTauri` is the adapter switch — don't break it. The
payslip-validated YTD math lives once in `packages/core` (`computeSalaryYTD`) and is shared by
both paths (the TS2835 ban still keeps `apps/api/repo.ts` on its own inline copy — keep them in
step). Transactional writes must stay Rust commands (the rusqlite connection is single, so they
are real transactions).

**Known follow-ups (NOT done yet):** installers ship the **default Tauri icons** (replace before
sharing more widely) and are **unsigned** (Gatekeeper/SmartScreen warn on first run — add Apple
notarization + Windows signing to the release workflow when ready).

## Future platform targets

The **mobile app** (Expo + `expo-sqlite`) remains deferred. Keep `packages/core` free of
browser-only or Node-only APIs so that path stays open; do not let HTTP/fetch assumptions
leak into shared packages.

## Git Repository

The project is on GitHub (repo: budget-tool). Push directly to main; branches are only
needed when a workflow specifically requires them.

## Context7 MCP

Whenever a coding task involves a library, framework, API, or CLI tool, use Context7 MCP
to fetch current, version-specific documentation — do not rely on training data alone.
This applies at both stages:

- **Planning:** verify the approach is modern and free of anti-patterns before committing
- **Implementation:** verify correct syntax, method signatures, and configuration before writing code

To use: call `resolve-library-id` first, then `query-docs` with a specific question. Do not
use Context7 for general programming concepts or business logic — only for
library/framework/API specifics.

## Code Comments

Avoid extraneous code comments unless asked specifically for them.
