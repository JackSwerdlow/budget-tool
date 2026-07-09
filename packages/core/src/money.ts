// Money is integer pence everywhere; displayed en-GB as £x.xx.

// A pounds term: either thousands-grouped (1,234) or plain (1234), with optional .dd.
// A lone "1,5" matches neither group nor plain-with-the-comma, so it is rejected rather
// than silently misread as thousands (which would 10x/100x the amount).
const TERM = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
const ONE_VALUE = new RegExp(`^(-?)(${TERM})$`);

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

// Exact rational arithmetic (BigInt numerator/denominator) so that a chain of + - * /
// never accumulates floating-point error before the single rounding step at the end.
interface Rational {
  n: bigint;
  d: bigint; // always > 0
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

function rational(n: bigint, d: bigint): Rational {
  if (d === 0n) throw new Error('division by zero');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return g === 0n ? { n: 0n, d: 1n } : { n: n / g, d: d / g };
}

const ratAdd = (a: Rational, b: Rational): Rational => rational(a.n * b.d + b.n * a.d, a.d * b.d);
const ratSub = (a: Rational, b: Rational): Rational => rational(a.n * b.d - b.n * a.d, a.d * b.d);
const ratMul = (a: Rational, b: Rational): Rational => rational(a.n * b.n, a.d * b.d);
const ratDiv = (a: Rational, b: Rational): Rational => rational(a.n * b.d, a.d * b.n);
const ratNeg = (a: Rational): Rational => ({ n: -a.n, d: a.d });

// Round a rational UP to the nearest whole unit (toward +Infinity) — used to turn the
// final pence value up rather than truncating it, so a split cost never comes up short.
function ceilRational(r: Rational): bigint {
  if (r.n % r.d === 0n) return r.n / r.d;
  return r.n >= 0n ? r.n / r.d + 1n : r.n / r.d;
}

const TOKEN = new RegExp(`(${TERM})|([()+\\-*/])`, 'y');

type Token = { type: 'num'; value: Rational } | { type: 'op'; value: string };

function termToRational(token: string): Rational {
  const [whole, frac = ''] = token.replace(/,/g, '').split('.');
  const pence = BigInt(whole || '0') * 100n + BigInt(frac.padEnd(2, '0') || '00');
  return rational(pence, 100n);
}

function tokenize(cleaned: string, original: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < cleaned.length) {
    TOKEN.lastIndex = pos;
    const match = TOKEN.exec(cleaned);
    if (!match) throw new Error(`invalid expression: "${original}"`);
    if (match[1] !== undefined) {
      tokens.push({ type: 'num', value: termToRational(match[1]) });
    } else {
      tokens.push({ type: 'op', value: match[2] });
    }
    pos = TOKEN.lastIndex;
  }
  return tokens;
}

// Recursive-descent parser over +, -, *, /, unary +/-, and parentheses, with standard
// precedence (* / bind tighter than + -). Grammar:
//   expr   := term (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := ('+' | '-') factor | primary
//   primary := NUMBER | '(' expr ')'
class ExpressionParser {
  private pos = 0;
  private readonly tokens: Token[];
  private readonly original: string;

  constructor(tokens: Token[], original: string) {
    this.tokens = tokens;
    this.original = original;
  }

  parse(): Rational {
    const result = this.parseExpr();
    if (this.pos !== this.tokens.length) this.fail();
    return result;
  }

  private fail(): never {
    throw new Error(`invalid expression: "${this.original}"`);
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (!token) this.fail();
    this.pos++;
    return token;
  }

  private parseExpr(): Rational {
    let left = this.parseTerm();
    for (let op = this.peek(); op?.type === 'op' && (op.value === '+' || op.value === '-'); op = this.peek()) {
      this.next();
      const right = this.parseTerm();
      left = op.value === '+' ? ratAdd(left, right) : ratSub(left, right);
    }
    return left;
  }

  private parseTerm(): Rational {
    let left = this.parseFactor();
    for (let op = this.peek(); op?.type === 'op' && (op.value === '*' || op.value === '/'); op = this.peek()) {
      this.next();
      const right = this.parseFactor();
      left = op.value === '*' ? ratMul(left, right) : ratDiv(left, right);
    }
    return left;
  }

  private parseFactor(): Rational {
    const token = this.peek();
    if (token?.type === 'op' && token.value === '-') {
      this.next();
      return ratNeg(this.parseFactor());
    }
    if (token?.type === 'op' && token.value === '+') {
      this.next();
      return this.parseFactor();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Rational {
    const token = this.next();
    if (token.type === 'num') return token.value;
    if (token.value === '(') {
      const inner = this.parseExpr();
      const close = this.next();
      if (close.type !== 'op' || close.value !== ')') this.fail();
      return inner;
    }
    this.fail();
  }
}

// Expression evaluator for the cost boxes: "8+8+8+5" -> 2900, but also brackets and
// * / with standard precedence, e.g. "(8*5)/3 + 5" -> 1834 (£18.34). Arithmetic is done
// in exact rationals throughout, and only rounded once — up to the next penny — when the
// final total is converted to pence, so a division only ever costs the payer a fraction
// of a penny extra, never short.
export function evalSum(input: string): number {
  const cleaned = input.replace(/[£\s]/g, '');
  if (cleaned === '') throw new Error('empty expression');

  const tokens = tokenize(cleaned, input);
  const total = new ExpressionParser(tokens, input).parse();
  const pence = ceilRational(ratMul(total, { n: 100n, d: 1n }));
  const result = Number(pence);
  if (!Number.isSafeInteger(result)) throw new Error(`expression result out of safe range: "${input}"`);
  return result;
}
