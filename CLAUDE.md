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

**Key constraints to preserve if touching this area:**

- **Do NOT `import` (even `import type`) from `@budget/core` in `apps/api/`** — Node 24's
  ESM resolver (`moduleResolution: nodenext`) walks into core's extensionless relative
  imports and fails with TS2835. Use local type aliases in `apps/api/src/repo.ts` instead.
- **`PoundInput` / `PctInput` must stay at module scope** (outside `Salary()`) — inline
  sub-components get new identities on every render, causing inputs to lose focus.
- **`onGrossChange` derives the other 4 fields only** — never overwrite the field being typed.

**Deferred (do NOT build yet):** student loan balance/payoff tracker, unpaid days off
effective rate. The data model (`salary_config` table) already supports both.

## Future platform targets

The eventual goal is to package this as an installable **desktop app** and a **mobile app**
— both running fully offline, no ports or HTTP server (deferred — see PLAN §9). Keep
`packages/core` free of browser-only or Node-only APIs so this path stays open. Do not let
HTTP/fetch assumptions leak into shared packages.

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
