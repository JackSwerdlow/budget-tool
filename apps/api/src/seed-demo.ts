// Builds the committed demo database (data/budget-demo.db) from a realistic single-
// person London-flatshare profile. Run with: npm run seed:demo
import { existsSync, rmSync } from 'node:fs';
import { openDatabase } from './db.ts';
import { migrate } from './migrate.ts';
import { seedIfEmpty } from './seed.ts';
import { createEntry, createList, setIncome, type NewList } from './repo.ts';

const path = process.env.BUDGET_DB ?? 'data/budget-demo.db';
for (const suffix of ['', '-wal', '-shm']) {
  const file = path + suffix;
  if (existsSync(file)) rmSync(file);
}

const db = openDatabase(path);
migrate(db);
seedIfEmpty(db);

// Category ids follow the seeded order (apps/api/src/seed.ts).
const C = {
  Rent: 1, Bills: 2, Groceries: 3, Household: 4, Travel: 5,
  FoodOut: 6, Alcohol: 7, Events: 8,
  SelfCare: 9, Supplements: 10, HealthAppt: 11,
  Subs: 12,
  FoodIn: 13, Nicotine: 14, Purchases: 15,
};

type E = [amount: number, category: number, date: string, note?: string];

// Feb–May are full months; June is "to date" (today is 2026-06-06), so it reads as
// "this month so far" against last month. Notable shapes: Rent flat (ex-discretionary),
// Nicotine declining (the category being cut), Subscriptions/Supplements flat (muted
// trend rows), a spiky £210 Purchase in March.
const entries: E[] = [
  // ── February 2026 ──
  [120000, C.Rent, '2026-02-01'],
  [3200, C.Subs, '2026-02-02', 'Netflix, Spotify, ChatGPT'],
  [13200, C.Bills, '2026-02-06', 'electric + council tax'],
  [11500, C.Travel, '2026-02-03'],
  [5200, C.Groceries, '2026-02-04'],
  [4800, C.Groceries, '2026-02-11'],
  [5500, C.Groceries, '2026-02-18'],
  [4600, C.Groceries, '2026-02-25'],
  [1800, C.Household, '2026-02-12', 'bin bags + cleaner'],
  [6800, C.FoodOut, '2026-02-08', 'dinner with mates'],
  [4200, C.FoodOut, '2026-02-21'],
  [4500, C.Alcohol, '2026-02-08'],
  [3800, C.Alcohol, '2026-02-22'],
  [1500, C.SelfCare, '2026-02-15'],
  [1800, C.Supplements, '2026-02-05'],
  [2800, C.FoodIn, '2026-02-14', 'Deliveroo'],
  [1500, C.FoodIn, '2026-02-27', 'sweets'],
  [8800, C.Nicotine, '2026-02-10'],
  [3500, C.Purchases, '2026-02-19', 'Steam game'],

  // ── March 2026 ──
  [120000, C.Rent, '2026-03-01'],
  [3200, C.Subs, '2026-03-02', 'Netflix, Spotify, ChatGPT'],
  [9800, C.Bills, '2026-03-07'],
  [9800, C.Travel, '2026-03-04'],
  [5400, C.Groceries, '2026-03-03'],
  [6100, C.Groceries, '2026-03-10'],
  [4900, C.Groceries, '2026-03-17'],
  [5800, C.Groceries, '2026-03-24'],
  [2400, C.Household, '2026-03-09'],
  [9200, C.FoodOut, '2026-03-14', 'birthday dinner'],
  [5500, C.FoodOut, '2026-03-28'],
  [6200, C.Alcohol, '2026-03-14'],
  [3500, C.Events, '2026-03-21', 'gig ticket'],
  [3500, C.SelfCare, '2026-03-12', 'skincare'],
  [1800, C.Supplements, '2026-03-05'],
  [4200, C.FoodIn, '2026-03-19', 'Deliveroo'],
  [7200, C.Nicotine, '2026-03-11'],
  [21000, C.Purchases, '2026-03-16', 'new shoes'],
  [1800, C.Purchases, '2026-03-30', 'phone case'],

  // ── April 2026 ──
  [120000, C.Rent, '2026-04-01'],
  [3200, C.Subs, '2026-04-02', 'Netflix, Spotify, ChatGPT'],
  [14500, C.Bills, '2026-04-08', 'electric + water'],
  [13200, C.Travel, '2026-04-03'],
  [5800, C.Groceries, '2026-04-06'],
  [6200, C.Groceries, '2026-04-13'],
  [5100, C.Groceries, '2026-04-20'],
  [6400, C.Groceries, '2026-04-27'],
  [1500, C.Household, '2026-04-15'],
  [7100, C.FoodOut, '2026-04-18'],
  [5100, C.Alcohol, '2026-04-11'],
  [2900, C.Alcohol, '2026-04-25'],
  [1200, C.SelfCare, '2026-04-09'],
  [1800, C.Supplements, '2026-04-05'],
  [4500, C.HealthAppt, '2026-04-22', 'physio'],
  [3100, C.FoodIn, '2026-04-12'],
  [1800, C.FoodIn, '2026-04-26', 'milkshake + sweets'],
  [6100, C.Nicotine, '2026-04-10'],
  [4200, C.Purchases, '2026-04-17', 'new t-shirts'],

  // ── May 2026 ──
  [120000, C.Rent, '2026-05-01'],
  [3200, C.Subs, '2026-05-02', 'Netflix, Spotify, ChatGPT'],
  [11000, C.Bills, '2026-05-07'],
  [10500, C.Travel, '2026-05-03'],
  [6100, C.Groceries, '2026-05-05'],
  [5500, C.Groceries, '2026-05-12'],
  [5900, C.Groceries, '2026-05-19'],
  [4900, C.Groceries, '2026-05-26'],
  [3200, C.Household, '2026-05-10', 'cleaning supplies'],
  [12500, C.FoodOut, '2026-05-16', 'birthday dinner out'],
  [4800, C.FoodOut, '2026-05-30'],
  [8800, C.Alcohol, '2026-05-16', 'big night'],
  [4200, C.Alcohol, '2026-05-23'],
  [2000, C.Events, '2026-05-23', 'club entry'],
  [2800, C.SelfCare, '2026-05-14'],
  [1800, C.Supplements, '2026-05-05'],
  [2400, C.FoodIn, '2026-05-20'],
  [4800, C.Nicotine, '2026-05-09'],
  [2500, C.Purchases, '2026-05-21', 'book + charger'],

  // ── June 2026 (to date) ──
  [120000, C.Rent, '2026-06-01'],
  [3200, C.Subs, '2026-06-02', 'Netflix, Spotify, ChatGPT'],
  [4200, C.Travel, '2026-06-02'],
  [3800, C.FoodOut, '2026-06-04'],
  [5200, C.Alcohol, '2026-06-04', 'friday pub'],
  [1800, C.Supplements, '2026-06-05'],
  [1900, C.FoodIn, '2026-06-03', 'Deliveroo'],
  [800, C.FoodIn, '2026-06-06', 'sweets'],
  [1500, C.Nicotine, '2026-06-05'],
];

