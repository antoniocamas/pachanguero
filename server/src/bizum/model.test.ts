import { describe, expect, it } from 'vitest';
import { Bizum, BizumKey, type BizumFields } from './model.js';

describe('BizumKey', () => {
  it.each([
    ['', 'e1', 'key.account'],
    ['  ', 'e1', 'key.account'],
    ['h1', '', 'key.reference'],
    ['h1', ' ', 'key.reference'],
  ])('refuses %j / %j', (account, reference, field) => {
    expect(() => new BizumKey(account, reference)).toThrow(field);
  });

  it('is the same as another with the same account and reference only', () => {
    const key = new BizumKey('h1', 'e1');
    expect(key.sameAs(new BizumKey('h1', 'e1'))).toBe(true);
    expect(key.sameAs(new BizumKey('h1', 'e2'))).toBe(false);
    expect(key.sameAs(new BizumKey('h2', 'e1'))).toBe(false);
  });
});

describe('Bizum', () => {
  const fields = (over: Partial<BizumFields> = {}): BizumFields => ({
    key: new BizumKey('h1', 'e1'),
    direction: 'incoming',
    bookedOn: '2026-10-12',
    amountCents: 400,
    currency: 'EUR',
    sender: { name: 'Marta G.L.', phone: null },
    receiver: { name: null, phone: null },
    subject: 'pachanga',
    ...over,
  });

  it('is valid with a sender name, no receiver and a subject', () => {
    const bizum = new Bizum(fields());
    expect(bizum.counterparty().name).toBe('Marta G.L.');
    expect(bizum.subject).toBe('pachanga');
  });

  it('is valid with no subject and no named party', () => {
    const bizum = new Bizum(
      fields({ subject: null, sender: { name: null, phone: null } })
    );
    expect(bizum.subject).toBeNull();
    expect(bizum.counterparty()).toEqual({ name: null, phone: null });
  });

  it.each([
    ['amountCents', { amountCents: 4.5 }],
    ['amountCents', { amountCents: 0 }],
    ['amountCents', { amountCents: -400 }],
    ['bookedOn', { bookedOn: '2026-02-30' }],
    ['bookedOn', { bookedOn: '12/10/2026' }],
    ['bookedOn', { bookedOn: '' }],
    ['currency', { currency: 'eur' }],
    ['currency', { currency: 'EURO' }],
    ['direction', { direction: 'sideways' as never }],
  ])('refuses a broken %s: %j', (field, over) => {
    expect(() => new Bizum(fields(over))).toThrow(field);
  });

  it('accepts a leap day', () => {
    expect(() => new Bizum(fields({ bookedOn: '2028-02-29' }))).not.toThrow();
  });

  it('stores blank text as null', () => {
    const bizum = new Bizum(
      fields({
        subject: '  ',
        sender: { name: ' ', phone: '' },
        receiver: { name: '', phone: '   ' },
      })
    );
    expect(bizum.subject).toBeNull();
    expect(bizum.sender).toEqual({ name: null, phone: null });
    expect(bizum.receiver).toEqual({ name: null, phone: null });
  });

  it('names the receiver as counterparty of an outgoing Bizum', () => {
    const bizum = new Bizum(
      fields({
        direction: 'outgoing',
        receiver: { name: 'Luis P.', phone: '+34611111111' },
      })
    );
    expect(bizum.counterparty()).toEqual({
      name: 'Luis P.',
      phone: '+34611111111',
    });
  });
});
