import { describe, expect, it } from 'vitest';
import type { OutstandingShare } from '../api';
import { debtsOfGame, namesOf, rowOf } from './debtRows';
import { paymentCell } from './paymentCell';

const share = (over: Partial<OutstandingShare>): OutstandingShare => ({
  id: 1,
  gameId: 7,
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

describe('payment controls on the debts screen', () => {
  const own = share({});
  const plusOne = share({
    id: 2,
    beneficiaryId: null,
    beneficiaryName: null,
    guestOrdinal: 1,
  });
  const shares = [own, plusOne, share({ id: 3, gameId: 8 })];

  it('offers the holder what the game screen offers on their row', () => {
    const parts = paymentCell(
      rowOf(own),
      debtsOfGame(shares, 7),
      [],
      namesOf(shares)
    );
    expect(parts.map(p => ('label' in p ? p.label : p.kind))).toEqual([
      'Pagar 8 €',
      'Solo lo suyo 4 €',
    ]);
  });

  it('settles a plus-one on its own line, paid by its host', () => {
    const parts = paymentCell(
      rowOf(plusOne),
      debtsOfGame(shares, 7),
      [],
      namesOf(shares)
    );
    expect(parts.map(p => ('label' in p ? p.label : p.kind))).toEqual([
      'Pagar 4 €',
      'adjust',
    ]);
    expect(parts[0]).toMatchObject({ payerId: 1 });
  });
});
