import { beforeEach, describe, expect, it } from 'vitest';
import { GameFlow } from './game-flow-test-support.js';

describe('PaymentService', () => {
  let flow: GameFlow;
  let gameId: number;
  let ana: number;
  let marta: number;
  let dani: number;

  const enrol = (name: string) => {
    const id = flow.players.add(flow.seasonId, name, 1).id;
    flow.participations.set(gameId, id, { signed_up: true });
    return id;
  };
  const participation = (playerId: number) =>
    flow.participations.list(gameId).find(p => p.player_id === playerId)!;
  const owed = () => flow.debts.list(gameId);
  const outstanding = () => owed().reduce((sum, d) => sum + d.amount_cents, 0);
  /** A share is in the debts or in the payments, never both. */
  const expectNoShareInBoth = () => {
    const paid = new Set(flow.payments.keysOf(gameId));
    for (const key of flow.debts.keysOf(gameId))
      expect(paid.has(key)).toBe(false);
  };

  beforeEach(() => {
    flow = new GameFlow();
    gameId = flow.games.create(flow.seasonId, '2026-10-07').id;
    ana = enrol('Ana');
    marta = enrol('Marta');
    dani = enrol('Dani');
  });

  describe('a played game with Ana owing a share', () => {
    beforeEach(() => flow.played(gameId));

    it('records the share paid on the given date and counts a paid game', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: ana }],
        payerPlayerId: ana,
        paidOn: '2026-10-07',
      });

      expect(participation(ana)).toMatchObject({
        paid_cents: 400,
        paid_on: '2026-10-07',
      });
      expect(
        flow.standings.standings(flow.seasonId).find(s => s.playerId === ana)
      ).toMatchObject({ paidGames: 1, debtCents: 0 });
      expectNoShareInBoth();
    });

    it("stamps today's local date when none is given", () => {
      flow.paymentService.pay(
        gameId,
        { shares: [{ playerId: ana }], payerPlayerId: ana },
        new Date(2026, 9, 7, 23, 30)
      );

      expect(participation(ana).paid_on).toBe('2026-10-07');
    });

    it('shows who still owes and how much is outstanding', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: ana }],
        payerPlayerId: ana,
      });

      expect(
        owed()
          .map(d => d.beneficiary_player_id)
          .sort()
      ).toEqual([marta, dani].sort());
      expect(outstanding()).toBe(800);
    });

    it('settles an odd amount as an adjustment with no balance left', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: ana }],
        payerPlayerId: ana,
        amountCents: 375,
      });

      expect(participation(ana).paid_cents).toBe(375);
      expect(owed().some(d => d.beneficiary_player_id === ana)).toBe(false);
    });

    it('refuses an amount for more than one share', () => {
      expect(() =>
        flow.paymentService.pay(gameId, {
          shares: [{ playerId: ana }, { playerId: marta }],
          payerPlayerId: ana,
          amountCents: 375,
        })
      ).toThrow('Solo se puede ajustar el importe de una parte');
    });

    it('puts the debt back and clears the payment date on undo', () => {
      const [payment] = flow.paymentService.pay(gameId, {
        shares: [{ playerId: ana }],
        payerPlayerId: ana,
        paidOn: '2026-10-07',
      });

      flow.paymentService.undo(gameId, payment.id);

      expect(participation(ana)).toMatchObject({
        paid_cents: 0,
        paid_on: null,
      });
      expect(owed().find(d => d.beneficiary_player_id === ana)).toMatchObject({
        holder_player_id: ana,
        amount_cents: 400,
      });
      expect(flow.payments.list(gameId)).toEqual([]);
      expectNoShareInBoth();
    });

    it('refuses to pay a share twice', () => {
      const request = { shares: [{ playerId: ana }], payerPlayerId: ana };
      flow.paymentService.pay(gameId, request);

      expect(() => flow.paymentService.pay(gameId, request)).toThrow(
        'Ana ya está pagado'
      );
    });

    it('refuses a payer who neither holds nor benefits from the share', () => {
      expect(() =>
        flow.paymentService.pay(gameId, {
          shares: [{ playerId: ana }],
          payerPlayerId: marta,
        })
      ).toThrow('Solo puede pagar quien lo debe o a quien corresponde');
      expect(participation(ana).paid_cents).toBe(0);
    });

    it('refuses someone signed up but not in the convocatoria', () => {
      const outsider = flow.players.add(flow.seasonId, 'Luis', 1).id;
      flow.participations.set(gameId, outsider, { signed_up: true });

      expect(() =>
        flow.paymentService.pay(gameId, {
          shares: [{ playerId: outsider }],
          payerPlayerId: outsider,
        })
      ).toThrow('Luis no estaba en la convocatoria');
    });

    it('leaves the first share unpaid when the second cannot be settled', () => {
      expect(() =>
        flow.paymentService.pay(gameId, {
          shares: [{ playerId: ana }, { playerId: 9999 }],
          payerPlayerId: ana,
        })
      ).toThrow();

      expect(owed().some(d => d.beneficiary_player_id === ana)).toBe(true);
      expect(flow.payments.list(gameId)).toEqual([]);
      expect(participation(ana).paid_cents).toBe(0);
    });
  });

  describe('refusals by state', () => {
    it('refuses payment before the game is played', () => {
      flow.confirmed(gameId);

      expect(() =>
        flow.paymentService.pay(gameId, {
          shares: [{ playerId: ana }],
          payerPlayerId: ana,
        })
      ).toThrow('Marca el partido como jugado antes de registrar pagos');
      expect(participation(ana).paid_cents).toBe(0);
    });

    it('refuses payment for a cancelled game', () => {
      flow.confirmed(gameId);
      flow.lifecycle.perform(gameId, 'cancel');

      expect(() =>
        flow.paymentService.pay(gameId, {
          shares: [{ playerId: ana }],
          payerPlayerId: ana,
        })
      ).toThrow('El partido está cancelado');
    });
  });

  describe('a named guest whose share is held by the host', () => {
    beforeEach(() => {
      flow.guests.replaceAll(gameId, [
        { position: 4, player_id: marta, host_player_id: ana },
      ]);
      flow.played(gameId);
    });

    it('counts the guest share once, on the host', () => {
      expect(outstanding()).toBe(1200);
      expect(flow.debts.totalsByHolder(flow.seasonId).get(ana)).toBe(800);
      expect(
        flow.debts.totalsByHolder(flow.seasonId).get(marta)
      ).toBeUndefined();
    });

    it('lowers the host debt when the guest pays their own share', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: marta }],
        payerPlayerId: marta,
      });

      expect(flow.debts.totalsByHolder(flow.seasonId).get(ana)).toBe(400);
      expect(outstanding()).toBe(800);
      expect(participation(marta).paid_cents).toBe(400);
    });

    it('lets the host pay the guest share, and the point follows the guest', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: marta }],
        payerPlayerId: ana,
      });

      expect(participation(marta).paid_cents).toBe(400);
      expect(participation(ana).paid_cents).toBe(0);
      expect(flow.payments.list(gameId)[0]).toMatchObject({
        payer_player_id: ana,
        holder_player_id: ana,
      });
    });

    it('settles everything the host holds in one go', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: ana }, { playerId: marta }],
        payerPlayerId: ana,
      });

      expect(flow.debts.totalsByHolder(flow.seasonId).get(ana)).toBeUndefined();
      expect(flow.payments.list(gameId).map(p => p.payer_player_id)).toEqual([
        ana,
        ana,
      ]);
    });

    it('bills a share once however often the game is played', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: ana }, { playerId: marta }],
        payerPlayerId: ana,
      });

      flow.reopen(gameId);
      flow.play(gameId);

      expect(flow.payments.list(gameId)).toHaveLength(2);
      expect(owed().map(d => d.beneficiary_player_id)).toEqual([dani]);
      expect(participation(marta).paid_cents).toBe(400);
    });

    it('drops the unpaid share of a guest swapped out before playing again', () => {
      flow.reopen(gameId);
      flow.edits.move(gameId, { playerId: marta }, false);
      flow.play(gameId);

      expect(owed().some(d => d.beneficiary_player_id === marta)).toBe(false);
    });

    it('keeps debts and payments when the game is reopened or cancelled', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: marta }],
        payerPlayerId: marta,
      });

      flow.reopen(gameId);

      expect(flow.payments.list(gameId)).toHaveLength(1);
      expect(owed()).toHaveLength(2);
      expect(
        flow.standings.standings(flow.seasonId).every(s => s.debtCents === 0)
      ).toBe(true);
    });
  });

  describe('an anonymous plus-one', () => {
    beforeEach(() => {
      flow.guests.replaceAll(gameId, [
        { position: 4, player_id: null, host_player_id: dani },
      ]);
      flow.played(gameId);
    });

    it('adds a share to the host debt', () => {
      expect(flow.debts.totalsByHolder(flow.seasonId).get(dani)).toBe(800);
    });

    it('pays the host own share while the plus-one share stays owed', () => {
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: dani }],
        payerPlayerId: dani,
      });

      expect(flow.debts.totalsByHolder(flow.seasonId).get(dani)).toBe(400);
      expect(participation(dani).paid_cents).toBe(400);
    });

    it('lets only the host settle the plus-one share and undoes it as owed again', () => {
      const share = { hostPlayerId: dani, ordinal: 1 };
      expect(() =>
        flow.paymentService.pay(gameId, { shares: [share], payerPlayerId: ana })
      ).toThrow('Solo puede pagar quien lo debe o a quien corresponde');

      const [payment] = flow.paymentService.pay(gameId, {
        shares: [share],
        payerPlayerId: dani,
      });
      expect(flow.debts.totalsByHolder(flow.seasonId).get(dani)).toBe(400);

      flow.paymentService.undo(gameId, payment.id);
      expect(flow.debts.totalsByHolder(flow.seasonId).get(dani)).toBe(800);
    });
  });
});
