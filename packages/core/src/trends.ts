export type MatrixCell = {
  amountPence: number;
  pctVsPrevMonth: number | null; // signed; null for the first column or when prev was 0
  heat: number | null; // 0 (row min) .. 1 (row max); null when the row is muted
};

export type MatrixRowInput = { id: number; amounts: number[] };
export type MatrixRow = { id: number; cells: MatrixCell[]; muted: boolean };

// Per cell: amount, signed % vs the previous month, and a ROW-RELATIVE heat (which
// months were heaviest for that row). A near-flat row is muted (held neutral) so a
// small wobble doesn't blaze red.
export function buildMatrix(rows: MatrixRowInput[], opts: { muteThreshold?: number } = {}): MatrixRow[] {
  const muteThreshold = opts.muteThreshold ?? 0.12;

  return rows.map((row) => {
    const { amounts } = row;
    const max = amounts.length ? Math.max(...amounts) : 0;
    const min = amounts.length ? Math.min(...amounts) : 0;
    const spread = max - min;
    const muted = max === 0 || spread < muteThreshold * max;

    const cells: MatrixCell[] = amounts.map((amount, j) => {
      const prev = j > 0 ? amounts[j - 1] : null;
      const pctVsPrevMonth =
        prev === null || prev === 0 ? null : Math.round(((amount - prev) / prev) * 100);
      const heat = muted ? null : (amount - min) / spread;
      return { amountPence: amount, pctVsPrevMonth, heat };
    });

    return { id: row.id, cells, muted };
  });
}
