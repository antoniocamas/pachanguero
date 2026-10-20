import { beforeEach, describe, expect, it } from 'vitest';
import { GameFlow } from './game-flow-test-support.js';

describe('ShareSettler', () => {
  let flow: GameFlow;
  let gameId: number;
  let ana: number;

  const participation = () =>
    flow.participations.list(gameId).find(p => p.player_id === ana)!;

  beforeEach(() => {
    flow = new GameFlow();
    gameId = flow.games.create(flow.seasonId, '2026-10-07').id;
    ana = flow.players.add(flow.seasonId, 'Ana', 1).id;
    flow.participations.set(gameId, ana, { signed_up: true });
    flow.played(gameId);
  });

  it("leaves the debt untouched when the caller's transaction throws", () => {
    expect(() =>
      flow.conn.transaction(() => {
        flow.settler.settle(
          gameId,
          { playerId: ana },
          { payerPlayerId: ana, paidOn: '2026-10-07', method: 'efectivo' }
        );
        throw new Error('rollback');
      })()
    ).toThrow('rollback');

    expect(flow.debts.list(gameId)).toHaveLength(1);
    expect(flow.payments.keysOf(gameId)).toHaveLength(0);
    expect(participation()).toMatchObject({ paid_cents: 0, paid_on: null });
  });

  it('restores the debt, the payment and the participation on unsettle', () => {
    const debtsBefore = flow.debts.list(gameId);
    const before = participation();

    const payment = flow.conn.transaction(() =>
      flow.settler.settle(
        gameId,
        { playerId: ana },
        { payerPlayerId: ana, paidOn: '2026-10-07', method: 'efectivo' }
      )
    )();
    expect(participation().paid_cents).toBeGreaterThan(0);

    flow.conn.transaction(() => flow.settler.unsettle(payment))();

    expect(flow.debts.list(gameId).map(d => d.amount_cents)).toEqual(
      debtsBefore.map(d => d.amount_cents)
    );
    expect(flow.payments.keysOf(gameId)).toHaveLength(0);
    expect(participation()).toMatchObject({
      paid_cents: before.paid_cents,
      paid_on: before.paid_on,
    });
  });
});
