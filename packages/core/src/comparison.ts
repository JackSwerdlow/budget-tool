// Per-row comparison: this month's spend-to-date as a % of that row's OWN last-month
// full total. A zero baseline (brand-new category or first ever month) returns null
// ("new") so the UI shows a chip and no bar — never Infinity/NaN.
export function comparePct(thisPence: number, lastFullPence: number): number | null {
  if (lastFullPence <= 0) return null;
  return Math.round((thisPence / lastFullPence) * 100);
}
