import { itemMyCost } from './list.ts';
import type { LedgerData } from './types.ts';
import type { TotalOptions } from './ledger.ts';

// Cross-time item analytics over the persisted list-item rows: every purchase of "milk"
// across every saved list, grouped case-insensitively by item name. Analysis only — the
// ledger itself never changes (list my-shares are still recomputed per Invariant 4).

export type ItemPurchase = {
  date: string; // the list's date
  listId: number;
  quantity: number;
  pricePence: number; // full item price as entered
  mySharePence: number; // my-share of it (same split maths as the ledger)
  unitPricePence: number; // full price ÷ quantity, rounded to the penny (display figure)
  categoryId: number;
};

export type ItemSummary = {
  name: string; // most recent casing wins
  purchases: ItemPurchase[]; // date ascending (ties by list creation time)
  timesBought: number;
  totalQuantity: number;
  totalPence: number; // full prices summed
  totalMyPence: number; // my-shares summed
  firstUnitPricePence: number;
  lastUnitPricePence: number;
};

const EMPTY_SET: ReadonlySet<number> = new Set();

// All items ever bought, grouped by lowercased name, sorted by total full spend (desc).
// Excluded categories' purchases are skipped entirely (the shared category filter).
export function itemSummaries(data: LedgerData, options: TotalOptions = {}): ItemSummary[] {
  const excluded = options.excludedCategoryIds ?? EMPTY_SET;

  type Working = { name: string; lastSeen: string; purchases: ItemPurchase[] };
  const byName = new Map<string, Working>();

  const lists = [...data.lists].sort(
    (a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at),
  );
  for (const list of lists) {
    for (const item of list.items) {
      if (excluded.has(item.category_id)) continue;
      const trimmed = item.name.trim();
      if (trimmed === '') continue;
      const key = trimmed.toLowerCase();
      const quantity = Math.max(1, item.quantity);
      const purchase: ItemPurchase = {
        date: list.date,
        listId: list.id,
        quantity: item.quantity,
        pricePence: item.price_pence,
        mySharePence: itemMyCost(item),
        unitPricePence: Math.round(item.price_pence / quantity),
        categoryId: item.category_id,
      };
      const existing = byName.get(key);
      if (existing) {
        existing.purchases.push(purchase);
        existing.name = trimmed; // lists are date-ordered, so this ends at the latest casing
      } else {
        byName.set(key, { name: trimmed, lastSeen: list.date, purchases: [purchase] });
      }
    }
  }

  return [...byName.values()]
    .map(({ name, purchases }) => ({
      name,
      purchases,
      timesBought: purchases.length,
      totalQuantity: purchases.reduce((s, p) => s + p.quantity, 0),
      totalPence: purchases.reduce((s, p) => s + p.pricePence, 0),
      totalMyPence: purchases.reduce((s, p) => s + p.mySharePence, 0),
      firstUnitPricePence: purchases[0].unitPricePence,
      lastUnitPricePence: purchases[purchases.length - 1].unitPricePence,
    }))
    .sort((a, b) => b.totalPence - a.totalPence || a.name.localeCompare(b.name));
}
