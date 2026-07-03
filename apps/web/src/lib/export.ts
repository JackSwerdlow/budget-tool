import { itemMyCost, splitCost, type LedgerData } from '@budget/core';

// Portable data exports, built entirely client-side from the already-loaded LedgerData so
// the exact same code serves the browser and the desktop app. These builders are pure
// (tested in export.test.ts); the download/save plumbing lives in ExportData.tsx.

// Plain decimal pounds (no £, no thousands separators) so spreadsheets parse the column
// as numeric. Integer pence ÷ 100 at 2dp is exact.
const gbp = (pence: number) => (pence / 100).toFixed(2);

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = ['date', 'kind', 'group', 'category', 'description', 'quantity', 'share_pct', 'full_gbp', 'my_share_gbp'];

// One row per ledger contribution: entries, list items, and list delivery fees — using the
// same per-item share maths as the ledger (itemMyCost/splitCost), so summing my_share_gbp
// reproduces the app's totals exactly (Invariant 1).
export function buildCsvExport(data: LedgerData): string {
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const groupById = new Map(data.groups.map((g) => [g.id, g]));
  const names = (categoryId: number) => {
    const cat = catById.get(categoryId);
    return { category: cat?.name ?? '', group: cat ? groupById.get(cat.group_id)?.name ?? '' : '' };
  };

  type Row = { date: string; created: string; cells: (string | number)[] };
  const rows: Row[] = [];
  for (const e of data.entries) {
    const { category, group } = names(e.category_id);
    rows.push({
      date: e.date,
      created: e.created_at,
      cells: [e.date, 'entry', group, category, e.note ?? '', '', '', gbp(e.amount_pence), gbp(e.amount_pence)],
    });
  }
  for (const l of data.lists) {
    for (const item of l.items) {
      const { category, group } = names(item.category_id);
      rows.push({
        date: l.date,
        created: l.created_at,
        cells: [l.date, 'list item', group, category, item.name, item.quantity, item.share_pct, gbp(item.price_pence), gbp(itemMyCost(item))],
      });
    }
    if (l.delivery_fee_pence !== 0) {
      const { category, group } = names(l.delivery_category_id);
      rows.push({
        date: l.date,
        created: l.created_at,
        cells: [l.date, 'list fee', group, category, 'Delivery / bag fee', '', l.delivery_share_pct, gbp(l.delivery_fee_pence), gbp(splitCost(l.delivery_fee_pence, l.delivery_share_pct).mine)],
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created));

  return [CSV_HEADER.join(','), ...rows.map((r) => r.cells.map(csvField).join(','))].join('\n') + '\n';
}

// A faithful full dump (ids intact) — groups, categories, entries, lists + items, income,
// views — wrapped with a format marker so a future import knows what it's reading.
export function buildJsonExport(data: LedgerData, exportedAt: string): string {
  return JSON.stringify(
    {
      app: 'budget-tool',
      format: 1,
      exported_at: exportedAt,
      groups: data.groups,
      categories: data.categories,
      entries: data.entries,
      lists: data.lists,
      income: data.income,
      views: data.views,
      default_income_pence: data.defaultIncomePence,
    },
    null,
    2,
  );
}
