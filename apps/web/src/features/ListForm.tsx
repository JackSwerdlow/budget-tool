import { useMemo, useRef, useState } from 'react';
import {
  evalSum,
  formatGBP,
  listCategorySubtotals,
  listTotals,
  splitCost,
  type BudgetList,
  type LedgerData,
} from '@budget/core';
import type { NewListInput, NewListItemInput } from '../api';
import { todayISO } from '../lib/dates';
import { CategorySelect } from '../components/CategorySelect';

let rowSeq = 1;
type Row = { key: number; name: string; qtyText: string; priceText: string; sharePct: number; categoryId: number };
type ItemMemory = { name: string; pricePence: number; categoryId: number };

function newRow(categoryId: number): Row {
  return { key: rowSeq++, name: '', qtyText: '1', priceText: '', sharePct: 0, categoryId };
}

function penceToText(pence: number): string {
  return (pence / 100).toFixed(2);
}

function parsePence(text: string): number | null {
  if (text.trim() === '') return null;
  try {
    return evalSum(text);
  } catch {
    return null;
  }
}

function validItems(rows: Row[]): NewListItemInput[] {
  return rows
    .map((r) => ({ r, price: parsePence(r.priceText) }))
    .filter((x): x is { r: Row; price: number } => x.price !== null && x.price > 0)
    .map(({ r, price }) => ({
      name: r.name.trim() || 'Item',
      price_pence: price,
      quantity: Math.max(1, Number.parseInt(r.qtyText, 10) || 1),
      share_pct: r.sharePct,
      category_id: r.categoryId,
    }));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Shared create/edit form for an itemised list. `initial` pre-fills it for editing; the
// parent owns persistence (create vs update + refresh) via onSubmit. One source of truth
// so Add → List and the Manage inline editor never drift.
export function ListForm({
  data,
  initial,
  submitLabel,
  submittingLabel = 'Saving…',
  onSubmit,
  onCancel,
}: {
  data: LedgerData;
  initial?: BudgetList;
  submitLabel: string;
  submittingLabel?: string;
  onSubmit: (input: NewListInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const groceriesId = useMemo(
    () => data.categories.find((c) => c.name === 'Groceries')?.id ?? data.categories[0]?.id ?? 0,
    [data.categories],
  );

  const [note, setNote] = useState(initial?.note ?? '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [rows, setRows] = useState<Row[]>(() =>
    initial && initial.items.length > 0
      ? initial.items.map((it) => ({
          key: rowSeq++,
          name: it.name,
          qtyText: String(it.quantity),
          priceText: penceToText(it.price_pence),
          sharePct: it.share_pct,
          categoryId: it.category_id,
        }))
      : [newRow(groceriesId), newRow(groceriesId)],
  );
  // Past item names → their most recent price + category, most-recently-used first, for the
  // name-field autocomplete below. Dedupe is case-insensitive; first hit wins since lists are
  // sorted newest-date-first, tie-broken by created_at so same-day lists still order by save time.
  const itemHistory = useMemo(() => {
    const sorted = [...data.lists].sort(
      (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at),
    );
    const seen = new Set<string>();
    const out: ItemMemory[] = [];
    for (const list of sorted) {
      for (const item of list.items) {
        const key = item.name.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ name: item.name, pricePence: item.price_pence, categoryId: item.category_id });
      }
    }
    return out;
  }, [data.lists]);
  const [suggestOpenKey, setSuggestOpenKey] = useState<number | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  function matchesFor(text: string): ItemMemory[] {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return itemHistory.filter((h) => h.name.toLowerCase().includes(q)).slice(0, 8);
  }

  function applyMemory(rowKey: number, m: ItemMemory) {
    updateRow(rowKey, { name: m.name, priceText: penceToText(m.pricePence), categoryId: m.categoryId });
    setSuggestOpenKey(null);
  }

  const [deliveryOpen, setDeliveryOpen] = useState((initial?.delivery_fee_pence ?? 0) > 0);
  const [deliveryFeeText, setDeliveryFeeText] = useState(
    initial && initial.delivery_fee_pence > 0 ? penceToText(initial.delivery_fee_pence) : '',
  );
  const [deliverySharePct, setDeliverySharePct] = useState(initial?.delivery_share_pct ?? 0);
  const [deliveryCategoryId, setDeliveryCategoryId] = useState(initial?.delivery_category_id ?? groceriesId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryById = (id: number) => data.categories.find((c) => c.id === id);

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, newRow(groceriesId)]);
  }
  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  const deliveryFeeInvalid = deliveryOpen && deliveryFeeText.trim() !== '' && parsePence(deliveryFeeText) === null;
  const deliveryFeePence = deliveryOpen ? parsePence(deliveryFeeText) ?? 0 : 0;

  const draft: BudgetList = useMemo(() => {
    const items = validItems(rows).map((it, i) => ({ id: i, list_id: 0, sort_order: i, ...it }));
    return {
      id: 0,
      date,
      note: note || null,
      delivery_fee_pence: deliveryFeePence,
      delivery_share_pct: deliveryOpen ? deliverySharePct : 0,
      delivery_category_id: deliveryCategoryId,
      created_at: '',
      items,
    };
  }, [rows, date, note, deliveryFeePence, deliveryOpen, deliverySharePct, deliveryCategoryId]);

  const totals = listTotals(draft);
  const subtotals = [...listCategorySubtotals(draft).entries()].sort((a, b) => b[1] - a[1]);
  const canSave = draft.items.length > 0 && DATE_RE.test(date) && !deliveryFeeInvalid && !submitting;

  async function onSave() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        date,
        note: note.trim() || null,
        delivery_fee_pence: deliveryFeePence,
        delivery_share_pct: deliveryOpen ? deliverySharePct : 0,
        delivery_category_id: deliveryCategoryId,
        items: validItems(rows),
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (data.categories.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">Create a category in ⚙ Manage first.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="list-date" className="mb-1 block text-xs uppercase tracking-wide text-ink-faint">Date</label>
          <input
            id="list-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink/40"
          />
        </div>
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="list-note" className="mb-1 block text-xs uppercase tracking-wide text-ink-faint">
            Note <span className="normal-case text-ink-faint">(optional)</span>
          </label>
          <input
            id="list-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Sainsbury's weekly shop"
            className="w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink/40"
          />
        </div>
      </div>

      {/* Header (wide screens) */}
      <div className="hidden gap-2 px-1 text-[10px] uppercase tracking-wide text-ink-faint lg:grid lg:grid-cols-[1fr_4rem_8rem_7rem_11rem_5.5rem_1.5rem]">
        <span>Item</span>
        <span>Qty</span>
        <span>Price</span>
        <span>Share</span>
        <span>Category</span>
        <span className="text-right">Your cost</span>
        <span />
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const price = parsePence(row.priceText);
          const qty = Math.max(1, Number.parseInt(row.qtyText, 10) || 1);
          const mine = price !== null && price > 0 ? splitCost(price, row.sharePct).mine : null;
          const unit = price !== null && price > 0 && qty > 1 ? Math.round(price / qty) : null;
          const matches = suggestOpenKey === row.key ? matchesFor(row.name) : [];
          const highlighted = Math.min(highlightIndex, matches.length - 1);
          return (
            <div
              key={row.key}
              ref={(el) => {
                rowRefs.current[row.key] = el;
              }}
              className="grid grid-cols-2 items-center gap-2 rounded-md border border-hairline bg-panel p-2 lg:grid-cols-[1fr_4rem_8rem_7rem_11rem_5.5rem_1.5rem] lg:border-0 lg:bg-transparent lg:p-1"
            >
              <div className="relative col-span-2 lg:col-span-1">
                <input
                  value={row.name}
                  onChange={(e) => {
                    updateRow(row.key, { name: e.target.value });
                    setSuggestOpenKey(row.key);
                    setHighlightIndex(0);
                  }}
                  onFocus={() => {
                    setSuggestOpenKey(row.key);
                    setHighlightIndex(0);
                  }}
                  onBlur={() => setSuggestOpenKey((k) => (k === row.key ? null : k))}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      if (matches.length === 0) return;
                      e.preventDefault();
                      setHighlightIndex((i) => Math.min(i + 1, matches.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      if (matches.length === 0) return;
                      e.preventDefault();
                      setHighlightIndex((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      // Enter/Tab both select the highlighted match (top match by default),
                      // same "confirm the filter" convention as the Single category filter.
                      // Tab then continues its normal job of advancing focus to Qty.
                      if (matches.length === 0) return;
                      e.preventDefault();
                      applyMemory(row.key, matches[highlighted]);
                      if (e.key === 'Tab') {
                        rowRefs.current[row.key]?.querySelector<HTMLInputElement>('input[aria-label="Quantity"]')?.focus();
                      }
                    } else if (e.key === 'Escape') {
                      setSuggestOpenKey(null);
                    }
                  }}
                  placeholder="Item name"
                  autoComplete="off"
                  className="w-full rounded-md border border-hairline bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-ink/40"
                />
                {matches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-hairline bg-panel shadow-lg">
                    {matches.map((m, i) => (
                      <button
                        key={m.name}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setHighlightIndex(i)}
                        onClick={() => applyMemory(row.key, m)}
                        className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm text-ink ${
                          i === highlighted ? 'bg-paper' : 'hover:bg-paper'
                        }`}
                      >
                        <span className="truncate">{m.name}</span>
                        <span className="ml-2 shrink-0 tabular-nums text-ink-faint">{formatGBP(m.pricePence)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                value={row.qtyText}
                onChange={(e) => updateRow(row.key, { qtyText: e.target.value })}
                inputMode="numeric"
                aria-label="Quantity"
                className="rounded-md border border-hairline bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-ink/40"
              />
              <div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint">£</span>
                  <input
                    value={row.priceText}
                    onChange={(e) => updateRow(row.key, { priceText: e.target.value })}
                    inputMode="decimal"
                    aria-label="Price"
                    placeholder="0.00"
                    className="w-full rounded-md border border-hairline bg-paper py-1.5 pl-5 pr-2 text-sm text-ink outline-none focus:border-ink/40"
                  />
                </div>
                {unit !== null && <div className="mt-0.5 pl-1 text-[10px] text-ink-faint">≈ {formatGBP(unit)} ea</div>}
              </div>
              <div className="flex items-center gap-1">
                <div className="relative flex-1">
                  <input
                    value={String(row.sharePct)}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(100, Number.parseInt(e.target.value, 10) || 0));
                      updateRow(row.key, { sharePct: n });
                    }}
                    inputMode="numeric"
                    aria-label="Flatmate share percent"
                    className="w-full rounded-md border border-hairline bg-paper py-1.5 pl-2 pr-5 text-sm text-ink outline-none focus:border-ink/40"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint">%</span>
                </div>
                <button type="button" onClick={() => updateRow(row.key, { sharePct: 50 })} className="rounded border border-hairline px-1 py-1 text-[10px] text-ink-muted hover:text-ink" title="50%">½</button>
              </div>
              <CategorySelect groups={data.groups} categories={data.categories} value={row.categoryId} onChange={(id) => updateRow(row.key, { categoryId: id })} />
              <div className="text-right text-sm tabular-nums text-ink">{mine === null ? <span className="text-ink-faint">—</span> : formatGBP(mine)}</div>
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                aria-label="Remove item"
                className="justify-self-end text-ink-faint transition-colors hover:text-over"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div>
        <button type="button" onClick={addRow} className="rounded-md border border-hairline bg-panel px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink">
          + Add item
        </button>
      </div>

      {/* Delivery / bag fee (hidden by default) */}
      <div className="rounded-md border border-hairline bg-panel p-3">
        <button type="button" onClick={() => setDeliveryOpen((o) => !o)} className="flex w-full items-center gap-2 text-sm text-ink-muted hover:text-ink">
          <span className="text-ink-faint">{deliveryOpen ? '▾' : '▸'}</span>
          Delivery / bag fee
          {!deliveryOpen && <span className="text-xs text-ink-faint">(hidden — for online orders)</span>}
        </button>
        {deliveryOpen && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-ink-faint">Fee</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint">£</span>
                <input
                  value={deliveryFeeText}
                  onChange={(e) => setDeliveryFeeText(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`w-28 rounded-md border bg-paper py-1.5 pl-5 pr-2 text-sm text-ink outline-none focus:border-ink/40 ${
                    deliveryFeeInvalid ? 'border-over' : 'border-hairline'
                  }`}
                />
              </div>
              {deliveryFeeInvalid && <p className="mt-0.5 text-[10px] text-over">invalid</p>}
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-ink-faint">Share</label>
              <div className="relative w-20">
                <input value={String(deliverySharePct)} onChange={(e) => setDeliverySharePct(Math.max(0, Math.min(100, Number.parseInt(e.target.value, 10) || 0)))} inputMode="numeric" className="w-full rounded-md border border-hairline bg-paper py-1.5 pl-2 pr-5 text-sm text-ink outline-none focus:border-ink/40" />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint">%</span>
              </div>
            </div>
            <div className="min-w-[11rem]">
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-ink-faint">Category</label>
              <CategorySelect groups={data.groups} categories={data.categories} value={deliveryCategoryId} onChange={setDeliveryCategoryId} />
            </div>
          </div>
        )}
      </div>

      {/* Three totals */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-hairline bg-panel p-3">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Full list</div>
          <div className="font-serif text-2xl text-ink">{formatGBP(totals.full)}</div>
        </div>
        <div className="rounded-md border border-accent/30 bg-panel p-3">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Your share · counts</div>
          <div className="font-serif text-2xl text-accent">{formatGBP(totals.mine)}</div>
        </div>
        <div className="rounded-md border border-hairline bg-panel p-3">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Flatmate · reference</div>
          <div className="font-serif text-2xl text-ink-muted">{formatGBP(totals.flatmate)}</div>
        </div>
      </div>

      {/* Fan-out preview */}
      {subtotals.length > 0 && (
        <div className="rounded-md border border-hairline bg-raised/40 p-3">
          <div className="mb-2 text-xs text-ink-muted">Files into your ledger as:</div>
          <div className="flex flex-wrap gap-2">
            {subtotals.map(([catId, pence]) => {
              const cat = categoryById(catId);
              return (
                <span key={catId} className="flex items-center gap-1.5 rounded-md border border-hairline bg-panel px-2 py-1 text-sm">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: cat?.color }} />
                  <span className="text-ink">{cat?.name}</span>
                  <span className="tabular-nums text-ink-muted">{formatGBP(pence)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-over">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-hairline px-4 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
