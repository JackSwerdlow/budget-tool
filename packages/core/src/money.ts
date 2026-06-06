// Money is integer pence everywhere; displayed en-GB as £x.xx.

// A pounds term: either thousands-grouped (1,234) or plain (1234), with optional .dd.
// A lone "1,5" matches neither group nor plain-with-the-comma, so it is rejected rather
// than silently misread as thousands (which would 10x/100x the amount).
const TERM = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
const ONE_VALUE = new RegExp(`^(-?)(${TERM})$`);
const EXPRESSION = new RegExp(`^[+-]?${TERM}(?:[+-]${TERM})*$`);
const TOKEN = new RegExp(`([+-]?)(${TERM})`, 'g');

function poundsToPence(token: string): number {
  const match = ONE_VALUE.exec(token);
  if (!match) throw new Error(`invalid pounds value: "${token}"`);
  const sign = match[1] === '-' ? -1 : 1;
  const [whole, frac = ''] = match[2].replace(/,/g, '').split('.');
  const pence = sign * (Number(whole) * 100 + Number(frac.padEnd(2, '0')));
  if (!Number.isSafeInteger(pence)) throw new Error(`pounds value out of safe range: "${token}"`);
  return pence;
}

export function formatGBP(pence: number): string {
  const negative = pence < 0;
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${negative ? '-' : ''}£${pounds.toLocaleString('en-GB')}.${String(remainder).padStart(2, '0')}`;
}

export function parsePounds(input: string): number {
  const cleaned = input.replace(/[£\s]/g, ''); // keep commas — grouping is validated below
  if (cleaned === '') throw new Error('empty pounds value');
  return poundsToPence(cleaned);
}

// Sum-helper: "8+8+8+5" -> 2900. Each term is a pounds value; supports + / -, decimals,
// whitespace and valid thousands grouping; rejects anything else.
export function evalSum(input: string): number {
  const cleaned = input.replace(/[£\s]/g, '');
  if (cleaned === '') throw new Error('empty expression');
  if (!EXPRESSION.test(cleaned)) throw new Error(`invalid expression: "${input}"`);

  let total = 0;
  for (const term of cleaned.matchAll(TOKEN)) {
    const sign = term[1] === '-' ? -1 : 1;
    total += sign * poundsToPence(term[2]);
  }
  return total;
}
