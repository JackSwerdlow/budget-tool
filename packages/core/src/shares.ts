export type Split = { mine: number; flatmate: number };

// share_pct is the flatmate's slice. Rounding is half-UP (JS Math.round) so there
// are never half-pence; mine takes the remainder so mine + flatmate === price exactly.
export function splitCost(pricePence: number, sharePct: number): Split {
  const flatmate = Math.round((pricePence * sharePct) / 100);
  return { mine: pricePence - flatmate, flatmate };
}
