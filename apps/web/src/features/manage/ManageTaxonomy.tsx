import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRef } from 'react';
import type { Category, Group, LedgerData, View } from '@budget/core';
import {
  createCategory,
  createGroup,
  createView,
  deleteCategory,
  deleteGroup,
  deleteView,
  reorderCategories,
  reorderGroups,
  updateCategory,
  updateGroup,
  updateView,
} from '../../api';
import { CategoryVisibilityChecklist } from '../../components/CategoryVisibilityChecklist';
import { useData } from '../../data';

// ── Drag handle icon ──────────────────────────────────────────────────────────

function DragHandle({ listeners, attributes }: { listeners?: object; attributes?: object }) {
  return (
    <button
      type="button"
      className="cursor-grab touch-none text-ink-faint/50 hover:text-ink-faint active:cursor-grabbing"
      aria-label="Drag to reorder"
      {...listeners}
      {...attributes}
    >
      ⠿
    </button>
  );
}

// ── Inline editable text ──────────────────────────────────────────────────────

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

// ── Sortable category row ─────────────────────────────────────────────────────

function SortableCategoryRow({
  cat,
  groups,
  onUpdate,
  onDelete,
  overlay = false,
}: {
  cat: Category;
  groups: Group[];
  onUpdate: (id: number, patch: { name?: string; group_id?: number; color?: string }) => void;
  onDelete: (cat: Category) => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `c-${cat.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 text-sm ${isDragging && !overlay ? 'opacity-40' : ''}`}
    >
      <DragHandle listeners={listeners} attributes={attributes} />
      <input
        key={`${cat.id}-${cat.color}`}
        type="color"
        defaultValue={cat.color}
        onBlur={(e) => e.target.value !== cat.color && onUpdate(cat.id, { color: e.target.value })}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border border-hairline bg-transparent"
        aria-label="Category colour"
      />
      <EditableText value={cat.name} onCommit={(v) => onUpdate(cat.id, { name: v })} className="flex-1" />
      {cat.exclude_from_discretionary === 1 && (
        <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">ex-disc.</span>
      )}
      <select
        value={cat.group_id}
        onChange={(e) => onUpdate(cat.id, { group_id: Number(e.target.value) })}
        className="rounded-md border border-hairline bg-paper px-1.5 py-1 text-xs text-ink-muted outline-none"
        aria-label="Move to group"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <button type="button" onClick={() => onDelete(cat)} aria-label="Delete category" className="text-ink-faint hover:text-over">✕</button>
    </li>
  );
}

// ── Sortable group card ───────────────────────────────────────────────────────

