// Money is integer pence everywhere; displayed en-GB as £x.xx.

function poundsToPence(token: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(token);
  if (!match) throw new Error(`invalid pounds value: "${token}"`);
  const sign = match[1] === '-' ? -1 : 1;
  const pounds = Number(match[2]);
  const pence = Number((match[3] ?? '').padEnd(2, '0'));
  return sign * (pounds * 100 + pence);
}

export function formatGBP(pence: number): string {
  const negative = pence < 0;
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${negative ? '-' : ''}£${pounds.toLocaleString('en-GB')}.${String(remainder).padStart(2, '0')}`;
}

export function parsePounds(input: string): number {
  const cleaned = input.replace(/[£,\s]/g, '');
  if (cleaned === '') throw new Error('empty pounds value');
  return poundsToPence(cleaned);
}

// Sum-helper: "8+8+8+5" -> 2900. Each term is a pounds value; supports + / -,
// decimals and whitespace; rejects anything else.
export function evalSum(input: string): number {
  const cleaned = input.replace(/[£,\s]/g, '');
  if (cleaned === '') throw new Error('empty expression');
  const valid = /^[+-]?\d+(?:\.\d{1,2})?(?:[+-]\d+(?:\.\d{1,2})?)*$/.test(cleaned);
  if (!valid) throw new Error(`invalid expression: "${input}"`);

  let total = 0;
  for (const term of cleaned.matchAll(/([+-]?)(\d+(?:\.\d{1,2})?)/g)) {
    const sign = term[1] === '-' ? -1 : 1;
    total += sign * poundsToPence(term[2]);
  }
  return total;
}
