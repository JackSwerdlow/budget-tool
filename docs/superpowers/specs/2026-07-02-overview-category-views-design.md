# Overview category/group show-hide + saved Views — design

> Graduates the IDEAS.md entry "Per-category show/hide toggle on the trends matrix" — scope grew
> during brainstorming from the trends matrix alone to all of Overview's summary surfaces, plus a
> new saved-preset ("View") concept, per user direction during design.

## Problem

Today, "incl./excl. Rent" is a fixed, Rent-specific boolean, duplicated as four independent local
toggles (Overview's by-group donut, the running chart, the comparison bars, and the trends
matrix) plus one App-level toggle that only seeds their initial values. Filtering is hardcoded to
`category.exclude_from_discretionary === 1` — there's no way to hide/show any other
category or group, and no way to save more than one such filter.

## Goal

One shared, general-purpose "which categories currently count" filter across all of Overview's
summary surfaces (This-month total, running chart, by-group donut, comparison bars, trends
matrix). The filter is ad hoc (a checklist you can tweak live) and can optionally be saved as a
named **View** — a reusable preset — managed from Manage.

**Net Balance is explicitly excluded from this filter** — it keeps its existing "always real
money, includes everything" invariant, unaffected by hidden categories.

## State model

A single `hiddenCategoryIds: Set<number>` — **category ids only, no separate group-level
tracking.** Session-only (in-memory), resets on reload, same as the trends matrix's existing
`expanded` row state.

"Hiding a group" is a **bulk action**, not separate persisted state: the checklist's group
checkbox is derived (checked if none of its current categories are hidden, unchecked if all are,
indeterminate if some are) and clicking it adds/removes all of that group's *current* category ids
to/from the one set. Tradeoff accepted: a category added to an already-hidden group later won't
automatically inherit the hide — acceptable given how rarely categories are added.

Default on every load: **empty set ("All")** — no automatic Rent-exclusion default anymore. A
one-click view button gets you back to any saved preset (e.g. "excl. Rent") each session.

## New entity: View

A View is a **named, saved snapshot of `hiddenCategoryIds`** — not a per-category tag/assignment.
Example from design discussion: View "Essentials only" might store `hidden_category_ids` for
everything except Rent+Bills; a different view might store just Rent+Bills hidden.

- New table `views`: `id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL, hidden_category_ids TEXT NOT NULL DEFAULT '[]'` (JSON-encoded array of category ids — a lightweight UI preset, not a relational entity needing FK integrity, so no junction table).
- Core type: `View = { id: number; name: string; sort_order: number; hidden_category_ids: number[] }`. `LedgerData` gains `views: View[]`.
- Cap: **max 4 views** (5 buttons total including "All"), enforced client-side in the Manage "add view" form (hidden/disabled once 4 exist).
- No `reorderViews` — order is creation order (`sort_order` set once at create time), given the small cap.
- Deleting a view is a plain row delete — no per-category cleanup needed (unlike deleting a Group, which requires reassigning member categories first), since a View doesn't own any categories.

### CRUD implementation shape

Traced against the existing `Group` CRUD as the template (`packages/core/src/types.ts:4-9`,
`apps/web/src/data/port.ts:46-48`, `apps/web/src/data/http.ts:81-90`, `apps/api/src/app.ts:239-280`,
`apps/api/src/repo.ts:148-174`, `apps/web/src/data/queries.ts:148-174`,
`apps/api/src/db/schema.sql`). Because `createView`/`updateView`/`deleteView` are each a single
SQL statement (no multi-statement transaction, no FK-child guard like `deleteGroup` has), they
**do not need a dedicated Rust command** — they ride the desktop path's existing generic
`sql_select`/`sql_execute` Tauri commands (`apps/desktop/src-tauri/src/db.rs:150-181`), exactly
like Group create/update/delete already do. Only the schema needs a new `CREATE TABLE views`
added to the single-sourced `apps/api/src/db/schema.sql` (Rust picks it up automatically via
`include_str!`, `db.rs:14-15`).

Still touches, per the web/desktop sync rule: `port.ts` (interface), `http.ts` (web impl),
`apps/api/src/app.ts` (routes) + `repo.ts` (SQL), `queries.ts` (desktop impl), `schema.sql`
(table), and test coverage on both `apps/api` and the desktop query path.

## UI

### Shared checklist component (new)

