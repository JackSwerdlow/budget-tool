import { useState } from 'react';
import type { Category, LedgerData } from '@budget/core';
import {
  createCategory,
  createGroup,
  deleteCategory,
  deleteGroup,
  updateCategory,
  updateGroup,
} from '../../api';
import { useData } from '../../data';

function EditableText({ value, onCommit, className = '' }: { value: string; onCommit: (v: string) => void; className?: string }) {
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v && v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={`rounded-md border border-transparent bg-transparent px-1.5 py-1 text-ink outline-none hover:border-hairline focus:border-ink/40 focus:bg-paper ${className}`}
    />
  );
}

export function ManageTaxonomy({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const [reassign, setReassign] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (p: Promise<unknown>) => {
    try {
      await p;
      await refresh();
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const onDeleteCategory = async (c: Category) => {
    const result = await deleteCategory(c.id);
    if (result.inUse) {
      setReassign(c);
      return;
    }
    await refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-over">{error}</p>}

      {data.groups.map((group) => {
        const cats = data.categories.filter((c) => c.group_id === group.id);
        return (
          <div key={group.id} className="rounded-lg border border-hairline bg-panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <input
                key={`${group.id}-${group.color}`}
                type="color"
                defaultValue={group.color}
                onBlur={(e) => e.target.value !== group.color && run(updateGroup(group.id, { color: e.target.value }))}
                className="h-5 w-5 shrink-0 cursor-pointer rounded border border-hairline bg-transparent"
                aria-label="Group colour"
              />
              <EditableText value={group.name} onCommit={(v) => run(updateGroup(group.id, { name: v }))} className="font-serif text-base font-medium" />
              <button
                type="button"
                onClick={() => run(deleteGroup(group.id).then((r) => { if (r.nonEmpty) throw new Error('Group must be empty first (move or delete its categories).'); }))}
                className="ml-auto text-xs text-ink-faint hover:text-over"
              >
                delete group
              </button>
            </div>

            <ul className="flex flex-col gap-1">
              {cats.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    key={`${c.id}-${c.color}`}
                    type="color"
                    defaultValue={c.color}
                    onBlur={(e) => e.target.value !== c.color && run(updateCategory(c.id, { color: e.target.value }))}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded border border-hairline bg-transparent"
                    aria-label="Category colour"
                  />
                  <EditableText value={c.name} onCommit={(v) => run(updateCategory(c.id, { name: v }))} className="flex-1" />
                  {c.exclude_from_discretionary === 1 && (
                    <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">ex-disc.</span>
                  )}
                  <select
                    value={c.group_id}
                    onChange={(e) => run(updateCategory(c.id, { group_id: Number(e.target.value) }))}
                    className="rounded-md border border-hairline bg-paper px-1.5 py-1 text-xs text-ink-muted outline-none"
                    aria-label="Move to group"
                  >
                    {data.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => onDeleteCategory(c)} aria-label="Delete category" className="text-ink-faint hover:text-over">✕</button>
                </li>
              ))}
            </ul>

            <AddCategory onAdd={(name) => run(createCategory({ name, group_id: group.id, color: group.color }))} />
          </div>
        );
      })}

      <AddGroup onAdd={(name) => run(createGroup({ name, color: '#9a8b6e' }))} />

      {reassign && (
        <ReassignDialog
          category={reassign}
          data={data}
          onCancel={() => setReassign(null)}
          onConfirm={async (targetId) => {
            await run(deleteCategory(reassign.id, targetId));
            setReassign(null);
          }}
        />
      )}
    </div>
  );
}

function AddCategory({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) {
          onAdd(name.trim());
          setName('');
        }
      }}
      className="mt-3 flex items-center gap-2"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="+ add category" className="rounded-md border border-hairline bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-ink/40" />
      {name.trim() && (
        <button type="submit" className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-muted hover:text-ink">add</button>
      )}
    </form>
  );
}

function AddGroup({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) {
          onAdd(name.trim());
          setName('');
        }
      }}
      className="flex items-center gap-2"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="+ add group" className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink/40" />
      {name.trim() && (
        <button type="submit" className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-muted hover:text-ink">add group</button>
      )}
    </form>
  );
}

function ReassignDialog({ category, data, onCancel, onConfirm }: { category: Category; data: LedgerData; onCancel: () => void; onConfirm: (targetId: number) => void }) {
  const options = data.categories.filter((c) => c.id !== category.id);
  const [target, setTarget] = useState(options[0]?.id ?? 0);
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 p-4">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-panel p-5 shadow-xl">
        <h4 className="font-serif text-base text-ink">Reassign before deleting</h4>
        <p className="mt-1 text-sm text-ink-muted">
          <span className="text-ink">{category.name}</span> is still used by entries or lists. Move them to:
        </p>
        <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className="mt-3 w-full rounded-md border border-hairline bg-paper px-2 py-2 text-sm text-ink outline-none">
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="text-sm text-ink-muted hover:text-ink">Cancel</button>
          <button type="button" onClick={() => onConfirm(target)} className="rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:opacity-90">Reassign &amp; delete</button>
        </div>
      </div>
    </div>
  );
}
