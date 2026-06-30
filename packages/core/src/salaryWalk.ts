import type { SalaryConfig, WalkMonth } from './types.ts';

const idx = (y: number, m: number) => y * 12 + (m - 1);
const taxYearOf = (y: number, m: number) => (m >= 4 ? y : y - 1);

// Where year-to-date cumulative-PAYE accumulation begins for a viewed (year, month), modelling
// an inherited salary as CONTINUOUS employment. Let F be the earliest saved config overall:
//   • before F           → null (months before the first-ever config are blank)
//   • a LATER tax year   → that tax year's April (the inherited salary covers it from April)
//   • the first tax year → F's real month (a genuine mid-year start, e.g. first job in November)
// Only (year, month) and the config positions matter, so this is a pure function of `configs`.
export function resolveEmploymentStart(
  configs: { year: number; month: number }[],
  year: number,
  month: number,
): { year: number; month: number } | null {
  if (configs.length === 0) return null;
  let first = configs[0];
  for (const c of configs) if (idx(c.year, c.month) < idx(first.year, first.month)) first = c;
  if (idx(year, month) < idx(first.year, first.month)) return null;
  const ty = taxYearOf(year, month);
  const tyFirst = taxYearOf(first.year, first.month);
  return ty > tyFirst ? { year: ty, month: 4 } : { year: first.year, month: first.month };
}

// Iterate every calendar month from the earliest saved config through `through` (inclusive),
// resolving config inheritance (latest saved config at or before the month) and flagging
// whether the month has its own saved row. Returns [] when there are no configs or `through`
// precedes the first one.
export function walkMonths(
  configs: SalaryConfig[],
  through: { year: number; month: number },
): WalkMonth[] {
  if (configs.length === 0) return [];
  const sorted = [...configs].sort((a, b) => idx(a.year, a.month) - idx(b.year, b.month));
  const first = sorted[0];
  const endIdx = idx(through.year, through.month);
  if (endIdx < idx(first.year, first.month)) return [];

  const out: WalkMonth[] = [];
  let y = first.year, m = first.month;
  while (idx(y, m) <= endIdx) {
    // latest config at or before (y, m)
    let resolved = sorted[0];
    for (const c of sorted) {
      if (idx(c.year, c.month) <= idx(y, m)) resolved = c; else break;
    }
    const isExplicit = sorted.some((c) => c.year === y && c.month === m);
    out.push({ year: y, month: m, isExplicit, cfg: { ...resolved, year: y, month: m } });
    if (m === 12) { y += 1; m = 1; } else { m += 1; }
  }
  return out;
}
