import { useEffect, useRef, useState } from 'react';
import type { Category, Group } from '@budget/core';

// Compact category picker: a chip that opens a colour-coded popover grid.
export function CategorySelect({
  groups,
  categories,
  value,
  onChange,
}: {
  groups: Group[];
  categories: Category[];
  value: number;
  onChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = categories.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md border border-hairline bg-paper px-2 py-1.5 text-sm text-ink hover:border-ink/30"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: selected?.color }} />
        <span className="min-w-0 truncate">{selected?.name ?? 'Category'}</span>
        <span className="ml-auto text-ink-faint">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-64 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-md border border-hairline bg-panel p-2 shadow-lg sm:left-auto sm:right-0">
          {groups.map((group) => (
            <div key={group.id} className="mb-2 last:mb-0">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                <span className="text-[10px] uppercase tracking-wide text-ink-faint">{group.name}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {categories
                  .filter((c) => c.group_id === group.id)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                      className={`flex items-center gap-1 rounded border px-1.5 py-1 text-xs text-ink ${
                        c.id === value ? 'border-ink/40 bg-paper' : 'border-hairline bg-paper hover:border-ink/30'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
