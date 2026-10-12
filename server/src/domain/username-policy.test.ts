import { describe, expect, it } from 'vitest';
import { UsernamePolicy } from './username-policy.js';

describe('UsernamePolicy', () => {
  const policy = new UsernamePolicy();

  it('trims and lower-cases', () => {
    expect(policy.normalise('Carlos ')).toBe('carlos');
  });

  it('accepts letters, digits, dot, dash and underscore from 3 to 32 characters', () => {
    expect(policy.isValid('carlos')).toBe(true);
    expect(policy.isValid('c.garcia-7_x')).toBe(true);
    expect(policy.isValid('a'.repeat(32))).toBe(true);
  });

  it.each([
    ['ca'],
    ['a'.repeat(33)],
    ['car los'],
    ['carlos@x.com'],
    ['.carlos'],
    [''],
  ])('refuses %j', name => {
    expect(policy.isValid(name)).toBe(false);
  });
});
