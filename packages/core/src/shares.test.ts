import { describe, expect, it } from 'vitest';
import { splitCost } from './shares';

describe('splitCost (no half-pence; half-UP)', () => {
  it('canonical £0.07 @ 50% -> me 3 / flatmate 4', () => {
    expect(splitCost(7, 50)).toEqual({ mine: 3, flatmate: 4 });
  });

  it('canonical £9.00 @ 33% -> me 603 / flatmate 297', () => {
    expect(splitCost(900, 33)).toEqual({ mine: 603, flatmate: 297 });
  });

  it('0% means I pay the whole item', () => {
    expect(splitCost(1299, 0)).toEqual({ mine: 1299, flatmate: 0 });
  });

  it('100% means the flatmate covers it', () => {
    expect(splitCost(1299, 100)).toEqual({ mine: 0, flatmate: 1299 });
  });

  it('an even 50% split is clean', () => {
    expect(splitCost(1000, 50)).toEqual({ mine: 500, flatmate: 500 });
  });

  it('rounds half-UP, not bankers (£0.05 @ 50% -> flatmate 3, not 2)', () => {
    expect(splitCost(5, 50)).toEqual({ mine: 2, flatmate: 3 });
  });

  it('mine + flatmate always equals the price exactly, both integers', () => {
    for (let price = 0; price <= 300; price++) {
      for (const pct of [0, 1, 17, 33, 50, 66, 99, 100]) {
        const { mine, flatmate } = splitCost(price, pct);
        expect(mine + flatmate).toBe(price);
        expect(Number.isInteger(mine)).toBe(true);
        expect(Number.isInteger(flatmate)).toBe(true);
      }
    }
  });
});