function SortableGroupCard({
  group,
  cats,
  allGroups,
  groupDragging,
  onUpdateGroup,
  onDeleteGroup,
  onUpdateCategory,
  onDeleteCategory,
  onAddCategory,
  overlay = false,
}: {
  group: Group;
  cats: Category[];
  allGroups: Group[];
  groupDragging: boolean;
  onUpdateGroup: (id: number, patch: { name?: string; color?: string }) => void;
  onDeleteGroup: (id: number) => void;
  onUpdateCategory: (id: number, patch: { name?: string; group_id?: number; color?: string }) => void;
  onDeleteCategory: (cat: Category) => void;
  onAddCategory: (name: string, groupId: number) => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `g-${group.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const catIds = cats.map((c) => `c-${c.id}`);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-hairline bg-panel p-4 ${isDragging && !overlay ? 'opacity-40' : ''}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <DragHandle listeners={listeners} attributes={attributes} />
        <input
          key={`${group.id}-${group.color}`}
          type="color"
          defaultValue={group.color}
          onBlur={(e) => e.target.value !== group.color && onUpdateGroup(group.id, { color: e.target.value })}
          className="h-5 w-5 shrink-0 cursor-pointer rounded border border-hairline bg-transparent"
          aria-label="Group colour"
        />
        <EditableText
          value={group.name}
          onCommit={(v) => onUpdateGroup(group.id, { name: v })}
          className="font-serif text-base font-medium"
        />
        <button
          type="button"
          onClick={() => onDeleteGroup(group.id)}
          className="ml-auto text-xs text-ink-faint hover:text-over"
        >
          delete group
        </button>
      </div>

      {groupDragging ? (
        <ul className="flex flex-col gap-1">
          {cats.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm opacity-60">
              <span className="w-4" />
              <span className="inline-block h-4 w-4 shrink-0 rounded" style={{ backgroundColor: c.color }} />
              <span className="text-ink">{c.name}</span>
            </li>
          ))}
        </ul>
      ) : (
      <SortableContext items={catIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-1">
          {cats.map((c) => (
            <SortableCategoryRow
              key={c.id}
              cat={c}
              groups={allGroups}
              onUpdate={onUpdateCategory}
              onDelete={onDeleteCategory}
            />
          ))}
        </ul>
      </SortableContext>
      )}

      <AddCategory onAdd={(name) => onAddCategory(name, group.id)} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ManageTaxonomy({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const [reassign, setReassign] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local copies for optimistic DnD updates.
  const [localGroups, setLocalGroups] = useState<Group[]>(() => [...data.groups]);
  const [localCats, setLocalCats] = useState<Category[]>(() => [...data.categories]);

  useEffect(() => {
    setLocalGroups([...data.groups]);
    setLocalCats([...data.categories]);
  }, [data]);

  // Refs so drag handlers always read the latest state, never a stale closure.
  const localGroupsRef = useRef(localGroups);
  const localCatsRef = useRef(localCats);
  useEffect(() => { localGroupsRef.current = localGroups; }, [localGroups]);
  useEffect(() => { localCatsRef.current = localCats; }, [localCats]);

  // Track what is currently being dragged (for DragOverlay).
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [activeCatId, setActiveCatId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Only collide with same-type items: groups↔groups, categories↔categories.
  // This stops category items interfering with group card sorting.
  const collisionDetection: CollisionDetection = (args) => {
    const id = String(args.active.id);
    const prefix = id.startsWith('g-') ? 'g-' : 'c-';
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        String(c.id).startsWith(prefix)
      ),
    });
  };

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
    try {
      const result = await deleteCategory(c.id);
      if (result.inUse) { setReassign(c); return; }
      await refresh();
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  // ── DnD handlers ─────────────────────────────────────────────────────────

  const handleDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    if (id.startsWith('g-')) setActiveGroupId(parseInt(id.slice(2)));
    else if (id.startsWith('c-')) setActiveCatId(parseInt(id.slice(2)));
  };

  // Optimistically move a category into a new group as the user drags over it.
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeId = String(active.id);
    if (!activeId.startsWith('c-')) return;

    const draggedCatId = parseInt(activeId.slice(2));
    const overId = String(over.id);
    const cats = localCatsRef.current;

    let overGroupId: number;
    if (overId.startsWith('g-')) {
      overGroupId = parseInt(overId.slice(2));
    } else if (overId.startsWith('c-')) {
      const overCat = cats.find((c) => c.id === parseInt(overId.slice(2)));
      if (!overCat) return;
      overGroupId = overCat.group_id;
    } else {
      return;
    }

    const draggedCat = cats.find((c) => c.id === draggedCatId);
    if (!draggedCat || draggedCat.group_id === overGroupId) return;

    // Update ref synchronously so handleDragEnd (which fires before the
    // re-render) reads the new group_id, not the pre-DragOver value.
    const updated = cats.map((c) => (c.id === draggedCatId ? { ...c, group_id: overGroupId } : c));
    localCatsRef.current = updated;
    setLocalCats(updated);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveGroupId(null);
    setActiveCatId(null);

    const activeId = String(active.id);

    // ── Group reorder ────────────────────────────────────────────────────────
    if (activeId.startsWith('g-')) {
      if (!over || active.id === over.id) return;
      const overId = String(over.id);
      if (!overId.startsWith('g-')) return;
      const groups = localGroupsRef.current;
      const fromIdx = groups.findIndex((g) => g.id === parseInt(activeId.slice(2)));
      const toIdx = groups.findIndex((g) => g.id === parseInt(overId.slice(2)));
      if (fromIdx === -1 || toIdx === -1) return;
      const newGroups = arrayMove(groups, fromIdx, toIdx);
      localGroupsRef.current = newGroups;
      setLocalGroups(newGroups);
      run(reorderGroups(newGroups.map((g) => g.id)));
      return;
    }

    // ── Category reorder / move ──────────────────────────────────────────────
    if (!activeId.startsWith('c-')) return;

    const catId = parseInt(activeId.slice(2));
    const cats = localCatsRef.current;
    const draggedCat = cats.find((c) => c.id === catId);
    if (!draggedCat) return;

    // The authoritative target group comes from handleDragOver's optimistic
    // update in the ref — NOT from `over`, which may point to a category in
    // an adjacent group due to closestCenter geometry.
    const targetGroupId = draggedCat.group_id;
    let newCats = [...cats];

    // Only apply within-group ordering when `over` is a category in the SAME
    // target group.  If `over` is from a different group (common when the
    // target group has few items), skip ordering — the cat lands at the end.
    if (over && over.id !== active.id && String(over.id).startsWith('c-')) {
      const overCatId = parseInt(String(over.id).slice(2));
      const overCat = newCats.find((c) => c.id === overCatId);
      if (overCat && overCat.group_id === targetGroupId) {
        const groupCats = newCats.filter((c) => c.group_id === targetGroupId);
        const fromIdx = groupCats.findIndex((c) => c.id === catId);
        const toIdx = groupCats.findIndex((c) => c.id === overCatId);
        if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
          const reordered = arrayMove(groupCats, fromIdx, toIdx);
          newCats = [...newCats.filter((c) => c.group_id !== targetGroupId), ...reordered];
        }
      }
    }

    localCatsRef.current = newCats;
    setLocalCats(newCats);

    // Always persist — even if `over` is null (pointer released in empty
    // space), the cross-group move from handleDragOver must be saved.
    const groups = localGroupsRef.current;
    const ordered = groups.flatMap((g) =>
      newCats.filter((c) => c.group_id === g.id).map((c) => ({ id: c.id, group_id: c.group_id }))
    );
    run(reorderCategories(ordered));
  };

  // ── Active drag overlays ──────────────────────────────────────────────────

  const activeGroup = activeGroupId !== null ? localGroups.find((g) => g.id === activeGroupId) : null;
  const activeCat = activeCatId !== null ? localCats.find((c) => c.id === activeCatId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-5">
        {error && <p className="text-sm text-over">{error}</p>}

        <SortableContext items={localGroups.map((g) => `g-${g.id}`)} strategy={verticalListSortingStrategy}>
          {localGroups.map((group) => (
            <SortableGroupCard
              key={group.id}
              group={group}
              cats={localCats.filter((c) => c.group_id === group.id)}
              allGroups={localGroups}
              groupDragging={activeGroupId !== null}
              onUpdateGroup={(id, patch) => run(updateGroup(id, patch))}
              onDeleteGroup={(id) =>
                run(
                  deleteGroup(id).then((r) => {
                    if (r.nonEmpty) throw new Error('Group must be empty first (move or delete its categories).');
                  })
                )
              }
              onUpdateCategory={(id, patch) => run(updateCategory(id, patch))}
              onDeleteCategory={onDeleteCategory}
              onAddCategory={(name, groupId) => run(createCategory({ name, group_id: groupId, color: group.color }))}
            />
          ))}
        </SortableContext>

        <AddGroup onAdd={(name) => run(createGroup({ name, color: '#9a8b6e' }))} />

        <ViewsSection data={data} />

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

      {/* Ghost preview while dragging */}
      <DragOverlay>
        {activeGroup && (
          <div className="rounded-lg border border-hairline bg-panel p-4 shadow-lg opacity-95">
            <div className="flex items-center gap-2">
              <span className="text-ink-faint/50">⠿</span>
              <span
                className="inline-block h-5 w-5 rounded border border-hairline"
                style={{ backgroundColor: activeGroup.color }}
              />
              <span className="font-serif text-base font-medium text-ink">{activeGroup.name}</span>
            </div>
          </div>
        )}
        {activeCat && (
          <div className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-2 py-1.5 text-sm shadow-lg opacity-95">
            <span className="text-ink-faint/50">⠿</span>
            <span
              className="inline-block h-4 w-4 rounded border border-hairline"
              style={{ backgroundColor: activeCat.color }}
            />
            <span className="text-ink">{activeCat.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function AddCategory({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName(''); } }}
      className="mt-3 flex items-center gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="+ add category"
        className="rounded-md border border-hairline bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-ink/40"
      />
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
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName(''); } }}
      className="flex items-center gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="+ add group"
        className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink/40"
      />
      {name.trim() && (
        <button type="submit" className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-muted hover:text-ink">add group</button>
      )}
    </form>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────

const MAX_VIEWS = 4;

function ViewsSection({ data }: { data: LedgerData }) {
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

function ReassignDialog({ category, data, onCancel, onConfirm }: { category: Category; data: LedgerData; onCancel: () => void; onConfirm: (targetId: number) => void }) {
  const options = data.categories.filter((c) => c.id !== category.id);
  const [target, setTarget] = useState(options[0]?.id ?? 0);
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 p-4">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-panel p-5 shadow-xl">
        <h4 className="font-serif text-base text-ink">Reassign before deleting</h4>
        <p className="mt-1 text-sm text-ink-muted">
          <span className="text-ink">{category.name}</span> is still used by entries or lists.{' '}
          {options.length === 0 ? 'Add another category to move them to first.' : 'Move them to:'}
        </p>
        {options.length > 0 && (
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className="mt-3 w-full rounded-md border border-hairline bg-paper px-2 py-2 text-sm text-ink outline-none">
            {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="text-sm text-ink-muted hover:text-ink">Cancel</button>
          <button
            type="button"
            disabled={options.length === 0}
            onClick={() => onConfirm(target)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reassign &amp; delete
          </button>
        </div>
      </div>
    </div>
  );
}
