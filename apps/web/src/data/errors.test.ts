import { test, expect } from 'vitest';
import { normalizeError } from './errors';

test('normalizeError yields a single Error shape', () => {
  expect(normalizeError(new Error('boom')).message).toBe('boom');
  expect(normalizeError('db locked').message).toBe('db locked');
  expect(normalizeError({ message: 'x' }).message).toBe('x');
  expect(normalizeError(42).message).toBe('Unknown data error');
  expect(normalizeError(new Error('keep')) instanceof Error).toBe(true);
});
