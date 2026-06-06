import { describe, expect, it } from 'vitest';
import { evalSum, formatGBP, parsePounds } from './money';

describe('formatGBP', () => {
  it('formats pence as en-GB pounds', () => {
    expect(formatGBP(23423)).toBe('£234.23');
  });

  it('pads pence to two digits', () => {
    expect(formatGBP(7)).toBe('£0.07');
    expect(formatGBP(150)).toBe('£1.50');
  });

  it('groups thousands', () => {
    expect(formatGBP(100000)).toBe('£1,000.00');
    expect(formatGBP(123456789)).toBe('£1,234,567.89');
  });

  it('handles zero', () => {
    expect(formatGBP(0)).toBe('£0.00');
  });

  it('formats negatives with a leading minus', () => {
    expect(formatGBP(-150)).toBe('-£1.50');
  });
});

describe('parsePounds', () => {
  it('parses a decimal pounds string to integer pence', () => {
    expect(parsePounds('234.23')).toBe(23423);
  });

  it('parses whole pounds', () => {
    expect(parsePounds('29')).toBe(2900);
  });

  it('parses a single decimal place', () => {
    expect(parsePounds('1.5')).toBe(150);
  });

  it('parses small amounts exactly', () => {
    expect(parsePounds('0.07')).toBe(7);
  });

  it('tolerates a £ sign, commas and surrounding whitespace', () => {
    expect(parsePounds(' £1,000.00 ')).toBe(100000);
  });

  it('throws on invalid input', () => {
    expect(() => parsePounds('abc')).toThrow();
    expect(() => parsePounds('1.234')).toThrow();
    expect(() => parsePounds('')).toThrow();
  });
});

describe('evalSum', () => {
  it('sums pounds terms into pence', () => {
    expect(evalSum('8+8+8+5')).toBe(2900);
  });

  it('supports subtraction', () => {
    expect(evalSum('10-2.50')).toBe(750);
  });

  it('supports decimals and whitespace', () => {
    expect(evalSum(' 10.50 + 2.25 ')).toBe(1275);
  });

  it('evaluates a single term like parsePounds', () => {
    expect(evalSum('29')).toBe(2900);
  });

  it('rejects unsupported operators and characters', () => {
    expect(() => evalSum('8*8')).toThrow();
    expect(() => evalSum('8/2')).toThrow();
    expect(() => evalSum('abc')).toThrow();
  });

  it('rejects a term with more than two decimal places', () => {
    expect(() => evalSum('1.234+2')).toThrow();
  });

  it('throws on an empty expression', () => {
    expect(() => evalSum('   ')).toThrow();
  });
});

describe('money safety (review hardening)', () => {
  it('rejects a decimal comma rather than silently misreading it as thousands (no 10x/100x)', () => {
    expect(() => parsePounds('1,5')).toThrow();
    expect(() => parsePounds('1,50')).toThrow();
    expect(() => evalSum('8,5+1')).toThrow();
  });

  it('still accepts valid thousands grouping', () => {
    expect(parsePounds('1,000')).toBe(100000);
    expect(parsePounds('2,500.00')).toBe(250000);
    expect(parsePounds('1,234,567.89')).toBe(123456789);
    expect(evalSum('1,000+5')).toBe(100500);
  });

  it('rejects amounts beyond safe-integer pence instead of losing precision', () => {
    expect(() => parsePounds('99999999999999.99')).toThrow();
  });
});
