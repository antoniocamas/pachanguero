import { describe, expect, it } from 'vitest';
import { LockoutPolicy } from './lockout-policy.js';

describe('LockoutPolicy', () => {
  const policy = new LockoutPolicy();
  const now = new Date('2026-10-11T10:00:00.000Z');

  it('locks at the fifth failed attempt and not before', () => {
    expect(policy.exhausted(4)).toBe(false);
    expect(policy.exhausted(5)).toBe(true);
    expect(policy.exhausted(9)).toBe(true);
  });

  it('locks for fifteen minutes from now', () => {
    expect(policy.lockUntil(now).toISOString()).toBe(
      '2026-10-11T10:15:00.000Z'
    );
  });

  it('is locked until the moment passes, and not when there is no lock', () => {
    const until = new Date('2026-10-11T10:10:00.000Z');
    expect(policy.isLocked(until, now)).toBe(true);
    expect(policy.isLocked(until, until)).toBe(false);
    expect(policy.isLocked(null, now)).toBe(false);
  });

  it('reports the minutes left rounded up, never below one', () => {
    expect(policy.minutesLeft(new Date('2026-10-11T10:10:00.000Z'), now)).toBe(
      10
    );
    expect(policy.minutesLeft(new Date('2026-10-11T10:09:01.000Z'), now)).toBe(
      10
    );
    expect(policy.minutesLeft(new Date('2026-10-11T10:00:05.000Z'), now)).toBe(
      1
    );
  });

  it('restarts one short of the limit after a lock expires', () => {
    expect(policy.attemptsAfterExpiry()).toBe(4);
  });
});
