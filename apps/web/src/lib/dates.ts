import { nextMonth } from '@budget/core';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthShort(ym: string): string {
  return `${MONTH_ABBR[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
}

// Bare month abbreviation ("Jun"), no year — for labels already scoped to one month.
export function monthAbbr(ym: string): string {
  return MONTH_ABBR[Number(ym.slice(5, 7)) - 1];
}

// Inclusive YYYY-MM range (lexical compare is safe), capped to the last maxCount.
export function monthsRange(startYm: string, endYm: string, maxCount = 12): string[] {
  const out: string[] = [];
  let ym = startYm;
  while (ym <= endYm && out.length < 240) {
    out.push(ym);
    ym = nextMonth(ym);
  }
  return out.slice(-maxCount);
}

// Local "today" as YYYY-MM-DD (no UTC shift — uses local getters, not toISOString).
export function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function monthLabel(ym: string): string {
  return `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

// Full calendar date from a YYYY-MM-DD string, e.g. "7 June 2026" (by slice, no Date parse).
export function fullDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Fri 4 Jun" — weekday + day + month, from a YYYY-MM-DD string. The Date is built
// from numeric components (no string parse), so there's no timezone shift.
export function dayHeading(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${WEEKDAY_ABBR[new Date(year, month - 1, day).getDay()]} ${day} ${MONTH_ABBR[month - 1]}`;
}

export function daysInMonth(ym: string): number {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return new Date(year, month, 0).getDate();
}

// Day-of-month (1..31) from a YYYY-MM-DD string, by slice (no Date parse).
export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}
