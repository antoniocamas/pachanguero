import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentMethods } from '../domain/payment-method.js';
import { GameFlow } from './game-flow-test-support.js';

/**
 * The requirements of how a payment records its method, as Given/When/Then, run through the
 * real services and a real database.
 */
describe('payment method requirements', () => {
  let flow: GameFlow;
  let gameId: number;
  let marta: number;

  const enrol = (name: string) => {
    const id = flow.players.add(flow.seasonId, name, 1).id;
    flow.participations.set(gameId, id, { signed_up: true });
    return id;
  };

  beforeEach(() => {
    flow = new GameFlow();
    gameId = flow.games.create(flow.seasonId, '2026-10-07').id;
    marta = enrol('Marta');
    flow.played(gameId);
  });

  describe('UC-006-08-S1 — A manual payment records its method', () => {
    it.each([
      { share: 400, method: 'efectivo' },
      { share: 500, method: 'otro' },
    ] as const)(
      'a share of $share paid as $method is recorded with it',
      ({ share, method }) => {
        flow.seasons.update(flow.seasonId, { price_cents: share * 14 });
        const game = flow.games.create(flow.seasonId, '2026-10-14').id;
        flow.participations.set(game, marta, { signed_up: true });
        flow.played(game);

        const [payment] = flow.paymentService.pay(game, {
          method,
          shares: [{ playerId: marta }],
          payerPlayerId: marta,
        });

        expect(payment).toMatchObject({
          method,
          amount_cents: share,
          payer_player_id: marta,
        });
        expect(flow.debts.list(game)).toEqual([]);
        expect(
          flow.conn
            .prepare('SELECT * FROM payments WHERE id = ?')
            .get(payment.id)
        ).toMatchObject({ bizum_id: null });
      }
    );
  });

  describe('UC-006-08-S2 — The rules of payment do not change', () => {
    it('keeps refusing a payment of two shares with a custom amount, with today’s message', () => {
      const dani = enrol('Dani');
      expect(() =>
        flow.paymentService.pay(gameId, {
          method: 'efectivo',
          shares: [{ playerId: marta }, { playerId: dani }],
          payerPlayerId: marta,
          amountCents: 300,
        })
      ).toThrow('Solo se puede ajustar el importe de una parte');
      expect(flow.payments.list(gameId)).toEqual([]);
    });
  });

  describe('UC-006-08-S3 — Undoing a manual payment', () => {
    it('returns the debt as today and keeps nothing of the method', () => {
      const [payment] = flow.paymentService.pay(gameId, {
        method: 'efectivo',
        shares: [{ playerId: marta }],
        payerPlayerId: marta,
      });

      flow.paymentService.undo(gameId, payment.id);

      expect(flow.payments.list(gameId)).toEqual([]);
      expect(flow.debts.list(gameId)).toHaveLength(1);
    });
  });

  describe('UC-006-08-S5 — Payments from before this feature carry a method', () => {
    it('reads "otro" for a payment inserted without one', () => {
      flow.conn.exec(`
        INSERT INTO payments (game_id, holder_player_id, beneficiary_player_id, payer_player_id, amount_cents, paid_on)
        VALUES (${gameId}, ${marta}, ${marta}, ${marta}, 400, '2026-10-07')`);

      expect(flow.payments.list(gameId)[0].method).toBe('otro');
    });
  });

  describe('UC-006-07-S1 — The method shows on every payment', () => {
    it.each(['efectivo', 'otro', 'bizum'] as const)(
      'a payment recorded by hand as %s is listed with it',
      method => {
        flow.paymentService.pay(gameId, {
          method,
          shares: [{ playerId: marta }],
          payerPlayerId: marta,
        });

        expect(flow.payments.list(gameId)[0].method).toBe(method);
      }
    );

    it('only the three methods exist', () => {
      const methods = new PaymentMethods();
      expect(() => methods.parse('cash')).toThrow();
    });
  });

  describe('UC-006-07-S5 — The method cannot be edited', () => {
    it('no operation of the payment repository or service changes a recorded method', () => {
      const names = (target: object) =>
        Object.getOwnPropertyNames(Object.getPrototypeOf(target));
      const writers = [
        ...names(flow.payments),
        ...names(flow.paymentService),
      ].filter(name => /^(update|set|change|edit)/i.test(name));

      expect(writers).toEqual([]);
    });
  });
});
