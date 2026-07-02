import type { LedgerData } from '@budget/core';

// Controlled: the caller owns `hiddenCategoryIds` and re-renders on `onChange`. Used both for
// Overview's live ad hoc filter and for editing a saved View's draft snapshot in Manage.
export function CategoryVisibilityChecklist({
  data,
  hiddenCategoryIds,
  onChange,
}: {
  data: LedgerData;
  hiddenCategoryIds: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const toggleCategory = (id: number) => {
    const next = new Set(hiddenCategoryIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  // A group checkbox is a bulk action over its *current* category ids — there is no separate
  // persisted "this group is hidden" state (see Global Constraints).
  const toggleGroup = (groupId: number) => {
    const catIds = data.categories.filter((c) => c.group_id === groupId).map((c) => c.id);
    const allShown = catIds.every((id) => !hiddenCategoryIds.has(id));
    const next = new Set(hiddenCategoryIds);
    catIds.forEach((id) => (allShown ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  return (
    <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border border-hairline bg-panel p-3">
      {data.groups.map((g) => {
        const cats = data.categories.filter((c) => c.group_id === g.id);
        const shownCount = cats.filter((c) => !hiddenCategoryIds.has(c.id)).length;
        const groupChecked = shownCount === cats.length;
        const groupIndeterminate = shownCount > 0 && shownCount < cats.length;
        return (
          <div key={g.id}>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={groupChecked}
                ref={(el) => {
                  if (el) el.indeterminate = groupIndeterminate;
                }}
                onChange={() => toggleGroup(g.id)}
              />
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} />
              <span className="font-medium">{g.name}</span>
            </label>
            <div className="ml-6 flex flex-col gap-1 pt-1">
              {cats.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-ink-muted">
                  <input type="checkbox" checked={!hiddenCategoryIds.has(c.id)} onChange={() => toggleCategory(c.id)} />
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: c.color }} />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {hiddenCategoryIds.size > 0 && (
        <button
          type="button"
          className="mt-1 self-start text-xs text-ink-muted transition-colors hover:text-accent"
          onClick={() => onChange(new Set())}
        >
          Show all
        </button>
      )}
    </div>
  );
}
