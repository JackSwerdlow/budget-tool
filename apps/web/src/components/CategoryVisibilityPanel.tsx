import type { LedgerData } from '@budget/core';

// Controlled, like CategoryVisibilityChecklist (the caller owns `hiddenCategoryIds`), but
// styled as Overview's unfolding filter section: a master select/deselect-all tick, per-group
// ticks, and categories as CategoryGrid-style connected buttons (pressed = shown).
export function CategoryVisibilityPanel({
  data,
  hiddenCategoryIds,
  onChange,
}: {
  data: LedgerData;
  hiddenCategoryIds: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const allIds = data.categories.map((c) => c.id);
  const shownTotal = allIds.filter((id) => !hiddenCategoryIds.has(id)).length;
  const allShown = shownTotal === allIds.length;

  const toggleCategory = (id: number) => {
    const next = new Set(hiddenCategoryIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  // Group/master ticks are bulk actions over the *current* category ids — there is no separate
  // persisted "this group is hidden" state.
  const toggleGroup = (groupId: number) => {
    const catIds = data.categories.filter((c) => c.group_id === groupId).map((c) => c.id);
    const groupAllShown = catIds.every((id) => !hiddenCategoryIds.has(id));
    const next = new Set(hiddenCategoryIds);
    catIds.forEach((id) => (groupAllShown ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  const toggleAll = () => onChange(allShown ? new Set(allIds) : new Set());

  return (
    <div className="rounded-lg border border-hairline bg-panel p-4">
      <div className="mb-4 flex items-center justify-between border-b border-hairline pb-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={allShown}
            ref={(el) => {
              if (el) el.indeterminate = shownTotal > 0 && !allShown;
            }}
            onChange={toggleAll}
          />
          <span className="font-medium">All categories</span>
        </label>
        <span className="text-xs tabular-nums text-ink-faint">
          {shownTotal} of {allIds.length} shown
        </span>
      </div>
      <div className="flex flex-col gap-y-4">
        {data.groups.map((group) => {
          const cats = data.categories.filter((c) => c.group_id === group.id);
          if (cats.length === 0) return null;
          const shownCount = cats.filter((c) => !hiddenCategoryIds.has(c.id)).length;
          return (
            <div key={group.id}>
              <label className="mb-2 flex w-fit cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={shownCount === cats.length}
                  ref={(el) => {
                    if (el) el.indeterminate = shownCount > 0 && shownCount < cats.length;
                  }}
                  onChange={() => toggleGroup(group.id)}
                />
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                <span className="text-xs uppercase tracking-wide text-ink-faint">{group.name}</span>
              </label>
              {/* Same M3 connected-row look as CategoryGrid, but multi-select: pressed = shown. */}
              <div className="inline-flex flex-wrap gap-0.5">
                {cats.map((c, i) => {
                  const shown = !hiddenCategoryIds.has(c.id);
                  const isFirst = i === 0;
                  const isLast = i === cats.length - 1;
                  const roundedClass = isFirst && isLast
                    ? shown ? 'rounded-full' : 'rounded-md'
                    : isFirst
                      ? shown ? 'rounded-full' : 'rounded-l-full'
                      : isLast
                        ? shown ? 'rounded-full' : 'rounded-r-full'
                        : shown
                          ? 'rounded-xl'
                          : 'rounded-md';
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategory(c.id)}
                      aria-pressed={shown}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-all duration-100 ${roundedClass} ${
                        shown ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
                      }`}
                      style={{
                        backgroundColor: shown
                          ? `color-mix(in srgb, ${c.color} 32%, var(--color-panel))`
                          : `color-mix(in srgb, ${group.color} 8%, var(--color-panel))`,
                        boxShadow: shown ? `inset 0 0 0 1px ${c.color}` : undefined,
                      }}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-sm ${shown ? '' : 'opacity-30'}`}
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
