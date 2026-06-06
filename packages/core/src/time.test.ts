import { describe, expect, it } from 'vitest';
import { monthKey, nextMonth, previousMonth, ymOf } from './time';

describe('ymOf', () => {
  it('takes the YYYY-MM prefix by string slice', () => {
    expect(ymOf('2026-06-06')).toBe('2026-06');
    expect(ymOf('2026-01-31')).toBe('2026-01');
  });

  it('never shifts month (string slice, not new Date) — first-of-month stays put', () => {
    // new Date('2026-03-01') would be UTC midnight and could render 2026-02-28
    // in a negative-offset timezone. Slicing is immune.
    expect(ymOf('2026-03-01')).toBe('2026-03');
  });
});

describe('monthKey', () => {
  it('zero-pads the month', () => {
    expect(monthKey(2026, 6)).toBe('2026-06');
    expect(monthKey(2026, 12)).toBe('2026-12');
  });
});

describe('previousMonth', () => {
  it('steps back within a year', () => {
    expect(previousMonth('2026-06')).toBe('2026-05');
  });

  it('rolls January back to the previous December', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('nextMonth', () => {
  it('steps forward within a year', () => {
    expect(nextMonth('2026-06')).toBe('2026-07');
  });

  it('rolls December forward to the next January', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
  });
});
