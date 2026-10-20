import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthTestApp } from '../routes/auth-test-support.js';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';

/**
 * The requirements of correcting a payment and tracing it, as Given/When/Then, through the real
 * feed, services and lifecycle on a real database with a scripted bank. A share is 400 cents.
 */
describe('the Bizum correction and traceability requirements', () => {
  let rig: BizumFeedRig;
  let luis: number;

  const bizum = (
    id: string,
    bookedAt: string,
    cents: number,
    concept: string | null = null
  ) =>
    FakeBankEntries.incoming(
      id,
      bookedAt,
      cents,
      { name: 'Luis P.R.' },
      concept
    );

  const undo = (gameId: number, paymentId: number) =>
    rig.flow.bizumUndo.undoPayment(gameId, paymentId);

  beforeEach(() => {
    rig = new BizumFeedRig();
    rig.connect();
    luis = rig.player('Luis Pérez', 'Luis P.R.');
  });

  describe('UC-006-06-S1 — Undoing an automatic payment returns the debt and the Bizum', () => {
    it('opens the debt again and lists the Bizum with its original data', async () => {
      const game = rig.owes(luis, '2026-10-07');
      await rig.arrive(bizum('r1', '2026-10-12', 400, 'miércoles'));
      const [payment] = rig.payments();
      expect(rig.handlingOf('r1')).toMatchObject({ status: 'settled' });

      undo(game, payment.id);

      expect(rig.payments()).toEqual([]);
      expect(rig.flow.debts.find(game, { playerId: luis })).toMatchObject({
        holder_player_id: luis,
        amount_cents: 400,
      });
      expect(
        rig.flow.participations.list(game).find(p => p.player_id === luis)
      ).toMatchObject({ paid_cents: 0, paid_on: null });
      expect(rig.flow.bizumResolution.waiting()).toMatchObject([
        {
          bookedOn: '2026-10-12',
          amountCents: 400,
          sender: { name: 'Luis P.R.', phone: null },
          subject: 'miércoles',
          reason: { code: 'undone' },
          senderIdentity: { kind: 'player', playerId: luis },
        },
      ]);
    });
  });

  describe('UC-006-06-S2 — A Bizum that paid several shares is undone as a whole', () => {
    it.each(['2026-10-07', '2026-09-30'])(
      'undoing the payment of the game of %s undoes both and returns the Bizum',
      async chosen => {
        const games = new Map([
          ['2026-10-07', rig.owes(luis, '2026-10-07')],
          ['2026-09-30', rig.owes(luis, '2026-09-30')],
        ]);
        await rig.arrive(bizum('r1', '2026-10-12', 800));
        expect(rig.payments()).toHaveLength(2);
        const picked = rig
          .payments()
          .find(p => p.game_id === games.get(chosen))!;

        undo(picked.game_id, picked.id);

        expect(rig.payments()).toEqual([]);
        for (const game of games.values()) {
          expect(rig.flow.debts.find(game, { playerId: luis })).not.toBeNull();
        }
        expect(rig.handlingOf('r1')).toMatchObject({
          status: 'waiting',
          reason: { code: 'undone' },
        });
      }
    );

    it('refuses the whole undo when one of the games is no longer played', async () => {
      const first = rig.owes(luis, '2026-10-07');
      const second = rig.owes(luis, '2026-09-30');
      await rig.arrive(bizum('r1', '2026-10-12', 800));
      const before = rig.payments();
      rig.flow.reopen(second);

      expect(() =>
        undo(first, before.find(p => p.game_id === first)!.id)
      ).toThrow();

      expect(rig.payments()).toEqual(before);
      expect(rig.handlingOf('r1')).toMatchObject({ status: 'settled' });
    });
  });

  describe('UC-006-06-S3 — Undoing a payment that no Bizum made is unchanged', () => {
    it.each(['efectivo', 'bizum'] as const)(
      'undoes a payment recorded by hand as %s and lists no Bizum',
      method => {
        const game = rig.owes(luis, '2026-10-07');
        rig.flow.paymentService.pay(game, {
          shares: [{ playerId: luis }],
          payerPlayerId: luis,
          method,
        });
        const [payment] = rig.payments();
        expect(payment.bizum_id).toBeNull();

        undo(game, payment.id);

        expect(rig.payments()).toEqual([]);
        expect(rig.flow.debts.find(game, { playerId: luis })).not.toBeNull();
        expect(rig.flow.bizumResolution.waiting()).toEqual([]);
      }
    );
  });

  describe('UC-006-07-S2 — A Bizum payment can be traced to its Bizum', () => {
    it('shows the Bizum, its rest and that the organiser decided', async () => {
      const game = rig.owes(luis, '2026-10-07');
      await rig.arrive(bizum('r1', '2026-10-12', 450, 'pachanga'));
      rig.flow.bizumResolution.rule(rig.idOf('r1'), luis, 1);
      const [payment] = rig.payments();

      const detail = rig.flow.paymentDetail.detail(payment.id);

      expect(detail).toEqual({
        payment: {
          id: payment.id,
          gameId: game,
          playedOn: '2026-10-07',
          amountCents: 400,
          paidOn: '2026-10-12',
          method: 'bizum',
          payerName: 'Luis Pérez',
          beneficiaryName: 'Luis Pérez',
        },
        resolved: 'organiser',
        bizum: {
          bookedOn: '2026-10-12',
          sender: { name: 'Luis P.R.', phone: null },
          amountCents: 450,
          currency: 'EUR',
          subject: 'pachanga',
          reference: 'r1',
          unallocatedCents: 50,
          payments: [
            {
              id: payment.id,
              gameId: game,
              playedOn: '2026-10-07',
              beneficiaryName: 'Luis Pérez',
              amountCents: 400,
            },
          ],
        },
      });
    });

    it('says "automatic" for a payment the rules made', async () => {
      rig.owes(luis, '2026-10-07');
      await rig.arrive(bizum('r1', '2026-10-12', 400));

      expect(rig.flow.paymentDetail.detail(rig.payments()[0].id).resolved).toBe(
        'automatic'
      );
    });
  });

  describe('UC-006-07-S3 — A Bizum recorded by hand has no Bizum behind it', () => {
    it('shows it as recorded by hand, with no Bizum', () => {
      const game = rig.owes(luis, '2026-10-07');
      rig.flow.paymentService.pay(game, {
        shares: [{ playerId: luis }],
        payerPlayerId: luis,
        method: 'bizum',
      });

      const detail = rig.flow.paymentDetail.detail(rig.payments()[0].id);

      expect(detail).toMatchObject({
        payment: { method: 'bizum', amountCents: 400 },
        resolved: 'manual',
        bizum: null,
      });
    });
  });

  describe('UC-006-07-S4 — A player sees the method and nothing of the Bizum', () => {
    let app: AuthTestApp;
    const viewers: Record<string, string> = {};

    beforeAll(async () => {
      app = await AuthTestApp.start();
      const repo = await import('./index.js');
      const user = await app.createUser('luis', 'regular', 'Luis Pérez');
      const boss = await app.createUser('boss', 'admin', 'Antonio');
      const luisId = user.playerId!;
      viewers['Luis in "Pagos"'] = await app.tokenFor('regular', user.id);
      viewers['the organiser using "Ver como jugador"'] =
        await app.server.tokens.issueAccess(
          { userId: boss.id, role: 'admin', view: 'regular' },
          app.clock.now()
        );
      viewers['the organiser using "Ver como otro jugador"'] =
        await app.server.tokens.issueAccess(
          {
            userId: boss.id,
            role: 'admin',
            view: 'regular',
            actingAs: luisId,
          },
          app.clock.now()
        );
      const season = repo.seasons.create({ name: '2026/2027' }).id;
      app.conn
        .prepare(
          `INSERT INTO bizums (id, account, reference, direction, booked_on, amount_cents,
                               currency, sender_name, subject, kept_at)
           VALUES (1, 'h', 'ref-secreta', 'incoming', '2026-10-12', 450, 'EUR',
                   'Remitente Secreto', 'asunto secreto', 'x')`
        )
        .run();
      app.conn
        .prepare(
          `INSERT INTO bizum_handling (bizum_id, status, unallocated_cents, settled_how, updated_at)
           VALUES (1, 'settled', 50, 'automatic', 'x')`
        )
        .run();
      // Both players have a Bizum made by the system, a Bizum by hand and cash.
      for (const playerId of [luisId, boss.playerId!]) {
        const pay = (
          date: string,
          method: 'bizum' | 'efectivo',
          bizumId?: number
        ) => {
          const game = repo.games.create(season, date).id;
          repo.games.setState(game, 'played');
          repo.paymentRepository.append({
            gameId: game,
            member: { playerId },
            holderId: playerId,
            payerId: playerId,
            amountCents: 400,
            paidOn: date,
            method,
            bizumId,
          });
        };
        pay(playerId === luisId ? '2026-10-07' : '2026-10-08', 'bizum', 1);
        pay(playerId === luisId ? '2026-10-14' : '2026-10-15', 'bizum');
        pay(playerId === luisId ? '2026-10-21' : '2026-10-22', 'efectivo');
      }
    });
    afterAll(async () => {
      await app.close();
    });

    it.each([
      'Luis in "Pagos"',
      'the organiser using "Ver como jugador"',
      'the organiser using "Ver como otro jugador"',
    ])(
      'gives %s the method of each payment and nothing of the Bizum',
      async name => {
        const reply = await app.request('/api/me/payments', {
          token: viewers[name],
        });

        const rows = reply.body as unknown as { method: string }[];
        expect(rows.map(row => row.method)).toEqual([
          'efectivo',
          'bizum',
          'bizum',
        ]);
        expect(JSON.stringify(reply.body)).not.toMatch(
          /secret|ref-|unallocated|bizumId|bookedOn|sender|subject|reference/i
        );
      }
    );
  });
});
