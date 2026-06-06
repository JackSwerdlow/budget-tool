import type { Category, Group } from '@budget/core';

export function CategoryGrid({
  groups,
  categories,
  selectedId,
  onSelect,
}: {
  groups: Group[];
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.id}>
          <div className="mb-2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
            <span className="text-xs uppercase tracking-wide text-ink-faint">{group.name}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categories
              .filter((c) => c.group_id === group.id)
              .map((c) => {
                const selected = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-pressed={selected}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-ink transition ${
                      selected
                        ? 'bg-paper shadow-sm'
                        : 'border-hairline bg-panel hover:border-ink/30'
                    }`}
                    style={
                      selected
                        ? { borderColor: c.color, boxShadow: `inset 0 0 0 1px ${c.color}` }
                        : undefined
                    }
                  >
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
