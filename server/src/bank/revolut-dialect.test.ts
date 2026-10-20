import { describe, expect, it } from 'vitest';
import type { RawEntry } from '../bizum/ports.js';
import { FakeFixtures } from './fake/fake-fixtures.js';
import { RevolutDialect } from './revolut-dialect.js';

const account = { stableId: 'h1', sessionId: 'uid-1' };

/** A booked incoming Bizum as Revolut reports it, with whatever the test overrides. */
function entry(over: Record<string, unknown> = {}): RawEntry {
  return {
    entry_reference: 'r1',
    status: 'BOOK',
    credit_debit_indicator: 'CRDT',
    transaction_amount: { amount: '4.00', currency: 'EUR' },
    booking_date: '2026-01-15',
    remittance_information: ['pachanga', 'Bizum payment from: Marta G.L.'],
    ...over,
  };
}

describe('RevolutDialect', () => {
  const dialect = new RevolutDialect();
  const recognise = (raw: RawEntry) => dialect.recognise(raw, account);

  it('is the Revolut of Spain', () => {
    expect(dialect.id).toBe('revolut');
    expect(dialect.displayName).toBe('Revolut');
    expect(dialect.bank).toEqual({ name: 'Revolut', country: 'ES' });
  });

  describe('the decision table', () => {
    it('1: ignores an entry that is not booked, with no key, to be read again', () => {
      expect(
        recognise(entry({ status: 'PDNG', entry_reference: undefined }))
      ).toEqual({ kind: 'ignore', why: 'pending', key: null });
      expect(recognise(entry({ status: 'PDNG' }))).toEqual({
        kind: 'ignore',
        why: 'pending',
        key: null,
      });
    });

    it('2: ignores an outgoing entry as not a Bizum, keeping its key', () => {
      const result = recognise(entry({ credit_debit_indicator: 'DBIT' }));

      expect(result).toMatchObject({ kind: 'ignore', why: 'not_a_bizum' });
      expect(result.kind === 'ignore' && result.key?.reference).toBe('r1');
    });

    it('2: gives no key to an outgoing entry without a reference', () => {
      expect(
        recognise(
          entry({ credit_debit_indicator: 'DBIT', entry_reference: undefined })
        )
      ).toEqual({ kind: 'ignore', why: 'not_a_bizum', key: null });
    });

    it.each([
      ['one text only', ['Dinero de Marta']],
      ['three texts', ['a', 'b', 'Bizum payment from: X']],
      ['another prefix', ['pachanga', 'Bizum payment to: Marta G.L.']],
      ['no remittance', undefined],
      ['texts that are not strings', ['pachanga', 7]],
    ])('3: ignores %s as not a Bizum, keeping its key', (_name, remittance) => {
      const result = recognise(entry({ remittance_information: remittance }));

      expect(result).toMatchObject({ kind: 'ignore', why: 'not_a_bizum' });
      expect(result.kind === 'ignore' && result.key?.reference).toBe('r1');
    });

    it.each([
      ['no reference', { entry_reference: undefined }],
      ['a blank reference', { entry_reference: '  ' }],
      ['no booking date', { booking_date: undefined }],
      ['an impossible booking date', { booking_date: '2026-02-30' }],
      ['no amount', { transaction_amount: undefined }],
      ['no currency', { transaction_amount: { amount: '4.00' } }],
      [
        'an amount of zero',
        { transaction_amount: { amount: '0.00', currency: 'EUR' } },
      ],
    ])('4: ignores %s as unidentified, with no key', (_name, over) => {
      expect(recognise(entry(over))).toEqual({
        kind: 'ignore',
        why: 'unidentified',
        key: null,
      });
    });

    it('5: recognises the rest as a Bizum', () => {
      const result = recognise(entry());

      expect(result.kind).toBe('bizum');
      if (result.kind !== 'bizum') return;
      expect(result.bizum.key.account).toBe('h1');
      expect(result.bizum.key.reference).toBe('r1');
      expect(result.bizum.direction).toBe('incoming');
      expect(result.bizum.bookedOn).toBe('2026-01-15');
      expect(result.bizum.amountCents).toBe(400);
      expect(result.bizum.currency).toBe('EUR');
      expect(result.bizum.sender).toEqual({ name: 'Marta G.L.', phone: null });
      expect(result.bizum.receiver).toEqual({ name: null, phone: null });
      expect(result.bizum.subject).toBe('pachanga');
    });
  });

  describe('amounts', () => {
    const cents = (amount: string) => {
      const result = recognise(
        entry({ transaction_amount: { amount, currency: 'EUR' } })
      );
      return result.kind === 'bizum' ? result.bizum.amountCents : result.why;
    };

    it.each([
      ['4.00', 400],
      ['12.00', 1200],
      ['4.50', 450],
      ['12', 1200],
      ['0.5', 50],
      ['0.05', 5],
      ['1234.56', 123456],
    ])('reads %s as %i cents', (amount, expected) => {
      expect(cents(amount)).toBe(expected);
    });

    it.each(['4.505', '-4.00', '4,00', '', ' 4.00', '4.', '.5', '1e2'])(
      'does not identify %j',
      amount => {
        expect(cents(amount)).toBe('unidentified');
      }
    );

    it('does not identify an amount beyond what an integer holds exactly', () => {
      expect(cents('99999999999999999999.00')).toBe('unidentified');
    });
  });

  describe('the sender', () => {
    const senderOf = (text: string) => {
      const result = recognise(
        entry({
          remittance_information: ['', `Bizum payment from: ${text}`],
        })
      );
      return result.kind === 'bizum' ? result.bizum.sender : null;
    };

    it('takes an abbreviated name as a name', () => {
      expect(senderOf('Álvaro B.X.')).toEqual({
        name: 'Álvaro B.X.',
        phone: null,
      });
    });

    it('takes a phone number as a phone, without its spaces', () => {
      expect(senderOf('+34 600 000 000')).toEqual({
        name: null,
        phone: '+34600000000',
      });
      expect(senderOf('+34600000000')).toEqual({
        name: null,
        phone: '+34600000000',
      });
    });

    it('takes a plus with too few digits as a name', () => {
      expect(senderOf('+34 12')).toEqual({ name: '+34 12', phone: null });
    });

    it('trims the sender', () => {
      expect(senderOf('  Marta G.L.  ')?.name).toBe('Marta G.L.');
    });

    it('has no sender at all when the text after the prefix is blank', () => {
      expect(senderOf('')).toEqual({ name: null, phone: null });
    });
  });

  it('keeps no subject when the message is blank', () => {
    const result = recognise(
      entry({
        remittance_information: ['  ', 'Bizum payment from: Marta G.L.'],
      })
    );

    expect(result.kind === 'bizum' && result.bizum.subject).toBeNull();
  });

  it('counts the whole of the shared fixture as the guide counts it', () => {
    const results = new FakeFixtures().entries().map(recognise);
    const count = (why: string) =>
      results.filter(r => r.kind === 'ignore' && r.why === why).length;

    expect(results).toHaveLength(130);
    expect(results.filter(r => r.kind === 'bizum')).toHaveLength(104);
    expect(count('not_a_bizum')).toBe(25);
    expect(count('pending')).toBe(1);
    expect(count('unidentified')).toBe(0);
  });

  describe('describing an account', () => {
    const session = {
      uid: 'uid-1',
      identification_hash: 'hash-eur-principal',
      details: { currency: 'EUR', cash_account_type: 'CACC' },
    };

    it('uses the last four characters of the IBAN of the session account', () => {
      expect(
        dialect.describeAccount({
          ...session,
          account_id: { iban: 'ES0000000000000000001111' },
        })
      ).toEqual({
        stableId: 'hash-eur-principal',
        sessionId: 'uid-1',
        currency: 'EUR',
        kind: 'CACC',
        last4: '1111',
      });
    });

    it('finds the IBAN among the details', () => {
      expect(
        dialect.describeAccount({
          ...session,
          details: { ...session.details, account_id: { iban: 'ES99 2222' } },
        }).last4
      ).toBe('2222');
    });

    it('falls back to the last four of the hash without an IBAN', () => {
      expect(dialect.describeAccount(session).last4).toBe('ipal');
    });

    it.each([
      ['hash', { uid: 'u', details: {} }],
      ['uid', { identification_hash: 'h', details: {} }],
    ])('cannot describe an account without its %s', (_name, raw) => {
      expect(() => dialect.describeAccount(raw)).toThrow();
    });
  });
});