Groups (derived/indeterminate checkbox, bulk-toggles its members) with nested category checkboxes
underneath, styled consistent with existing dropdowns in this file (`border-hairline`, `bg-panel`,
`text-ink` — see `TrendsMatrix.tsx`'s existing range-picker dropdown for the visual pattern). Used
in two places with two different callers/purposes:

1. **Overview's ad hoc dropdown** ("Categories ▾" button in the Overview header) — edits the live
   `hiddenCategoryIds` session state directly, with a "Show all" link to clear it.
2. **Manage's View editor** — edits a View's stored `hidden_category_ids` (create or "edit
   categories" on an existing view).

### Overview header

Replaces the current App-level "incl./excl. Rent" `Segmented` (`App.tsx:126-134`) with:

- A button row: **"All"** + one button per existing View, in creation order. Hidden entirely if
  zero views exist (behaves as permanent "All").
- Clicking **"All"** clears `hiddenCategoryIds`.
- Clicking a **View button** copies that view's stored `hidden_category_ids` into the live session
  state — a one-shot *apply*, not a live binding (editing the view later doesn't retroactively
  change what's currently on screen; you'd need to click it again).
- No "currently active preset" highlighting on the buttons (v1) — they're apply-actions, not a
  persistent `Segmented` selection.
- The "Categories ▾" ad hoc checklist (above) remains, for further one-off tweaks on top of "All"
  or a just-applied view — both operate on the same live `hiddenCategoryIds`.

This single control is shared between the Month and Trends sub-views of Overview (both consume the
same lifted `hiddenCategoryIds` state from `App.tsx`).

### Manage screen

New "Views" section in `ManageTaxonomy.tsx` (alongside the existing Groups/Categories editor):
list of views (inline-editable name via the existing `EditableText` pattern, an "edit categories"
action reopening the shared checklist, a delete button), and an "+ add view" form (name input +
checklist) — hidden once the 4-view cap is hit, mirroring how `AddGroup`/`AddCategory` already
work in this file.

## Removed / unaffected

- **Removed**: `App.tsx`'s `globalRent` state + Segmented; the local `rent`/`donutRent` states and
  `Segmented` controls in `OverviewMonth`, `RunningChart`, `ComparisonBars`, `TrendsMatrix`; the
  `defaultRent` prop threading through all of the above.
- **Unaffected**: Net Balance (`monthNet`/`averageNet`) — no filtering, ever. The
  `exclude_from_discretionary` column and its "ex-disc." badge in `ManageTaxonomy.tsx:110-112` are
  left in place as inert metadata (no migration) but are no longer consulted for any default or
  filtering logic anywhere.
- No schema/DataPort change needed for the *ad hoc* checklist itself (pure client-side derivation
  over already-loaded `LedgerData`) — only the new `View` CRUD touches the data layer.

## Core layer (`packages/core/src/ledger.ts`)

`TotalOptions = { excludeRent?: boolean }` → `TotalOptions = { excludedCategoryIds?: ReadonlySet<number> }`,
used directly by `monthTotal` and `runningCumulative` (no group-resolution step needed now that
the state is category-id-only — the live `hiddenCategoryIds` Set *is* the `excludedCategoryIds`
value, passed straight through). The existing private `excludedCategoryIds(data, excludeRent)`
helper (`ledger.ts:77`, boolean → id-set) is deleted; no default-seed helper is needed either,
since the new default is always the empty set.

`categoryTotals` stays unfiltered/raw, as today. `TrendsMatrix` keeps filtering its own rows
(group/category visibility, heat-map amounts) by checking category-id membership in
`hiddenCategoryIds` directly; a group whose every category is hidden already drops out naturally
via the matrix's existing "no non-zero amounts" filter — no separate group-hidden check needed
there either.

## Testing

- `packages/core`: update `ledger.test.ts:53-54` (and check `netBalance.test.ts`) for the new
  `excludedCategoryIds` option shape.
- `apps/api`: new tests for `POST/PATCH/DELETE /views` in `app.test.ts`, following the existing
  group-route test shapes.
- Desktop path: new tests in `queries.test.ts` for `createView`/`updateView`/`deleteView`, per the
  sync rule — no `db.rs` Rust-side test needed since no new Rust command is introduced (verify
  this matches how Group CRUD itself is covered before assuming it's sufficient).
- Component-level: no existing component test suite to extend; verify manually via `/run` per
  this repo's UI-change workflow, and rely on `npm run typecheck` / `npm run lint`.

## Open items for the implementation plan (not blocking design approval)

- Exact button/checklist visual treatment (spacing, icons for indeterminate state) — left to
  implementation, following existing patterns in `TrendsMatrix.tsx` and `ManageTaxonomy.tsx`.
- Whether `apps/api/src/app.test.ts`'s existing group-route tests reveal any additional
  validation (e.g. name uniqueness) worth mirroring for views.
