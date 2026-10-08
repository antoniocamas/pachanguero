import { describe, expect, it } from 'vitest';
import type { OutstandingShare } from '../api';
import {
  filterShares,
  gamesOwed,
  gameName,
  groupByDebtor,
  peopleOwing,
  whatsappText,
} from './debtReport';

let next = 1;
const share = (over: Partial<OutstandingShare>): OutstandingShare => ({
  id: next++,
  gameId: 1,
  playedOn: '2025-10-01',
  gameLabel: null,
  holderId: 1,
  holderName: 'Ana',
  beneficiaryId: 1,
  beneficiaryName: 'Ana',
  guestOrdinal: null,
  amountCents: 400,
  ...over,
});

const shares = [
  share({}),
  share({ gameId: 2, playedOn: '2025-10-08' }),
  share({
    gameId: 2,
    playedOn: '2025-10-08',
    holderId: 2,
    holderName: 'Bea',
    beneficiaryId: 2,
    beneficiaryName: 'Bea',
  }),
  share({
    gameId: 2,
    playedOn: '2025-10-08',
    beneficiaryId: null,
    beneficiaryName: null,
    guestOrdinal: 1,
  }),
];

describe('debt report', () => {
  it('filters by game, by person, by both, or by neither', () => {
    expect(filterShares(shares, { gameId: null, holderId: null })).toHaveLength(
      4
    );
    expect(filterShares(shares, { gameId: 1, holderId: null })).toHaveLength(1);
    expect(filterShares(shares, { gameId: null, holderId: 2 })).toHaveLength(1);
    expect(filterShares(shares, { gameId: 2, holderId: 1 })).toHaveLength(2);
  });

  it('groups by who answers for the shares, biggest debt first', () => {
    const debtors = groupByDebtor(shares);
    expect(debtors.map(d => [d.name, d.totalCents])).toEqual([
      ['Ana', 1200],
      ['Bea', 400],
    ]);
  });

  it('lists each game and each person once for the filters', () => {
    expect(gamesOwed(shares).map(g => g.gameId)).toEqual([1, 2]);
    expect(peopleOwing(shares).map(p => p.name)).toEqual(['Ana', 'Bea']);
  });

  it('writes each person with their games and a total of their own, and no grand total', () => {
    expect(whatsappText(shares)).toBe(
      [
        '*Deudas del fútbol* ⚽',
        '',
        '*Ana*',
        `• ${gameName(shares[0])}: 4 €`,
        `• ${gameName(shares[1])}: 4 €`,
        `• ${gameName(shares[3])} (+1): 4 €`,
        'Total: 12 €',
        '',
        '*Bea*',
        `• ${gameName(shares[2])}: 4 €`,
        'Total: 4 €',
      ].join('\n')
    );
  });
});
