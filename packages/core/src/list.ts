import { splitCost } from './shares';
import type { BudgetList, ListItem } from './types';

// My cost for one item is the half-up split's remainder (mine). NEVER round a total.
export function itemMyCost(item: ListItem): number {
  return splitCost(item.price_pence, item.share_pct).mine;
}

function deliveryMyCost(list: BudgetList): number {
  return splitCost(list.delivery_fee_pence, list.delivery_share_pct).mine;
}

export type ListTotals = { full: number; mine: number; flatmate: number };

export function listTotals(list: BudgetList): ListTotals {
  let full = list.delivery_fee_pence;
  let mine = deliveryMyCost(list);
  for (const item of list.items) {
    full += item.price_pence;
    mine += itemMyCost(item);
  }
  return { full, mine, flatmate: full - mine };
}

// Per-item-then-sum: the list's "Your share" is the sum of PER-ITEM my-costs, and it
// equals the sum of these per-category subtotals exactly (no round-the-total drift).
export function listCategorySubtotals(list: BudgetList): Map<number, number> {
  const subtotals = new Map<number, number>();
  for (const item of list.items) {
    subtotals.set(item.category_id, (subtotals.get(item.category_id) ?? 0) + itemMyCost(item));
  }
  const delivery = deliveryMyCost(list);
  if (delivery !== 0) {
    subtotals.set(
      list.delivery_category_id,
      (subtotals.get(list.delivery_category_id) ?? 0) + delivery,
    );
  }
  return subtotals;
}
