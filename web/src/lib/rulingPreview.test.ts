import { describe, expect, it } from 'vitest';
import type { RulableShare } from '../api';
import {
  defaultShares,
  maxShares,
  rulingPreview,
  shareRows,
  sharesAfterToggle,
} from './rulingPreview';

const share = (
  debtId: number,
  playedOn: string,
  amountCents = 400,
  afterBooking = false,
  previousSeason = false
): RulableShare => ({
  debtId,
  gameId: debtId,
  playedOn,
  member: { playerId: 1 },
  holderId: 1,
  amountCents,
  afterBooking,
  previousSeason,
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
    expect(preview.text).toBe('Se liquidará la deuda del 7 oct.');
  });

  it('settles two debts and says both days', () => {
    const preview = rulingPreview(open, 850, 2);
    expect(preview.paid.map(p => p.debtId)).toEqual([1, 2]);
    expect(preview.restCents).toBe(50);
    expect(preview.text).toContain(
      'Se liquidarán las deudas del 7 oct y del 30 sept.'
    );
  });

  it('says there is nothing to pay without debts', () => {
    expect(rulingPreview([], 800, 1)).toEqual({
      paid: [],
      restCents: 800,
      text: 'No hay deudas que pagar.',
    });
  });
});

describe('later games', () => {
  /** Adam's debts: one up to the booking, two after it, earliest first. */
  const mixed = [
    share(1, '2026-09-01'),
    share(2, '2026-09-07', 400, true),
    share(3, '2026-09-14', 400, true),
  ];
  const onlyLater = [
    share(2, '2026-09-28', 400, true),
    share(3, '2026-10-05', 400, true),
  ];

  it('marks each game paid that is after the Bizum', () => {
    expect(rulingPreview(mixed, 1200, 3).text).toContain(
      'Se liquidarán las deudas del 1 sept, del 7 sept (posterior al Bizum) y del 14 sept (posterior al Bizum).'
    );
    expect(rulingPreview(mixed, 1200, 1).text).not.toContain('posteriores');
  });

  it('marks a single later game', () => {
    expect(rulingPreview(mixed, 800, 2).text).toContain(
      'Se liquidarán las deudas del 1 sept y del 7 sept (posterior al Bizum).'
    );
  });

  it('says no share is paid yet when none is chosen', () => {
    expect(rulingPreview(onlyLater, 1200, 0)).toEqual({
      paid: [],
      restCents: 1200,
      text: 'Marca las cuotas que paga este Bizum; si no marcas ninguna, sigue en espera.',
    });
  });

  it('never starts from a later game: the organiser adds them', () => {
    expect(defaultShares(3, mixed, 1200)).toBe(1);
    expect(defaultShares(3, onlyLater, 1200)).toBe(0);
    expect(defaultShares(null, onlyLater, 1200)).toBe(0);
  });
});

describe('defaultShares', () => {
  it('starts from the shares the Bizum is, as far as the debts and the money go', () => {
    expect(defaultShares(3, open, 1200)).toBe(2);
    expect(defaultShares(1, open, 1200)).toBe(1);
  });

  it('starts from one when the Bizum is not a number of shares', () => {
    expect(defaultShares(null, open, 1200)).toBe(1);
  });

  it('is none when nothing is open', () => {
    expect(defaultShares(3, [], 1200)).toBe(0);
  });
});

describe('previous seasons', () => {
  const own = share(1, '2026-09-07');
  const old = share(2, '2026-05-13', 400, false, true);
  const both = [own, old];

  it('marks a game of a previous season', () => {
    expect(rulingPreview(both, 800, 2).text).toBe(
      'Se liquidarán las deudas del 7 sept y del 13 may (de una temporada anterior).'
    );
  });

  it('never starts from a game of a previous season', () => {
    expect(defaultShares(2, both, 800)).toBe(1);
    expect(defaultShares(2, [old], 800)).toBe(0);
  });

  it('can be paid only with the money the own season leaves', () => {
    expect(maxShares(both, 400)).toBe(1);
    expect(maxShares(both, 800)).toBe(2);
  });
});

describe('shareRows', () => {
  const later = [
    share(2, '2026-09-28', 400, true),
    share(3, '2026-10-05', 400, true),
  ];

  it('lists every debt with its game, ticked up to the chosen count', () => {
    expect(shareRows(later, 1200, 1)).toEqual([
      {
        share: later[0],
        text: '28 sept · 4 € · posterior al Bizum',
        checked: true,
        payable: true,
      },
      {
        share: later[1],
        text: '5 oct · 4 € · posterior al Bizum',
        checked: false,
        payable: true,
      },
    ]);
  });

  it('says where a game is after the Bizum or from a previous season', () => {
    const rows = shareRows(
      [
        share(1, '2026-09-07'),
        later[0],
        share(4, '2026-05-13', 400, false, true),
      ],
      2000,
      0
    );
    expect(rows.map(r => r.text)).toEqual([
      '7 sept · 4 €',
      '28 sept · 4 € · posterior al Bizum',
      '13 may · 4 € · de una temporada anterior',
    ]);
  });

  it('cannot pay what the Bizum does not cover', () => {
    expect(shareRows(later, 400, 0).map(r => r.payable)).toEqual([true, false]);
  });
});

describe('sharesAfterToggle', () => {
  it('ticking a debt ticks the ones before it, since a Bizum pays in order', () => {
    expect(sharesAfterToggle(0, 2, true)).toBe(3);
  });

  it('unticking a debt unticks the ones after it', () => {
    expect(sharesAfterToggle(3, 1, false)).toBe(1);
  });
});
