import { describe, expect, it } from 'vitest';
import type { Selection } from './account-selection.js';
import { ReadingReadiness } from './reading-readiness.js';

const account: Selection = {
  kind: 'account',
  account: {
    stableId: 'a',
    sessionId: 's',
    currency: 'EUR',
    kind: 'CACC',
    last4: '1',
  },
};

describe('ReadingReadiness', () => {
  it('is ready with a connection, an account and a start date', () => {
    const readiness = new ReadingReadiness('connected', account, '2026-09-01');

    expect(readiness.ready()).toBe(true);
    expect(readiness.missing()).toEqual([]);
  });

  it('misses the connection first, and the start date', () => {
    const readiness = new ReadingReadiness(
      'none',
      { kind: 'not_connected' },
      null
    );

    expect(readiness.ready()).toBe(false);
    expect(readiness.missing()).toEqual(['not_connected', 'no_start_date']);
  });

  it('misses a connection that must be made again', () => {
    expect(
      new ReadingReadiness('reconnect_needed', account, '2026-09-01').missing()
    ).toEqual(['reconnect_needed']);
  });

  it('misses the start date', () => {
    expect(new ReadingReadiness('connected', account, null).missing()).toEqual([
      'no_start_date',
    ]);
  });

  it('misses the choice of account', () => {
    expect(
      new ReadingReadiness(
        'connected',
        { kind: 'choose' },
        '2026-09-01'
      ).missing()
    ).toEqual(['choose_account']);
  });

  it('misses an account in the currency', () => {
    expect(
      new ReadingReadiness(
        'connected',
        { kind: 'none_in_currency' },
        '2026-09-01'
      ).missing()
    ).toEqual(['no_account_in_currency']);
  });

  it('lists everything missing in the order the panel says it', () => {
    expect(
      new ReadingReadiness(
        'reconnect_needed',
        { kind: 'choose' },
        null
      ).missing()
    ).toEqual(['reconnect_needed', 'no_start_date', 'choose_account']);
  });
});
