import { describe, expect, it } from 'vitest';
import { DetailFixture } from './detailFixture';
import { buildRows } from './gameRows';
import { paymentCell } from './paymentCell';

const ANA = 1;
const MARTA = 2;
const DANI = 3;
const LUIS = 4;

/** Ana hosts Marta (a named guest); Dani has a plus-one; Luis is on his own. */
const game = () =>
  new DetailFixture()
    .state('played')
    .player(ANA, 'Ana', 1)
    .player(MARTA, 'Marta', 2)
    .player(DANI, 'Dani', 3)
    .player(LUIS, 'Luis', 4)
    .entry(ANA, 1)
    .entry(MARTA, 2)
    .entry(DANI, 3)
    .entry({ host: DANI, ordinal: 1 }, 4, { name: 'Invitado de Dani' })
    .entry(LUIS, 5);

const names = new Map([
  [ANA, 'Ana'],
  [MARTA, 'Marta'],
  [DANI, 'Dani'],
  [LUIS, 'Luis'],
]);

const cell = (fixture: DetailFixture, name: string) => {
  const detail = fixture.build();
  const row = buildRows(detail).rows.find(r => r.name === name)!;
  return paymentCell(row, detail.debts, detail.payments, names);
};

describe('paymentCell', () => {
  it('offers a player who owes their own share a button for it and another amount', () => {
    expect(cell(game().debt(LUIS, LUIS), 'Luis')).toEqual([
      {
        kind: 'pay',
        label: 'Pagar 4 €',
        shares: [{ playerId: LUIS }],
        payerId: LUIS,
      },
      { kind: 'adjust', share: { playerId: LUIS }, payerId: LUIS },
    ]);
  });

  it('shows nothing for a player with no share in the game', () => {
    expect(cell(game(), 'Luis')).toEqual([]);
  });

  it('gives a host one button that pays everything they hold', () => {
    const parts = cell(game().debt(ANA, ANA).debt(ANA, MARTA), 'Ana');

    expect(parts[0]).toEqual({
      kind: 'pay',
      label: 'Pagar 8 €',
      shares: [{ playerId: ANA }, { playerId: MARTA }],
      payerId: ANA,
    });
  });

  it('lets a host pay only their own share when they hold more', () => {
    const parts = cell(game().debt(ANA, ANA).debt(ANA, MARTA), 'Ana');

    expect(parts[1]).toMatchObject({
      kind: 'pay',
      label: 'Solo lo suyo 4 €',
      shares: [{ playerId: ANA }],
    });
  });

  it("tags a guest's row with the holder and lets the guest pay their own share", () => {
    const parts = cell(game().debt(ANA, ANA).debt(ANA, MARTA), 'Marta');

    expect(parts).toEqual([
      { kind: 'tag', label: 'Deuda de Ana' },
      {
        kind: 'pay',
        label: 'Pagar 4 €',
        shares: [{ playerId: MARTA }],
        payerId: MARTA,
      },
      { kind: 'adjust', share: { playerId: MARTA }, payerId: MARTA },
    ]);
  });

  it('lowers the host button once the guest paid their own share', () => {
    const parts = cell(game().debt(ANA, ANA).payment(ANA, MARTA, MARTA), 'Ana');

    expect(parts[0]).toMatchObject({ kind: 'pay', label: 'Pagar 4 €' });
    expect(parts.some(p => p.kind === 'adjust')).toBe(true);
  });

  it('says who paid a share when it was not the beneficiary', () => {
    const parts = cell(game().payment(ANA, MARTA, ANA), 'Marta');

    expect(parts).toEqual([
      {
        kind: 'paid',
        label: 'Pagado 4 € por Ana',
        paymentId: expect.any(Number),
      },
    ]);
  });

  it('says only the amount when the beneficiary paid it themself', () => {
    const parts = cell(game().payment(LUIS, LUIS, LUIS, 375), 'Luis');

    expect(parts).toEqual([
      { kind: 'paid', label: 'Pagado 3,75 €', paymentId: expect.any(Number) },
    ]);
  });

  it("gives a plus-one's share its own button, paid by the host", () => {
    const parts = cell(
      game().debt(DANI, DANI).debt(DANI, null),
      'Invitado de Dani'
    );

    expect(parts[0]).toEqual({
      kind: 'pay',
      label: 'Pagar 4 €',
      shares: [{ hostPlayerId: DANI, ordinal: 1 }],
      payerId: DANI,
    });
  });

  it("shows a plus-one's settled share with undo", () => {
    const parts = cell(game().payment(DANI, null, DANI), 'Invitado de Dani');

    expect(parts).toEqual([
      { kind: 'paid', label: 'Pagado 4 €', paymentId: expect.any(Number) },
    ]);
  });

  it('shows a settled own share and the shares still held together', () => {
    const parts = cell(
      game().payment(DANI, DANI, DANI).debt(DANI, null),
      'Dani'
    );

    expect(parts.map(p => p.kind)).toEqual(['paid', 'pay']);
    expect(parts[1]).toMatchObject({ label: 'Pagar 4 €' });
  });
});
