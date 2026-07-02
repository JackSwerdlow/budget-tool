import { useState } from 'react';
import type { LedgerData, View } from '@budget/core';
import { createView, deleteView, updateView } from '../../api';
import { CategoryVisibilityChecklist } from '../../components/CategoryVisibilityChecklist';
import { EditableText } from '../../components/ui';
import { useData } from '../../data';

const MAX_VIEWS = 4;

export function ManageViews({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftHidden, setDraftHidden] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHidden, setNewHidden] = useState<Set<number>>(new Set());

  const run = async (p: Promise<unknown>) => {
    try {
      await p;
      await refresh();
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const startEdit = (v: View) => {
    setEditingId(v.id);
    setDraftHidden(new Set(v.hidden_category_ids));
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    await run(updateView(editingId, { hidden_category_ids: [...draftHidden] }));
    setEditingId(null);
  };

  const atCap = data.views.length >= MAX_VIEWS;

  return (
    <div className="rounded-lg border border-hairline bg-panel p-4">
      <h3 className="mb-3 font-serif text-base font-medium text-ink">Views</h3>
      {error && <p className="mb-2 text-sm text-over">{error}</p>}
      <ul className="flex flex-col gap-2">
        {data.views.map((v) => (
          <li key={v.id} className="flex items-center gap-2 text-sm">
            <EditableText value={v.name} onCommit={(n) => run(updateView(v.id, { name: n }))} className="flex-1" />
            <button type="button" onClick={() => startEdit(v)} className="text-xs text-ink-faint hover:text-accent">
              edit categories
            </button>
            <button type="button" onClick={() => run(deleteView(v.id))} aria-label="Delete view" className="text-ink-faint hover:text-over">✕</button>
          </li>
        ))}
      </ul>

      {editingId !== null && (
        <div className="mt-3">
          <CategoryVisibilityChecklist data={data} hiddenCategoryIds={draftHidden} onChange={setDraftHidden} />
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setEditingId(null)} className="text-sm text-ink-muted hover:text-ink">Cancel</button>
            <button type="button" onClick={saveEdit} className="rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:opacity-90">Save</button>
          </div>
        </div>
      )}

      {!atCap && (
        showAdd ? (
          <div className="mt-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="View name"
              className="w-full rounded-md border border-hairline bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-ink/40"
            />
            <div className="mt-2">
              <CategoryVisibilityChecklist data={data} hiddenCategoryIds={newHidden} onChange={setNewHidden} />
            </div>
            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewName(''); setNewHidden(new Set()); }}
                className="text-sm text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={newName.trim() === ''}
                onClick={async () => {
                  await run(createView({ name: newName.trim(), hidden_category_ids: [...newHidden] }));
                  setShowAdd(false);
                  setNewName('');
                  setNewHidden(new Set());
                }}
                className="rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add view
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowAdd(true)} className="mt-3 text-sm text-ink-muted hover:text-ink">+ add view</button>
        )
      )}
    </div>
  );
}
