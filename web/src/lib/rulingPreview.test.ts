import { describe, expect, it } from 'vitest';
import type { OpenShare } from '../api';
import { maxShares, rulingPreview, sharesLabel } from './rulingPreview';

const share = (
  debtId: number,
  playedOn: string,
  amountCents = 400
): OpenShare => ({
  debtId,
  gameId: debtId,
  playedOn,
  member: { playerId: 1 },
  holderId: 1,
  amountCents,
});

/** Luis's two open shares, the nearest game first. */
const open = [share(1, '2026-10-07'), share(2, '2026-09-30')];

describe('maxShares', () => {
  it.each([
    [450, 1],
    [600, 1],
    [850, 2],
    [800, 2],
    [399, 0],
    [4000, 2],
  ])(
    'lets a Bizum of %i cents pay at most %i of two shares of 400',
    (amount, most) => {
      expect(maxShares(open, amount)).toBe(most);
    }
  );

  it('is none when nothing is owed', () => {
    expect(maxShares([], 800)).toBe(0);
  });
});

describe('rulingPreview', () => {
  it('settles the nearest debt and leaves the change on the Bizum (4,50 € for one share)', () => {
    const preview = rulingPreview(open, 450, 1);
    expect(preview.paid.map(p => p.debtId)).toEqual([1]);
    expect(preview.restCents).toBe(50);
    expect(preview.text).toBe(
      'Se liquidará la deuda del 7 oct. Quedarán 0,5 € sin asignar en el Bizum. Solo se pagan deudas de la misma temporada que el Bizum.'
    );
  });

  it('settles two debts and says both days', () => {
    const preview = rulingPreview(open, 850, 2);
    expect(preview.paid.map(p => p.debtId)).toEqual([1, 2]);
    expect(preview.restCents).toBe(50);
    expect(preview.text).toContain(
      'Se liquidarán las deudas del 7 oct y del 30 sept.'
    );
  });

  it('says nothing is left over when the shares take all the money', () => {
    expect(rulingPreview(open, 800, 2).text).not.toContain('sin asignar');
  });

  it('says there is nothing to pay without debts', () => {
    expect(rulingPreview([], 800, 1)).toEqual({
      paid: [],
      restCents: 800,
      text: 'No hay deudas que pagar.',
    });
  });
});

describe('sharesLabel', () => {
  it('says how many shares and what they come to', () => {
    expect(sharesLabel(open, 1)).toBe('1 cuota (4 €)');
    expect(sharesLabel(open, 2)).toBe('2 cuotas (8 €)');
  });
});
