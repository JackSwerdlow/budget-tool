# Project Instructions

## Start here

A personal, single-user **budget tool** (replaces an Excel workflow): manual spend entry into a
customisable taxonomy, itemised grocery lists with flatmate splitting, live monthly views, and a
UK salary breakdown. Ships as a web/dev build, an offline Tauri desktop app, and an Android app
(same Tauri shell) from one codebase.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first** — it's the map (what the app is,
where everything lives, and the **Invariants**). Then open the surface doc you need. At the start
of a session, also skim `git log --oneline -20` for recent work.

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the map: character, surfaces, how it's built, **invariants**, known workarounds. **Read first.**
- [`docs/BUDGET.md`](docs/BUDGET.md) · [`docs/SALARY.md`](docs/SALARY.md) · [`docs/DESKTOP.md`](docs/DESKTOP.md) · [`docs/MOBILE.md`](docs/MOBILE.md) — surface maps (open the one you're touching).
- [`docs/IDEAS.md`](docs/IDEAS.md) — possible future work (candidates, **not** commitments or a roadmap).
- `docs/archive/` — historical build logs + superseded specs; may be stale.

These docs are **living descriptions of what the app is today, not constraints on what it may
become** — update them when you change the app. The only hard rules are the fenced **Invariants**
in `ARCHITECTURE.md`.

## How to work here

**Feature work goes through IDEAS.** A feature-level task is either (a) an existing entry in
[`docs/IDEAS.md`](docs/IDEAS.md), or (b) a new entry you add there first, then build. Bug fixes
and small tweaks don't need an entry.

1. Before starting, scan `IDEAS.md` for overlapping or adjacent ideas and **propose** bundling —
   never silently widen scope. If the user declines (or there's no overlap), focus on the one task.
2. When an idea ships it **graduates**: describe the new behaviour in the Map (plus a code comment
   / inline note where scope dictates), then **remove** the `IDEAS.md` entry.
3. Suggestions are welcome, but only **user-endorsed** ideas get logged in `IDEAS.md` — an
   unprompted suggestion the user doesn't take is not recorded anywhere.

**Reconsidering a past decision is normal.** There is no "rejected ideas" log; if the user wants
something previously set aside, help with it — surface any prior reasoning, don't gatekeep.

**Scope decides where a note lives:**
- Affects all code / all new code → an **Invariant** in `ARCHITECTURE.md`.
- Must be done on every relevant change → an **operating rule** here.
- Affects one line/section → a **code comment**.
- True only because of fixable debt → a **Known workaround** in `ARCHITECTURE.md` + an `IDEAS.md` entry.

## Operating rule — keep web, desktop & Android in sync

The app runs three ways (browser via `apps/api`; desktop **and Android** via rusqlite), so UI /
styling / component / `packages/core` / `apps/api` changes apply to all three automatically. The
**one** thing that must be done on both data paths is a **new data operation** (a new `DataPort`
method): implement it in **both** `apps/web/src/data/http.ts` (→ `apps/api` route + `repo.ts`)
**and** `data/queries.ts` (+ a Rust command in `db.rs` if it needs a transaction), and cover it
in **both** `queries.test.ts` and the `db.rs` tests. That is still exactly **two**
implementations — Android rides the desktop SQL path; there is no third transport. Touch only
the HTTP side and both Tauri apps silently break. Full detail: [`docs/DESKTOP.md`](docs/DESKTOP.md)
· [`docs/MOBILE.md`](docs/MOBILE.md); step-by-step checklist: the `add-data-operation` skill
(`.claude/skills/add-data-operation/SKILL.md`).

Because the UI is shared by all three targets, keep base (unprefixed) Tailwind styles
**mobile-first** — desktop spacing/layout goes behind `sm:`/`lg:` — and spot-check layout
changes at a ~360px viewport as well as desktop width.

## Before calling work done

Run typechecks, tests, and lint where applicable: `npm run typecheck` · `npm test` · `npm run lint`.
The salary PAYE engine is payslip-validated — never change it to satisfy a test; see `SALARY.md`.

To *see* a UI change in the running app (rather than only in tests), use the `run-budget-tool`
skill (`.claude/skills/run-budget-tool/SKILL.md`) — it boots the servers on a throwaway copy of the
demo DB, drives the app in headless Chrome, and screenshots at desktop and 360px widths.

## Context7 MCP

Whenever a coding task involves a library, framework, API, or CLI tool, use Context7 MCP to fetch
current, version-specific documentation — don't rely on training data alone. Call
`resolve-library-id` first, then `query-docs` with a specific question. Not for general
programming concepts or business logic — only library/framework/API specifics.

## Code comments

Avoid extraneous code comments unless asked, or unless a comment is the right home for a
scope-local note (see "Scope decides where a note lives").

## Git

On GitHub (repo: `budget-tool`). Push directly to `main`; branches only when a workflow requires.