for (const [amount, category, date, note] of entries) {
  createEntry(db, { amount_pence: amount, category_id: category, date, note: note ?? null });
}

// Two June itemised lists: an in-store shop (some items shared 50% with the flatmate,
// no delivery fee) and an online order (shared items + a delivery/bag fee).
const lists: NewList[] = [
  {
    date: '2026-06-03',
    note: "Tesco weekly shop",
    delivery_fee_pence: 0,
    delivery_share_pct: 0,
    delivery_category_id: C.Groceries,
    items: [
      { name: 'Milk 2pt', price_pence: 250, quantity: 1, share_pct: 0, category_id: C.Groceries },
      { name: 'Bread', price_pence: 120, quantity: 1, share_pct: 0, category_id: C.Groceries },
      { name: 'Pasta', price_pence: 300, quantity: 3, share_pct: 0, category_id: C.Groceries },
      { name: 'Cereal bars', price_pence: 600, quantity: 5, share_pct: 0, category_id: C.Groceries },
      { name: 'Chicken thighs', price_pence: 580, quantity: 1, share_pct: 0, category_id: C.Groceries },
      { name: 'Washing-up liquid', price_pence: 200, quantity: 1, share_pct: 50, category_id: C.Household },
      { name: 'Bin bags', price_pence: 250, quantity: 1, share_pct: 50, category_id: C.Household },
      { name: 'Shower gel', price_pence: 320, quantity: 1, share_pct: 0, category_id: C.SelfCare },
      { name: 'Deodorant', price_pence: 280, quantity: 1, share_pct: 0, category_id: C.SelfCare },
    ],
  },
  {
    date: '2026-06-05',
    note: 'Ocado online order',
    delivery_fee_pence: 350,
    delivery_share_pct: 50,
    delivery_category_id: C.Groceries,
    items: [
      { name: 'Coffee beans', price_pence: 650, quantity: 1, share_pct: 0, category_id: C.Groceries },
      { name: 'Oat milk', price_pence: 360, quantity: 2, share_pct: 0, category_id: C.Groceries },
      { name: 'Eggs', price_pence: 290, quantity: 1, share_pct: 0, category_id: C.Groceries },
      { name: 'Cheddar', price_pence: 420, quantity: 1, share_pct: 50, category_id: C.Groceries },
      { name: 'Kitchen roll', price_pence: 300, quantity: 1, share_pct: 50, category_id: C.Household },
      { name: 'Surface cleaner', price_pence: 280, quantity: 1, share_pct: 50, category_id: C.Household },
    ],
  },
];

for (const list of lists) createList(db, list);

setIncome(db, 2026, 2, 245000);
setIncome(db, 2026, 3, 250000);
setIncome(db, 2026, 4, 250000);
setIncome(db, 2026, 5, 260000);
setIncome(db, 2026, 6, 250000);

db.close();
console.log(`demo db built at ${path}: ${entries.length} entries, ${lists.length} lists, 5 months income`);
