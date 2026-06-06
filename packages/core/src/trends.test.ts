import { describe, expect, it } from 'vitest';
import { buildMatrix } from './trends';

describe('buildMatrix', () => {
  it('first column pct is null; later columns are signed % vs the previous month', () => {
    const [row] = buildMatrix([{ id: 1, amounts: [10000, 15000, 9000] }]);
    expect(row.cells.map((c) => c.pctVsPrevMonth)).toEqual([null, 50, -40]);
  });

  it('keeps the amount per cell', () => {
    const [row] = buildMatrix([{ id: 1, amounts: [10000, 15000, 9000] }]);
    expect(row.cells.map((c) => c.amountPence)).toEqual([10000, 15000, 9000]);
  });

  it('row-relative heat: the row min -> 0, the row max -> 1', () => {
    const [row] = buildMatrix([{ id: 1, amounts: [10000, 15000, 9000] }]);
    expect(row.muted).toBe(false);
    expect(row.cells[2].heat).toBeCloseTo(0); // 9000 is the row min
    expect(row.cells[1].heat).toBeCloseTo(1); // 15000 is the row max
    expect(row.cells[0].heat).toBeCloseTo((10000 - 9000) / (15000 - 9000));
  });

  it('mutes a near-flat row (spread < 12% of max) — all heat null', () => {
    const [row] = buildMatrix([{ id: 1, amounts: [1000, 1010, 995] }]);
    expect(row.muted).toBe(true);
    expect(row.cells.every((c) => c.heat === null)).toBe(true);
  });

  it('mutes an all-zero row', () => {
    const [row] = buildMatrix([{ id: 1, amounts: [0, 0, 0] }]);
    expect(row.muted).toBe(true);
    expect(row.cells.every((c) => c.heat === null)).toBe(true);
  });

  it('pct is null when the previous month was 0 (new spend, not Infinity)', () => {
    const [row] = buildMatrix([{ id: 1, amounts: [0, 500] }]);
    expect(row.cells[1].pctVsPrevMonth).toBeNull();
  });
});
