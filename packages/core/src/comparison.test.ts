import { describe, expect, it } from 'vitest';
import { comparePct } from './comparison';

describe('comparePct (this-to-date vs last-month full total)', () => {
  it('is the whole-number percentage of last month', () => {
    expect(comparePct(5000, 10000)).toBe(50);
    expect(comparePct(10000, 10000)).toBe(100);
  });

  it('exceeds 100 when over last month', () => {
    expect(comparePct(11300, 10000)).toBe(113);
  });

  it('is 0 when nothing has been spent yet this month', () => {
    expect(comparePct(0, 10000)).toBe(0);
  });

  it('rounds to the nearest whole percent (half-up)', () => {
    expect(comparePct(3350, 10000)).toBe(34);
    expect(comparePct(3349, 10000)).toBe(33);
  });

  it('returns null ("new") with no last-month baseline — never Infinity/NaN', () => {
    expect(comparePct(5000, 0)).toBeNull();
    expect(comparePct(0, 0)).toBeNull();
  });
});
