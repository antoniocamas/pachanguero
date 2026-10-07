import { describe, expect, it } from 'vitest';
import { BillingPlanner } from './billing-planner.js';
import { DebtLedger } from './debt-ledger.js';
import { ShareKey } from './share-key.js';

describe('ShareKey', () => {
  it('names a player and a guest of a host differently', () => {
    expect(new ShareKey({ playerId: 3 }).toString()).toBe('p:3');
    expect(new ShareKey({ hostPlayerId: 3, ordinal: 2 }).toString()).toBe(
      'g:3:2'
    );
  });
});

describe('DebtLedger', () => {
  const ana = 1;
  const marta = 2;

  it('counts a share held by someone else once in the outstanding total', () => {
    const ledger = new DebtLedger([
      { member: { playerId: ana }, holderId: ana, amountCents: 400 },
      { member: { playerId: marta }, holderId: ana, amountCents: 400 },
    ]);

    expect(ledger.outstandingCents()).toBe(800);
    expect(ledger.holdsCents(ana)).toBe(800);
    expect(ledger.holdsCents(marta)).toBe(0);
    expect(ledger.count()).toBe(2);
  });

  it('adds the anonymous plus-one of a host to that host debt', () => {
    const ledger = new DebtLedger([
      { member: { playerId: ana }, holderId: ana, amountCents: 400 },
      {
        member: { hostPlayerId: ana, ordinal: 1 },
        holderId: ana,
        amountCents: 400,
      },
    ]);

    expect(ledger.byHolder()).toEqual(new Map([[ana, 800]]));
  });

  it('lowers the host debt when the guest own share leaves the ledger', () => {
    const ledger = new DebtLedger([
      { member: { playerId: ana }, holderId: ana, amountCents: 400 },
    ]);

    expect(ledger.holdsCents(ana)).toBe(400);
    expect(ledger.outstandingCents()).toBe(400);
  });

  it('keeps integer cents for an odd amount', () => {
    const ledger = new DebtLedger([
      { member: { playerId: ana }, holderId: ana, amountCents: 375 },
      { member: { playerId: marta }, holderId: marta, amountCents: 400 },
    ]);

    expect(ledger.outstandingCents()).toBe(775);
  });
});

describe('BillingPlanner', () => {
  const shares = [
    { member: { playerId: 1 }, holderId: 1 },
    { member: { playerId: 2 }, holderId: 1 },
    { member: { hostPlayerId: 1, ordinal: 1 }, holderId: 1 },
  ];

  it('bills every share when none is billed', () => {
    expect(new BillingPlanner().unbilled(shares, new Set())).toEqual(shares);
  });

  it('skips shares that already have a debt or a payment', () => {
    expect(
      new BillingPlanner().unbilled(shares, new Set(['p:1', 'g:1:1']))
    ).toEqual([shares[1]]);
  });
});
