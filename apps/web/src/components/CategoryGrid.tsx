import type { Category, Group } from '@budget/core';

export function CategoryGrid({
  groups,
  categories,
  selectedId,
  onSelect,
  filter = '',
}: {
  groups: Group[];
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  filter?: string;
}) {
  const q = filter.trim().toLowerCase();
  const matches = (c: Category) => q === '' || c.name.toLowerCase().includes(q);
  const visibleGroups = groups
    .map((group) => ({ group, cats: categories.filter((c) => c.group_id === group.id && matches(c)) }))
    .filter((g) => g.cats.length > 0);

  if (visibleGroups.length === 0) {
    return <p className="text-sm text-ink-muted">No category matches “{filter.trim()}”.</p>;
  }

  return (
    <div className="flex flex-col gap-y-4">
      {visibleGroups.map(({ group, cats }) => (
        <div key={group.id}>
          <div className="mb-2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
            <span className="text-xs uppercase tracking-wide text-ink-faint">{group.name}</span>
          </div>
          {/* M3 "connected" button group, single-select: buttons keep individual tonal fills
             and 2dp gaps. End buttons stay fully rounded on their outer edge; inner buttons
             rest as slightly-rounded squares and morph to a larger radius when selected. */}
          <div className="inline-flex flex-wrap gap-0.5">
            {cats.map((c, i) => {
                const selected = c.id === selectedId;
                const isFirst = i === 0;
                const isLast = i === cats.length - 1;
                const roundedClass = isFirst && isLast
                  ? selected ? 'rounded-full' : 'rounded-md'
                  : isFirst
                    ? selected ? 'rounded-full' : 'rounded-l-full'
                    : isLast
                      ? selected ? 'rounded-full' : 'rounded-r-full'
                      : selected
                        ? 'rounded-xl'
                        : 'rounded-md';
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-pressed={selected}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-all duration-100 ${roundedClass} ${
                      selected ? 'text-ink' : 'text-ink-muted hover:text-ink'
                    }`}
                    style={{
                      backgroundColor: selected
                        ? `color-mix(in srgb, ${c.color} 32%, var(--color-panel))`
                        : `color-mix(in srgb, ${group.color} 18%, var(--color-panel))`,
                      boxShadow: selected ? `inset 0 0 0 1px ${c.color}` : undefined,
                    }}
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
