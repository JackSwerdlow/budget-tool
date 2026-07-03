import { describe, expect, it } from 'vitest';
import { moneyScale } from './kit';

describe('moneyScale (dynamic nice-step axis)', () => {
  it('keeps the £500 grid for a typical full month', () => {
    const s = moneyScale(200000); // £2,000
    expect(s.ticks).toEqual([0, 50000, 100000, 150000, 200000]);
    expect(s.format(50000)).toBe('£500');
  });

  it('drops to a £100 grid for a filtered-down month', () => {
    const s = moneyScale(60000); // £600
    expect(s.ticks[1]).toBe(10000);
    expect(s.yMax).toBe(60000);
  });

  it('gives a £5 grid to a typical item price', () => {
    const s = moneyScale(1500); // £15
    expect(s.ticks[1]).toBe(500);
    expect(s.yMax).toBe(1500);
  });

  it('gives a penny grid with 2dp labels to a very cheap item', () => {
    const s = moneyScale(4); // 4p
    expect(s.ticks).toEqual([0, 1, 2, 3, 4]);
    expect(s.format(3)).toBe('£0.03');
  });

  it('never exceeds six intervals across magnitudes', () => {
    for (const max of [1, 7, 43, 99, 101, 999, 12345, 68000, 250001, 3210000]) {
      const s = moneyScale(max);
      expect(s.ticks.length - 1).toBeLessThanOrEqual(6);
      expect(s.yMax).toBeGreaterThanOrEqual(max);
    }
  });

  it('keeps the old £0–£500 frame for an empty chart', () => {
    const s = moneyScale(0);
    expect(s.ticks).toEqual([0, 50000]);
  });
});
