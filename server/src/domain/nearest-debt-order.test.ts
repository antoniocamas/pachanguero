import { describe, expect, it } from 'vitest';
import type { OpenShare } from './bizum-rules.js';
import { NearestDebtOrder } from './nearest-debt-order.js';

describe('NearestDebtOrder', () => {
  const marta = 5;
  const share = (
    debtId: number,
    gameId: number,
    playedOn: string,
    member: OpenShare['member'] = { playerId: marta }
  ): OpenShare => ({
    debtId,
    gameId,
    playedOn,
    member,
    holderId: marta,
    amountCents: 400,
  });
  const order = new NearestDebtOrder();
  const ids = (shares: OpenShare[]) => shares.map(s => s.debtId);

  it('puts the most recent game first', () => {
    const shares = [share(1, 1, '2026-09-30'), share(2, 2, '2026-10-07')];
    expect(ids(order.order(shares, marta, '2026-10-12'))).toEqual([2, 1]);
  });

  it('leaves out a game played after the booking date', () => {
    const shares = [share(1, 1, '2026-09-30'), share(2, 2, '2026-10-07')];
    expect(ids(order.order(shares, marta, '2026-10-06'))).toEqual([1]);
  });

  it('keeps a game played on the booking date', () => {
    expect(
      ids(order.order([share(1, 1, '2026-10-12')], marta, '2026-10-12'))
    ).toEqual([1]);
  });

  it('puts the player own share before the plus-ones of the same game', () => {
    const shares = [
      share(10, 2, '2026-10-07', { hostPlayerId: marta, ordinal: 2 }),
      share(11, 2, '2026-10-07', { hostPlayerId: marta, ordinal: 1 }),
      share(12, 2, '2026-10-07'),
    ];
    expect(ids(order.order(shares, marta, '2026-10-12'))).toEqual([12, 11, 10]);
  });

  it('breaks a remaining tie by debt', () => {
    const shares = [
      share(9, 2, '2026-10-07', { playerId: 8 }),
      share(4, 2, '2026-10-07', { playerId: 7 }),
    ];
    expect(ids(order.order(shares, marta, '2026-10-12'))).toEqual([4, 9]);
  });

  it('breaks a tie between two games on one day by the later game', () => {
    const shares = [share(1, 3, '2026-10-07'), share(2, 4, '2026-10-07')];
    expect(ids(order.order(shares, marta, '2026-10-12'))).toEqual([2, 1]);
  });

  it('does not change the list it was given', () => {
    const shares = [share(1, 1, '2026-09-30'), share(2, 2, '2026-10-07')];
    order.order(shares, marta, '2026-10-12');
    expect(ids(shares)).toEqual([1, 2]);
  });
});
