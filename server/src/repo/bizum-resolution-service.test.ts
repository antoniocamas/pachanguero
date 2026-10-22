import { beforeEach, describe, expect, it } from 'vitest';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';

describe('BizumResolutionService', () => {
  let rig: BizumFeedRig;
  let luis: number;

  const resolution = () => rig.flow.bizumResolution;
  const arrive = (
    id: string,
    cents: number,
    from: { name?: string; phone?: string },
    concept: string | null = null,
    booked = '2026-10-12'
  ) => rig.arrive(FakeBankEntries.incoming(id, booked, cents, from, concept));

  beforeEach(() => {
    rig = new BizumFeedRig();
    rig.connect();
    luis = rig.player('Luis Pérez');
  });

  it('lists the oldest booking first', async () => {
    await arrive('late', 800, { phone: '+34611111111' }, null, '2026-10-12');
    await arrive('early', 800, { phone: '+34622222222' }, null, '2026-10-02');

    expect(
      resolution()
        .waiting()
        .map(w => w.bookedOn)
    ).toEqual(['2026-10-02', '2026-10-12']);
  });

  it('lists the open shares a Bizum could pay for a player not paired: nearest first, then the later games', async () => {
    const older = rig.owes(luis, '2026-10-05');
    const nearer = rig.owes(luis, '2026-10-06');
    const upcoming = rig.owes(luis, '2026-10-20');
    await arrive('r1', 800, { phone: '+34611111111' });

    const shares = resolution().openShares(rig.idOf('r1'), luis);

    expect(shares.map(s => s.gameId)).toEqual([nearer, older, upcoming]);
  });

  it('adds the games after the booking date, earliest first and marked, once the earlier ones are listed', async () => {
    const earlier = rig.owes(luis, '2026-10-05');
    const later = rig.owes(luis, '2026-10-20');
    const latest = rig.owes(luis, '2026-10-27');
    await arrive('r1', 800, { phone: '+34611111111' });

    const shares = resolution().openShares(rig.idOf('r1'), luis);

    expect(shares.map(s => [s.gameId, s.afterBooking])).toEqual([
      [earlier, false],
      [later, true],
      [latest, true],
    ]);
  });

  it('rules for an unpaired sender without pairing it', async () => {
    rig.owes(luis, '2026-10-05');
    await arrive('r1', 800, { name: 'Luis P.R.' });

    resolution().rule(rig.idOf('r1'), luis, 1);

    expect(rig.flow.players.bizumNamesOf(luis)).toEqual([]);
    expect(rig.handlingOf('r1')).toMatchObject({
      settledHow: 'organiser',
      unallocatedCents: 400,
    });
  });

  describe('paying for other players', () => {
    let ana: number;
    let beto: number;

    beforeEach(() => {
      ana = rig.player('Ana López');
      beto = rig.player('Beto Ruiz');
    });

    it('pays the sender’s share and those of the players they pay for, keeping each holder', async () => {
      const game = rig.owes(luis, '2026-10-05');
      rig.flow.participations.set(game, ana, { played: true });
      rig.flow.debts.insert(game, { playerId: ana }, ana, 400);
      rig.owes(beto, '2026-10-06');
      await arrive('r1', 1200, { name: 'Luis P.R.' });

      resolution().rule(rig.idOf('r1'), luis, 1, 'keep', [
        { playerId: ana, shares: 1 },
        { playerId: beto, shares: 1 },
      ]);

      const paid = rig.conn
        .prepare(
          'SELECT beneficiary_player_id AS b, holder_player_id AS h, payer_player_id AS p FROM payments ORDER BY id'
        )
        .all();
      expect(paid).toEqual([
        { b: luis, h: luis, p: luis },
        { b: ana, h: ana, p: luis },
        { b: beto, h: beto, p: luis },
      ]);
      expect(rig.handlingOf('r1')).toMatchObject({
        status: 'settled',
        unallocatedCents: 0,
      });
    });

    it('may pay only for others when the sender owes nothing', async () => {
      rig.owes(ana, '2026-10-05');
      await arrive('r1', 400, { name: 'Luis P.R.' });

      resolution().rule(rig.idOf('r1'), luis, 0, 'keep', [
        { playerId: ana, shares: 1 },
      ]);

      expect(rig.payments()).toHaveLength(1);
    });

    it('lists only a player’s own shares for paying them on their behalf', async () => {
      const own = rig.owes(ana, '2026-10-05');
      await arrive('r1', 800, { name: 'Luis P.R.' });

      expect(
        resolution()
          .openShares(rig.idOf('r1'), ana, true)
          .map(s => s.gameId)
      ).toEqual([own]);
    });

    it('refuses more than the Bizum covers, more shares than they owe, and the sender as another', async () => {
      rig.owes(luis, '2026-10-05');
      rig.owes(ana, '2026-10-05');
      await arrive('r1', 400, { name: 'Luis P.R.' });
      const id = rig.idOf('r1');

      expect(() =>
        resolution().rule(id, luis, 1, 'keep', [{ playerId: ana, shares: 1 }])
      ).toThrow('El Bizum no cubre 2 cuotas');
      expect(() =>
        resolution().rule(id, luis, 0, 'keep', [{ playerId: ana, shares: 2 }])
      ).toThrow('solo tiene 1 cuota abierta');
      expect(() =>
        resolution().rule(id, luis, 0, 'keep', [{ playerId: luis, shares: 1 }])
      ).toThrow('Sus propias cuotas se eligen arriba');
      expect(rig.payments()).toEqual([]);
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses %s shares', async shares => {
    rig.owes(luis, '2026-10-05');
    await arrive('r1', 800, { name: 'Luis P.R.' });

    expect(() => resolution().rule(rig.idOf('r1'), luis, shares)).toThrow(
      'Indica cuántas cuotas paga el Bizum'
    );
  });

  it('refuses a ruling when the player has no open share', async () => {
    await arrive('r1', 800, { name: 'Luis P.R.' });

    expect(() => resolution().rule(rig.idOf('r1'), luis, 1)).toThrow(
      'Solo tiene 0 cuotas abiertas en esa temporada'
    );
  });

  it('refuses what is not there: a Bizum, a player, a Bizum that no longer waits', async () => {
    rig.owes(luis, '2026-10-05');
    await arrive('r1', 800, { name: 'Luis P.R.' });
    const id = rig.idOf('r1');

    expect(() => resolution().rule(999, luis, 1)).toThrow(
      'No existe ese Bizum'
    );
    expect(() => resolution().rule(id, 999, 1)).toThrow(
      'No existe ese jugador'
    );
    resolution().rule(id, luis, 1);
    expect(() => resolution().rule(id, luis, 1)).toThrow(
      'Ese Bizum ya no está en espera'
    );
    expect(() => resolution().dismiss(999)).toThrow('No existe ese Bizum');
  });

  it('reevaluates only what still waits, and settles each against what the ones before took', async () => {
    rig.owes(luis, '2026-10-05');
    rig.flow.senderPairing.addBizumName(luis, 'Luis P.R.');
    await arrive('a', 400, { name: 'Luis P.R.' }, null, '2026-10-08');
    await arrive('b', 400, { name: 'Luis P.R.' }, null, '2026-10-09');
    const [a, b] = [rig.idOf('a'), rig.idOf('b')];

    expect(resolution().reevaluate([999, a, b, a])).toEqual([
      expect.objectContaining({ bizumId: b, status: 'waiting', games: [] }),
    ]);
  });

  describe('a Bizum booked before the games it pays', () => {
    const adam = () => rig.player('Adam');

    it('waits, and says which later games the sender owes', async () => {
      const a = adam();
      rig.flow.senderPairing.addBizumName(a, 'ADAM RON B.');
      const g1 = rig.owes(a, '2026-09-07');
      const g2 = rig.owes(a, '2026-09-14');
      void [g1, g2];
      await arrive(
        'r1',
        1200,
        { name: 'ADAM RON B.' },
        '3 furgol',
        '2026-09-02'
      );

      const [waiting] = resolution().waiting();

      expect(waiting.reason).toMatchObject({
        code: 'not_enough_debts',
        shares: 3,
        debts: 0,
      });
      expect(waiting.laterGames).toEqual(['2026-09-07', '2026-09-14']);
    });

    it('lets the organiser pay the later games, earliest first', async () => {
      const a = adam();
      const g1 = rig.owes(a, '2026-09-07');
      const g2 = rig.owes(a, '2026-09-14');
      const g3 = rig.owes(a, '2026-09-21');
      await arrive(
        'r1',
        1200,
        { name: 'ADAM RON B.' },
        '3 furgol',
        '2026-09-02'
      );

      resolution().rule(rig.idOf('r1'), a, 3);

      expect(rig.payments().map(p => p.game_id)).toEqual([g1, g2, g3]);
      expect(rig.handlingOf('r1')).toMatchObject({
        status: 'settled',
        settledHow: 'organiser',
        unallocatedCents: 0,
      });
    });

    it('pays the earlier games first, nearest first, and then the later ones', async () => {
      const a = adam();
      const before = rig.owes(a, '2026-09-01');
      const after = rig.owes(a, '2026-09-07');
      await arrive('r1', 800, { name: 'ADAM RON B.' }, null, '2026-09-02');

      resolution().rule(rig.idOf('r1'), a, 2);

      expect(rig.payments().map(p => p.game_id)).toEqual([before, after]);
    });

    it('never pays more shares than the player has open, whenever they were played', async () => {
      const a = adam();
      rig.owes(a, '2026-09-07');
      await arrive('r1', 1200, { name: 'ADAM RON B.' }, null, '2026-09-02');

      expect(() => resolution().rule(rig.idOf('r1'), a, 2)).toThrow(
        'Solo tiene 1 cuota abierta en esa temporada'
      );
    });

    it('leaves the money that pays nothing on the Bizum, unassigned, unless the organiser dismisses it', async () => {
      const a = adam();
      rig.owes(a, '2026-09-07');
      rig.owes(a, '2026-09-14');
      rig.owes(a, '2026-09-21');
      await arrive('keep', 1200, { name: 'ADAM RON B.' }, null, '2026-09-02');
      await arrive('drop', 1200, { name: 'ADAM RON B.' }, null, '2026-09-02');

      const kept = resolution().rule(rig.idOf('keep'), a, 2);
      const dropped = resolution().rule(rig.idOf('drop'), a, 1, 'dismiss');

      expect(kept).toEqual({ shares: 2, unallocatedCents: 400 });
      expect(dropped).toEqual({ shares: 1, unallocatedCents: 0 });
    });

    it('refuses a way of leaving the rest that is not one of the two', async () => {
      const a = adam();
      rig.owes(a, '2026-09-07');
      await arrive('r1', 800, { name: 'ADAM RON B.' }, null, '2026-09-02');

      expect(() =>
        resolution().rule(rig.idOf('r1'), a, 1, 'whatever' as never)
      ).toThrow('Indica qué se hace con el resto del Bizum');
    });
  });

  describe('money left after every debt of the Bizum season', () => {
    const adam = () => rig.player('Adam');

    it('offers the debts of a previous season after those of its own, the latest game first', async () => {
      const a = adam();
      const own = rig.owes(a, '2026-09-07');
      const old1 = rig.owesInPreviousSeason(a, '2026-05-06');
      const old2 = rig.owesInPreviousSeason(a, '2026-05-13');
      await arrive('r1', 1200, { name: 'ADAM RON B.' }, null, '2026-09-10');

      const offered = resolution().openShares(rig.idOf('r1'), a);

      expect(
        offered.map(s => [s.gameId, s.afterBooking, s.previousSeason])
      ).toEqual([
        [own, false, false],
        [old2, false, true],
        [old1, false, true],
      ]);
    });

    it('lets the organiser pay them with the money that remains', async () => {
      const a = adam();
      const own = rig.owes(a, '2026-09-07');
      const old = rig.owesInPreviousSeason(a, '2026-05-06');
      await arrive('r1', 800, { name: 'ADAM RON B.' }, null, '2026-09-10');

      resolution().rule(rig.idOf('r1'), a, 2);

      expect(rig.payments().map(p => p.game_id)).toEqual([own, old]);
      expect(rig.handlingOf('r1')).toMatchObject({ status: 'settled' });
    });

    it('does not pay them with money the own season needs: the Bizum must cover them', async () => {
      const a = adam();
      rig.owes(a, '2026-09-07');
      rig.owesInPreviousSeason(a, '2026-05-06');
      await arrive('r1', 400, { name: 'ADAM RON B.' }, null, '2026-09-10');

      expect(() => resolution().rule(rig.idOf('r1'), a, 2)).toThrow(
        'El Bizum no cubre 2 cuotas'
      );
    });

    it('the rules alone never pay a previous season', async () => {
      const a = adam();
      rig.flow.senderPairing.addBizumName(a, 'ADAM RON B.');
      rig.owesInPreviousSeason(a, '2026-05-06');
      await arrive('r1', 400, { name: 'ADAM RON B.' }, null, '2026-09-10');

      expect(rig.payments()).toEqual([]);
      expect(resolution().waiting()).toHaveLength(1);
    });
  });

  describe('the settled Bizums', () => {
    it('lists each with the games it settled, earliest game first, and how', async () => {
      const a = rig.player('Adam');
      rig.flow.senderPairing.addBizumName(a, 'ADAM RON B.');
      const g1 = rig.owes(a, '2026-10-05');
      const g2 = rig.owes(a, '2026-10-06');
      await arrive('r1', 800, { name: 'ADAM RON B.' }, 'furgol', '2026-10-08');

      expect(resolution().settled()).toEqual([
        {
          id: rig.idOf('r1'),
          bookedOn: '2026-10-08',
          amountCents: 800,
          currency: 'EUR',
          sender: { name: 'ADAM RON B.', phone: null },
          subject: 'furgol',
          settledHow: 'automatic',
          unallocatedCents: 0,
          payments: [
            {
              paymentId: expect.any(Number),
              gameId: g1,
              playedOn: '2026-10-05',
              playerName: 'Adam',
              amountCents: 400,
            },
            {
              paymentId: expect.any(Number),
              gameId: g2,
              playedOn: '2026-10-06',
              playerName: 'Adam',
              amountCents: 400,
            },
          ],
        },
      ]);
    });

    it('lists the newest booking first', async () => {
      const a = rig.player('Adam');
      rig.flow.senderPairing.addBizumName(a, 'ADAM RON B.');
      rig.owes(a, '2026-10-05');
      rig.owes(a, '2026-10-06');
      await arrive('old', 400, { name: 'ADAM RON B.' }, null, '2026-10-07');
      await arrive('new', 400, { name: 'ADAM RON B.' }, null, '2026-10-09');

      expect(
        resolution()
          .settled()
          .map(s => s.bookedOn)
      ).toEqual(['2026-10-09', '2026-10-07']);
    });

    it('does not list a Bizum that waits', async () => {
      await arrive('r1', 800, { phone: '+34611111111' });

      expect(resolution().settled()).toEqual([]);
    });
  });
});
