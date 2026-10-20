import { describe, expect, it } from 'vitest';
import { ConnectionClock } from './connection-clock.js';

describe('ConnectionClock', () => {
  const until = new Date('2027-03-30T10:00:00.000Z');
  const at = (now: string) => new ConnectionClock(until, new Date(now));

  it('counts whole days, rounding up', () => {
    expect(at('2027-03-10T10:00:00.000Z').daysLeft()).toBe(20);
    expect(at('2027-03-10T10:00:01.000Z').daysLeft()).toBe(20);
    expect(at('2027-03-10T09:59:59.000Z').daysLeft()).toBe(21);
  });

  it('counts across midnight by the moment, not the calendar day', () => {
    expect(at('2027-03-29T23:00:00.000Z').daysLeft()).toBe(1);
    expect(at('2027-03-30T00:00:00.000Z').daysLeft()).toBe(1);
  });

  it('is one on the last day and zero once passed', () => {
    expect(at('2027-03-30T09:00:00.000Z').daysLeft()).toBe(1);
    expect(at('2027-03-30T10:00:00.000Z').daysLeft()).toBe(0);
    expect(at('2027-04-15T10:00:00.000Z').daysLeft()).toBe(0);
  });

  it('suggests renewing from 14 days on, not at 15', () => {
    expect(at('2027-03-16T10:00:00.000Z').daysLeft()).toBe(14);
    expect(at('2027-03-16T10:00:00.000Z').renewSuggested()).toBe(true);
    expect(at('2027-03-15T10:00:00.000Z').daysLeft()).toBe(15);
    expect(at('2027-03-15T10:00:00.000Z').renewSuggested()).toBe(false);
  });

  it('has passed at the end instant, not before', () => {
    expect(at('2027-03-30T09:59:59.999Z').passed()).toBe(false);
    expect(at('2027-03-30T10:00:00.000Z').passed()).toBe(true);
  });

  it('keeps its constants', () => {
    expect(ConnectionClock.CONSENT_DAYS).toBe(179);
    expect(ConnectionClock.PENDING_MINUTES).toBe(15);
    expect(ConnectionClock.BANNER_DAYS).toBe(14);
  });
});
