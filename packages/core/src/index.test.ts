import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from './index';

describe('core package harness', () => {
  it('is importable and runs under Vitest', () => {
    expect(CORE_VERSION).toBe('0.0.0');
  });
});
