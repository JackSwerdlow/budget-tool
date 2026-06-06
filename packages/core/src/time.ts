// Month bucketing is always a string slice — never `new Date(str)` (avoids a
// timezone month-shift on midnight dates).
export function ymOf(date: string): string {
  return date.slice(0, 7);
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function previousMonth(ym: string): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
}

export function nextMonth(ym: string): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
}
