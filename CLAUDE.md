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

`docs/PLAN.md` records the design that the app was built from: read the idea spec first, then
`docs/PLAN.md` for the tech stack, data model, app structure, and visual/UX system. It also
records §1.5 deviations from the idea spec (all user-approved) and the §9 deferred features
that must **not** be built yet.

**Current stage:** **implemented.** Phases 0–6 from `docs/PLAN.md` are complete (see git history).
The spec and plan now serve as design reference — consult them for the rationale behind existing
decisions and for the §9 deferred-feature boundary before adding anything new.

## Git Repository

The project is setup on a git repository hosted on GitHub. The repo is called budget-tool, it is fine to push directly to main and unless needed by the workflow it is encouraged to not create branches and just directly push commits to main.

## Context7 MCP

Whenever a coding task involves a library, framework, API, or CLI tool, use Context7 MCP to fetch current, version-specific documentation — do not rely on training data alone. This applies at both stages:

- **Planning:** verify the approach is modern and free of anti-patterns before committing to it
- **Implementation:** verify correct syntax, method signatures, and configuration before writing code

To use: call `resolve-library-id` first, then `query-docs` with a specific question. Do not use Context7 for general programming concepts or business logic — only for library/framework/API specifics.

## Code Comments

Avoid extraneous code comments unless asked specifically for them.