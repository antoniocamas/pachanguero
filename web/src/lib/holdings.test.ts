import { describe, expect, it } from 'vitest';
import type { Debt } from '../api';
import { debtOf, heldBy, holdsCents, outstandingCents } from './holdings';

const debt = (
  id: number,
  holder: number,
  beneficiary: number | null,
  ordinal: number | null = null,
  cents = 400
): Debt => ({
  id,
  game_id: 1,
  holder_player_id: holder,
  beneficiary_player_id: beneficiary,
  guest_ordinal: ordinal,
  amount_cents: cents,
});

const ANA = 1;
const MARTA = 2;
const DANI = 3;

describe('holdings', () => {
  // Ana holds her own share and Marta's; Dani holds his own and a plus-one's.
  const debts = [
    debt(1, ANA, ANA),
    debt(2, ANA, MARTA),
    debt(3, DANI, DANI),
    debt(4, DANI, null, 1),
  ];

  it('a host holds the shares of their guests as well as their own', () => {
    expect(holdsCents(debts, ANA)).toBe(800);
    expect(holdsCents(debts, DANI)).toBe(800);
  });

  it('a guest whose share is held by the host holds nothing', () => {
    expect(holdsCents(debts, MARTA)).toBe(0);
    expect(heldBy(debts, MARTA)).toEqual([]);
  });

  it('counts each share once in the outstanding total', () => {
    expect(outstandingCents(debts)).toBe(1600);
    expect(outstandingCents([debt(1, ANA, ANA), debt(2, ANA, MARTA)])).toBe(
      800
    );
  });

  it('counts a repeated share row once', () => {
    expect(outstandingCents([debt(1, ANA, MARTA), debt(2, ANA, MARTA)])).toBe(
      400
    );
  });

  it('drops a share from the host holding once the guest has paid it', () => {
    const afterMartaPays = debts.filter(d => d.id !== 2);

    expect(holdsCents(afterMartaPays, ANA)).toBe(400);
    expect(outstandingCents(afterMartaPays)).toBe(1200);
  });

  it('finds the debt of a player share and of a plus-one share', () => {
    expect(debtOf(debts, { playerId: MARTA })?.id).toBe(2);
    expect(debtOf(debts, { hostPlayerId: DANI, ordinal: 1 })?.id).toBe(4);
    expect(debtOf(debts, { hostPlayerId: DANI, ordinal: 2 })).toBeUndefined();
  });

  it('sums odd amounts in integer cents', () => {
    expect(outstandingCents([debt(1, ANA, ANA, null, 375)])).toBe(375);
  });
});
