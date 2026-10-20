import { describe, expect, it } from 'vitest';
import type { RawEntry } from '../bizum/ports.js';
import { RevolutDialect } from './revolut-dialect.js';

/**
 * The requirements of how a bank's entries are read, as Given/When/Then, through the real
 * dialect with entries shaped as the bank reports them.
 */
const account = { stableId: 'h1', sessionId: 'uid-1' };
const dialect = new RevolutDialect();

class Entry {
  constructor(private readonly fields: Record<string, unknown> = {}) {}

  with(over: Record<string, unknown>): Entry {
    return new Entry({ ...this.fields, ...over });
  }

  raw(): RawEntry {
    return {
      entry_reference: 'r1',
      status: 'BOOK',
      credit_debit_indicator: 'CRDT',
      transaction_amount: { amount: '4.00', currency: 'EUR' },
      booking_date: '2026-10-12',
      remittance_information: ['pachanga', 'Bizum payment from: Marta G.L.'],
      ...this.fields,
    };
  }

  recognised() {
    return dialect.recognise(this.raw(), account);
  }
}

describe('the bank entry requirements', () => {
  describe('UC-006-02-S1 — A Bizum judged matched or dubious is kept', () => {
    it.each([
      ['4.00', '2026-10-12', 'Marta G.L.', 'pachanga', 400],
      ['8.00', '2026-10-13', '+34600000000', '', 800],
      ['4.00', '2026-09-01', 'Marta G.L.', 'miércoles', 400],
    ])(
      'recognises %s EUR booked %s from %s with message %j',
      (amount, booked, sender, message, cents) => {
        const result = new Entry({
          transaction_amount: { amount, currency: 'EUR' },
          booking_date: booked,
          remittance_information: [message, `Bizum payment from: ${sender}`],
        }).recognised();

        expect(result.kind).toBe('bizum');
        if (result.kind !== 'bizum') return;
        const { bizum } = result;
        expect(bizum.amountCents).toBe(cents);
        expect(bizum.bookedOn).toBe(booked);
        expect(bizum.sender.name ?? bizum.sender.phone).toBe(sender);
        expect(bizum.subject).toBe(message === '' ? null : message);
        expect(bizum.key.reference).toBe('r1');
      }
    );
  });

  describe('UC-006-02-S2 — What is not kept', () => {
    it.each([
      [
        'an outgoing Bizum',
        new Entry().with({ credit_debit_indicator: 'DBIT' }),
      ],
      [
        'an incoming top-up that is not a Bizum',
        new Entry().with({ remittance_information: ['Dinero de Marta'] }),
      ],
    ])('does not recognise %s', (_name, entry) => {
      expect(entry.recognised()).toMatchObject({
        kind: 'ignore',
        why: 'not_a_bizum',
      });
    });

    it('does not recognise an incoming Bizum still pending, and does not remember it', () => {
      expect(new Entry().with({ status: 'PDNG' }).recognised()).toEqual({
        kind: 'ignore',
        why: 'pending',
        key: null,
      });
    });
  });

  describe('UC-006-02-S4 — Two Bizums that look the same are two Bizums', () => {
    it('keys them apart by the bank identification', () => {
      const first = new Entry().with({ entry_reference: 'a' }).recognised();
      const second = new Entry().with({ entry_reference: 'b' }).recognised();

      expect(first.kind === 'bizum' && second.kind === 'bizum').toBe(true);
      if (first.kind !== 'bizum' || second.kind !== 'bizum') return;
      expect(first.bizum.key.sameAs(second.bizum.key)).toBe(false);
      expect(first.bizum.amountCents).toBe(second.bizum.amountCents);
    });
  });

  describe('UC-006-02-S5 — Amounts are kept exactly', () => {
    it.each([
      ['4.00', 400],
      ['12.00', 1200],
      ['4.50', 450],
    ])('keeps %s as %i cents', (amount, cents) => {
      const result = new Entry()
        .with({ transaction_amount: { amount, currency: 'EUR' } })
        .recognised();

      expect(result.kind === 'bizum' && result.bizum.amountCents).toBe(cents);
    });
  });
});
