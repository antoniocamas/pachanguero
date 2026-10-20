import { describe, expect, it } from 'vitest';
import type { AccountRef } from '../../bizum/ports.js';
import { FakeBankDialect } from './fake-bank-dialect.js';

describe('FakeBankDialect', () => {
  const dialect = new FakeBankDialect();
  const account: AccountRef = { stableId: 'hash-1', sessionId: 'uid-1' };
  const entry = (over: Record<string, unknown> = {}) => ({
    id: 'f-1',
    kind: 'BIZUM_IN',
    state: 'DONE',
    bookedAt: '2026-10-12',
    cents: 400,
    ccy: 'EUR',
    from: { name: 'Marta G.L.', phone: '+34611000111' },
    to: { name: null, phone: null },
    concept: 'pachanga',
    ...over,
  });

  it('is a bank of its own', () => {
    expect(dialect.id).toBe('fake');
    expect(dialect.bank).toEqual({ name: 'Banco Ficticio', country: 'ES' });
  });

  it('recognises an incoming Bizum with both a name and a phone for the sender', () => {
    const found = dialect.recognise(entry(), account);
    expect(found.kind).toBe('bizum');
    if (found.kind !== 'bizum') return;
    expect(found.bizum).toMatchObject({
      direction: 'incoming',
      bookedOn: '2026-10-12',
      amountCents: 400,
      currency: 'EUR',
      sender: { name: 'Marta G.L.', phone: '+34611000111' },
      subject: 'pachanga',
    });
    expect(found.bizum.key).toMatchObject({
      account: 'hash-1',
      reference: 'f-1',
    });
  });

  it('recognises an outgoing Bizum with its receiver', () => {
    const found = dialect.recognise(
      entry({
        kind: 'BIZUM_OUT',
        to: { name: 'Luis P.', phone: '+34622000222' },
      }),
      account
    );
    expect(found.kind === 'bizum' && found.bizum.counterparty()).toEqual({
      name: 'Luis P.',
      phone: '+34622000222',
    });
  });

  it('ignores anything that is not a Bizum, keeping its key', () => {
    expect(dialect.recognise(entry({ kind: 'CARD' }), account)).toMatchObject({
      kind: 'ignore',
      why: 'not_a_bizum',
      key: { reference: 'f-1' },
    });
  });

  it('ignores a pending Bizum without a key, so it is read again once booked', () => {
    expect(dialect.recognise(entry({ state: 'PENDING' }), account)).toEqual({
      kind: 'ignore',
      why: 'pending',
      key: null,
    });
  });

  it('ignores a booked Bizum with no id as unidentified', () => {
    expect(dialect.recognise(entry({ id: ' ' }), account)).toEqual({
      kind: 'ignore',
      why: 'unidentified',
      key: null,
    });
  });

  it('ignores an entry whose amount is broken', () => {
    expect(dialect.recognise(entry({ cents: 4.5 }), account)).toMatchObject({
      kind: 'ignore',
      why: 'not_a_bizum',
    });
  });

  it('describes an account by currency, type and the last four characters', () => {
    expect(
      dialect.describeAccount({
        uid: 'uid-9',
        identification_hash: 'hash-9',
        details: {
          currency: 'EUR',
          cash_account_type: 'CACC',
          account_id: { iban: 'ES0000000000000000001111' },
        },
      })
    ).toEqual({
      stableId: 'hash-9',
      sessionId: 'uid-9',
      currency: 'EUR',
      kind: 'CACC',
      last4: '1111',
    });
  });
});
