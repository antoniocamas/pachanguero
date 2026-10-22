import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthTestApp } from '../routes/auth-test-support.js';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';

const DAY = 24 * 60 * 60_000;

/**
 * The requirements of the Bizums that wait, as Given/When/Then, through the real feed, rules,
 * settlement, services and lifecycle on a real database with a scripted bank. A share is 400
 * cents; the games are in the season of October 2026.
 */
describe('the waiting Bizums requirements', () => {
  let rig: BizumFeedRig;

  const bizum = (
    id: string,
    bookedAt: string,
    cents: number,
    from: { name?: string; phone?: string },
    concept: string | null = null
  ) => FakeBankEntries.incoming(id, bookedAt, cents, from, concept);

  /** Luis Pérez, known on Bizum by `Luis P.R.` unless said otherwise. */
  const luis = (bizumName: string | null = 'Luis P.R.') =>
    rig.player('Luis Pérez', bizumName);

  const waitingOf = (reference: string) =>
    rig.flow.bizumResolution.waiting().find(w => w.id === rig.idOf(reference))!;

  beforeEach(() => {
    rig = new BizumFeedRig();
    rig.connect();
  });

  describe('UC-006-04-S1 — A waiting Bizum is listed with why it waits', () => {
    it('lists "Luis P.R." with 2 open debts and 12.00: Luis Pérez owes 2 shares and the Bizum is 3 (R4)', async () => {
      const luisId = luis();
      rig.owes(luisId, '2026-10-05');
      rig.owes(luisId, '2026-10-06');

      await rig.arrive(bizum('r1', '2026-10-12', 1200, { name: 'Luis P.R.' }));

      expect(waitingOf('r1')).toMatchObject({
        bookedOn: '2026-10-12',
        amountCents: 1200,
        sender: { name: 'Luis P.R.', phone: null },
        subject: null,
        reason: {
          code: 'not_enough_debts',
          playerId: luisId,
          shares: 3,
          debts: 2,
        },
        players: { [luisId]: 'Luis Pérez' },
        senderIdentity: { kind: 'player', playerId: luisId },
      });
    });

    it('lists "Marta G.L." 4.50 with "pachanga": not a number of shares, but the subject mentions pachanga (R5)', async () => {
      await rig.arrive(
        bizum('r2', '2026-10-12', 450, { name: 'Marta G.L.' }, 'pachanga')
      );

      expect(waitingOf('r2')).toMatchObject({
        amountCents: 450,
        subject: 'pachanga',
        reason: { code: 'include_word', word: 'pachanga', wholeShares: false },
      });
    });

    it('lists a phone nobody has: we do not know the sender (R7)', async () => {
      await rig.arrive(
        bizum('r3', '2026-10-12', 800, { phone: '+34611111111' })
      );

      expect(waitingOf('r3')).toMatchObject({
        sender: { name: null, phone: '+34611111111' },
        reason: { code: 'sender_unknown' },
        senderIdentity: { kind: 'unknown', suggestions: [] },
      });
    });

    it('lists the Bizum name of two players: the sender may be either (R7)', async () => {
      const garcia = rig.player('Marta García', 'Marta G.L.');
      const gomez = rig.player('Marta Gómez', 'Marta G.L.');

      await rig.arrive(bizum('r4', '2026-10-12', 800, { name: 'Marta G.L.' }));

      expect(waitingOf('r4')).toMatchObject({
        reason: { code: 'sender_ambiguous', playerIds: [garcia, gomez] },
        players: { [garcia]: 'Marta García', [gomez]: 'Marta Gómez' },
      });
    });
  });

  describe('UC-006-04-S2 — The list when nothing waits', () => {
    it('is empty', () => {
      expect(rig.flow.bizumResolution.waiting()).toEqual([]);
    });
  });

  describe('UC-006-04-S3 — A waiting Bizum stays until something resolves it', () => {
    it('is listed once and unchanged after 30 days of daily reads', async () => {
      await rig.arrive(
        bizum('r1', '2026-10-12', 800, { phone: '+34611111111' })
      );
      const before = JSON.stringify(rig.flow.bizumResolution.waiting());

      for (let day = 0; day < 30; day++) {
        rig.clock.advance(DAY);
        await rig.read();
      }

      expect(rig.flow.bizumResolution.waiting()).toHaveLength(1);
      expect(JSON.stringify(rig.flow.bizumResolution.waiting())).toBe(before);
    });
  });

  describe('UC-006-04-S5 — An unknown sender comes with a suggestion', () => {
    it.each([
      ['Marta G.L.', ['Marta', 'Luis Pérez'], ['Marta']],
      ['Alberto H.M.', ['Alberto', 'Alberto H.'], ['Alberto', 'Alberto H.']],
      ['Álvaro B.X.', ['Álvaro B.', 'Álvaro C.'], ['Álvaro B.']],
      ['Marta G.L.', ['Marta García Pérez'], []],
      ['Jorge G.A.', ['Guti'], []],
    ])(
      '%s among %j is suggested %j, and nothing settles',
      async (sender, names, suggested) => {
        const ids = new Map(names.map(name => [name, rig.player(name)]));

        await rig.arrive(bizum('r1', '2026-10-12', 400, { name: sender }));

        const waiting = waitingOf('r1');
        expect(waiting.reason).toEqual({ code: 'sender_unknown' });
        expect(waiting.senderIdentity).toEqual({
          kind: 'unknown',
          suggestions: suggested.map(name => ids.get(name)),
        });
        expect(rig.payments()).toEqual([]);
      }
    );

    it('suggests nobody for a phone', async () => {
      rig.player('Marta');

      await rig.arrive(
        bizum('r1', '2026-10-12', 400, { phone: '+34611111111' })
      );

      expect(waitingOf('r1').senderIdentity).toEqual({
        kind: 'unknown',
        suggestions: [],
      });
    });
  });

  describe('UC-006-05-S1 — Pairing settles what now qualifies', () => {
    it('pairs "Luis P.R." with 2 debts: both Bizums settle one debt each, the nearest first', async () => {
      const luisId = luis(null);
      const older = rig.owes(luisId, '2026-10-05');
      const nearer = rig.owes(luisId, '2026-10-06');
      await rig.arrive(
        bizum('a', '2026-10-08', 400, { name: 'Luis P.R.' }),
        bizum('b', '2026-10-09', 400, { name: 'Luis P.R.' })
      );

      const result = rig.flow.senderPairing.pair(rig.idOf('a'), luisId);

      expect(result.results.map(r => r.status)).toEqual(['settled', 'settled']);
      expect(rig.flow.bizumResolution.waiting()).toEqual([]);
      expect(
        rig.payments().map(p => [p.game_id, p.method, p.paid_on, p.bizum_id])
      ).toEqual([
        [nearer, 'bizum', '2026-10-08', rig.idOf('a')],
        [older, 'bizum', '2026-10-09', rig.idOf('b')],
      ]);
      expect(rig.handlingOf('a')).toMatchObject({ settledHow: 'automatic' });
      expect(rig.flow.players.bizumNamesOf(luisId)).toEqual(['Luis P.R.']);
    });

    it('says, for each Bizum judged, which games it settled and what it is', async () => {
      const luisId = luis(null);
      rig.owes(luisId, '2026-10-05');
      rig.owes(luisId, '2026-10-06');
      await rig.arrive(
        bizum('a', '2026-10-08', 800, { name: 'Luis P.R.' }),
        bizum('b', '2026-10-09', 400, { name: 'Luis P.R.' })
      );

      const result = rig.flow.senderPairing.pair(rig.idOf('a'), luisId);

      expect(result.results).toEqual([
        {
          bizumId: rig.idOf('a'),
          status: 'settled',
          bookedOn: '2026-10-08',
          amountCents: 800,
          games: ['2026-10-05', '2026-10-06'],
        },
        {
          bizumId: rig.idOf('b'),
          status: 'waiting',
          bookedOn: '2026-10-09',
          amountCents: 400,
          games: [],
        },
      ]);
    });

    it('pairs with 1 debt: the 8.00 waits with its new reason and the 4.00 settles', async () => {
      const luisId = luis(null);
      rig.owes(luisId, '2026-10-07');
      await rig.arrive(
        bizum('big', '2026-10-08', 800, { name: 'Luis P.R.' }),
        bizum('small', '2026-10-09', 400, { name: 'Luis P.R.' })
      );

      rig.flow.senderPairing.pair(rig.idOf('big'), luisId);

      expect(rig.handlingOf('small')).toMatchObject({ status: 'settled' });
      expect(waitingOf('big')).toMatchObject({
        reason: {
          code: 'not_enough_debts',
          playerId: luisId,
          shares: 2,
          debts: 1,
        },
      });
      expect(rig.flow.bizumResolution.waiting()).toHaveLength(1);
    });

    it('pairs a phone: it becomes his phone, his email is kept, and both Bizums settle', async () => {
      const luisId = luis(null);
      rig.flow.contacts.save(luisId, { emails: ['luis@example.com'] });
      rig.owes(luisId, '2026-10-05');
      rig.owes(luisId, '2026-10-06');
      await rig.arrive(
        bizum('a', '2026-10-08', 400, { phone: '+34600000000' }),
        bizum('b', '2026-10-09', 400, { phone: '+34600000000' })
      );

      rig.flow.senderPairing.pair(rig.idOf('a'), luisId);

      expect(rig.flow.contacts.get(luisId)).toEqual({
        emails: ['luis@example.com'],
        phone: '+34600000000',
      });
      expect(rig.flow.bizumResolution.waiting()).toEqual([]);
      expect(rig.payments()).toHaveLength(2);
      expect(rig.flow.players.bizumNamesOf(luisId)).toEqual([]);
    });

    it('adds a new name next to the one he had, and replaces nothing', async () => {
      const luisId = luis('Luis Pérez R.');
      await rig.arrive(bizum('a', '2026-10-08', 400, { name: 'Luis P.R.' }));

      const result = rig.flow.senderPairing.pair(rig.idOf('a'), luisId);

      expect(result.replaced).toBeNull();
      expect(rig.flow.players.bizumNamesOf(luisId)).toEqual([
        'Luis Pérez R.',
        'Luis P.R.',
      ]);
    });
  });

  describe('UC-006-05-S2 — The organiser rules that a waiting Bizum pays shares, whatever its amount', () => {
    it.each([
      [450, 1, 50],
      [600, 1, 200],
      [850, 2, 50],
    ])(
      'rules %i cents to pay %i share(s), leaving %i not allocated',
      async (cents, shares, rest) => {
        const luisId = luis();
        const older = rig.owes(luisId, '2026-10-05');
        const nearer = rig.owes(luisId, '2026-10-06');
        await rig.arrive(
          bizum('r1', '2026-10-12', cents, { name: 'Luis P.R.' }, 'pachanga')
        );

        const ruling = rig.flow.bizumResolution.rule(
          rig.idOf('r1'),
          luisId,
          shares
        );

        expect(ruling).toEqual({ shares, unallocatedCents: rest });
        expect(
          rig
            .payments()
            .map(p => [p.game_id, p.method, p.paid_on, p.amount_cents])
        ).toEqual(
          [
            [nearer, 'bizum', '2026-10-12', 400],
            [older, 'bizum', '2026-10-12', 400],
          ].slice(0, shares)
        );
        expect(rig.handlingOf('r1')).toMatchObject({
          status: 'settled',
          settledHow: 'organiser',
          unallocatedCents: rest,
        });
        expect(rig.flow.bizumResolution.waiting()).toEqual([]);
      }
    );

    it('refuses more shares than the player has open in the Bizum season', async () => {
      const luisId = luis();
      rig.owes(luisId, '2026-10-05');
      await rig.arrive(
        bizum('r1', '2026-10-12', 1200, { name: 'Luis P.R.' }, 'pachanga')
      );

      expect(() =>
        rig.flow.bizumResolution.rule(rig.idOf('r1'), luisId, 2)
      ).toThrow('Solo tiene 1 cuota abierta en esa temporada');
      expect(rig.payments()).toEqual([]);
    });

    it('refuses shares worth more than the Bizum', async () => {
      const luisId = luis();
      rig.owes(luisId, '2026-10-05');
      rig.owes(luisId, '2026-10-06');
      await rig.arrive(
        bizum('r1', '2026-10-12', 650, { name: 'Luis P.R.' }, 'pachanga')
      );

      expect(() =>
        rig.flow.bizumResolution.rule(rig.idOf('r1'), luisId, 2)
      ).toThrow('El Bizum no cubre 2 cuotas');
      expect(rig.payments()).toEqual([]);
      expect(rig.handlingOf('r1')).toMatchObject({ status: 'waiting' });
    });
  });

  describe('UC-006-05-S3 — A Bizum name given to two players', () => {
    it('warns of the other holder, and later Bizums of that sender wait as ambiguous', async () => {
      const garcia = rig.player('Marta García', 'Marta G.L.');
      const gomez = rig.player('Marta Gómez');
      await rig.arrive(
        bizum('a', '2026-10-12', 450, { name: 'Marta G.L.' }, 'pachanga')
      );

      const result = rig.flow.senderPairing.pair(rig.idOf('a'), gomez);

      expect(result.sharedWith).toEqual([
        { playerId: garcia, name: 'Marta García' },
      ]);
      await rig.arrive(bizum('b', '2026-10-13', 400, { name: 'Marta G.L.' }));
      expect(waitingOf('b').reason).toEqual({
        code: 'sender_ambiguous',
        playerIds: [garcia, gomez],
      });
    });
  });

  describe('UC-006-05-S4 — The organiser removes a pairing', () => {
    it('leaves no Bizum name, judges later Bizums as unknown, and keeps the payments', async () => {
      const luisId = luis();
      rig.owes(luisId, '2026-10-05');
      await rig.arrive(bizum('a', '2026-10-08', 400, { name: 'Luis P.R.' }));
      expect(rig.handlingOf('a')).toMatchObject({ status: 'settled' });
      expect(rig.flow.senderPairing.pairings()).toEqual([
        { playerId: luisId, playerName: 'Luis Pérez', bizumName: 'Luis P.R.' },
      ]);
      const paid = rig.payments();

      rig.flow.senderPairing.removeBizumName(luisId, 'Luis P.R.');

      expect(rig.flow.players.bizumNamesOf(luisId)).toEqual([]);
      expect(rig.flow.senderPairing.pairings()).toEqual([]);
      expect(rig.payments()).toEqual(paid);
      await rig.arrive(bizum('b', '2026-10-09', 400, { name: 'Luis P.R.' }));
      expect(waitingOf('b').reason).toEqual({ code: 'sender_unknown' });
    });

    it('lets the organiser give a player a Bizum name before any Bizum arrives', async () => {
      const guti = rig.player('Guti');
      rig.owes(guti, '2026-10-05');

      rig.flow.senderPairing.addBizumName(guti, '  Jorge G.A. ');
      await rig.arrive(bizum('a', '2026-10-08', 400, { name: 'Jorge G.A.' }));

      expect(rig.handlingOf('a')).toMatchObject({ status: 'settled' });
    });
  });

  describe('UC-006-05-S5 — The organiser dismisses a Bizum forever', () => {
    it('leaves nothing of it but the bank identification and that it was dismissed', async () => {
      await rig.arrive(
        bizum('r1', '2026-10-12', 800, { phone: '+34611111111' }, 'reforma')
      );

      rig.flow.bizumResolution.dismiss(rig.idOf('r1'));

      expect(rig.flow.bizumResolution.waiting()).toEqual([]);
      expect(rig.keptReferences()).toEqual([]);
      expect(rig.ledgerOutcomes()).toEqual({ r1: 'dismissed' });
      expect(rig.conn.prepare('SELECT * FROM bizum_handling').all()).toEqual(
        []
      );
      expect(rig.payments()).toEqual([]);
    });

    it('refuses to dismiss a settled Bizum', async () => {
      const luisId = luis();
      rig.owes(luisId, '2026-10-05');
      await rig.arrive(bizum('r1', '2026-10-08', 400, { name: 'Luis P.R.' }));

      expect(() => rig.flow.bizumResolution.dismiss(rig.idOf('r1'))).toThrow(
        'Deshaz antes sus pagos'
      );
      expect(rig.keptReferences()).toEqual(['r1']);
    });
  });

  describe('UC-006-05-S6 — A dismissed Bizum stays dismissed', () => {
    let luisId: number;

    beforeEach(async () => {
      luisId = luis(null);
      await rig.arrive(bizum('gone', '2026-10-08', 400, { name: 'Luis P.R.' }));
      rig.flow.bizumResolution.dismiss(rig.idOf('gone'));
    });

    const stayedDismissed = () => {
      expect(rig.keptReferences()).not.toContain('gone');
      expect(rig.ledgerOutcomes().gone).toBe('dismissed');
    };

    it('is not read again by the schedule', async () => {
      await rig.read();

      stayedDismissed();
    });

    it('is not read again after the connection is renewed', async () => {
      rig.connect();

      await rig.read('2026-09-01', true);

      stayedDismissed();
    });

    it('is not settled when the sender is paired', async () => {
      rig.owes(luisId, '2026-10-05');
      rig.owes(luisId, '2026-10-06');
      await rig.arrive(
        bizum('other', '2026-10-09', 400, { name: 'Luis P.R.' })
      );

      rig.flow.senderPairing.pair(rig.idOf('other'), luisId);

      expect(rig.payments()).toHaveLength(1);
      stayedDismissed();
    });

    it('is not settled when a game of the player is played', () => {
      rig.flow.senderPairing.addBizumName(luisId, 'Luis P.R.');

      rig.owes(luisId, '2026-10-05');

      expect(rig.payments()).toEqual([]);
      stayedDismissed();
    });

    it('is not evaluated when an include word its subject holds is added', async () => {
      await rig.arrive(
        bizum('subj', '2026-10-10', 400, { name: 'Luis P.R.' }, 'reforma')
      );
      rig.flow.bizumResolution.dismiss(rig.idOf('subj'));

      rig.settings.replaceWords(
        [...rig.keywords.include(), 'reforma'],
        rig.keywords.exclude()
      );
      await rig.read();

      expect(rig.keptReferences()).toEqual([]);
      expect(rig.ledgerOutcomes().subj).toBe('dismissed');
    });
  });

  describe('UC-006-10-S1 — The game is marked played and the waiting Bizum settles', () => {
    it('settles the debt of the game with method Bizum, the link and the booking date', async () => {
      const luisId = luis();
      await rig.arrive(bizum('r1', '2026-10-08', 400, { name: 'Luis P.R.' }));
      expect(rig.handlingOf('r1')).toMatchObject({ status: 'waiting' });

      const gameId = rig.owes(luisId, '2026-10-07');

      expect(rig.payments()).toMatchObject([
        {
          game_id: gameId,
          method: 'bizum',
          paid_on: '2026-10-08',
          bizum_id: rig.idOf('r1'),
          amount_cents: 400,
        },
      ]);
      expect(rig.handlingOf('r1')).toMatchObject({
        status: 'settled',
        settledHow: 'automatic',
      });
      expect(rig.flow.bizumResolution.waiting()).toEqual([]);
    });
  });

  describe('UC-006-10-S2 — Only Bizums that can now settle are touched', () => {
    it.each([
      [
        '4.00 booked 10-08',
        400,
        '2026-10-08',
        { name: 'Luis P.R.' },
        null,
        'settled',
      ],
      [
        '4.00 booked 10-06, before the game',
        400,
        '2026-10-06',
        { name: 'Luis P.R.' },
        null,
        'not_enough_debts',
      ],
      [
        '4.00 from an unknown phone',
        400,
        '2026-10-08',
        { phone: '+34611111111' },
        null,
        'sender_unknown',
      ],
      [
        '8.00 booked 10-08',
        800,
        '2026-10-08',
        { name: 'Luis P.R.' },
        null,
        'not_enough_debts',
      ],
      [
        '4.50 with pachanga',
        450,
        '2026-10-08',
        { name: 'Luis P.R.' },
        'pachanga',
        'include_word',
      ],
    ])('%s', async (_row, cents, booked, from, subject, result) => {
      const luisId = luis();
      await rig.arrive(bizum('r1', booked, cents, from, subject));

      rig.owes(luisId, '2026-10-07');

      const handling = rig.handlingOf('r1')!;
      if (result === 'settled') {
        expect(handling.status).toBe('settled');
        expect(rig.payments()).toHaveLength(1);
      } else {
        expect(handling.status).toBe('waiting');
        expect(handling.reason?.code).toBe(result);
        expect(rig.payments()).toEqual([]);
      }
    });

    it('records the new count of debts on the 8.00 that still waits', async () => {
      const luisId = luis();
      await rig.arrive(bizum('r1', '2026-10-08', 800, { name: 'Luis P.R.' }));

      rig.owes(luisId, '2026-10-07');

      expect(rig.handlingOf('r1')?.reason).toEqual({
        code: 'not_enough_debts',
        playerId: luisId,
        shares: 2,
        debts: 1,
      });
    });
  });

  describe('UC-006-10-S3 — Re-evaluation never discards and never touches other seasons', () => {
    it('does not discard a Bizum whose exclude word was added later: R3 settles it', async () => {
      const luisId = luis();
      await rig.arrive(
        bizum('r1', '2026-10-08', 400, { name: 'Luis P.R.' }, 'reforma')
      );
      rig.settings.replaceWords(rig.keywords.include(), ['reforma']);

      rig.owes(luisId, '2026-10-07');

      expect(rig.handlingOf('r1')).toMatchObject({ status: 'settled' });
    });

    it('does not pay a debt of another season', async () => {
      const luisId = luis();
      await rig.arrive(bizum('r1', '2026-10-08', 400, { name: 'Luis P.R.' }));
      const lastSeason = rig.flow.seasonId;
      const game = rig.flow.games.create(lastSeason, '2026-08-20').id;
      rig.flow.participations.set(game, luisId, { signed_up: true });

      rig.flow.played(game);

      expect(rig.handlingOf('r1')).toMatchObject({ status: 'waiting' });
      expect(rig.payments()).toEqual([]);
    });
  });

  describe('UC-006-10-S4 — Several waiting Bizums, one debt', () => {
    it('settles the one booked first, whatever the order they arrived in', async () => {
      const luisId = luis();
      await rig.arrive(
        bizum('later', '2026-10-09', 400, { name: 'Luis P.R.' }),
        bizum('earlier', '2026-10-08', 400, { name: 'Luis P.R.' })
      );

      rig.owes(luisId, '2026-10-07');

      expect(rig.handlingOf('earlier')).toMatchObject({ status: 'settled' });
      expect(rig.handlingOf('later')).toMatchObject({ status: 'waiting' });
      expect(rig.payments()).toHaveLength(1);
    });
  });
});

describe('UC-006-04-S4 — Only the admin view shows the list', () => {
  let app: AuthTestApp;
  let admin: string;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    app = await AuthTestApp.start();
    const boss = await app.createUser('boss', 'admin', 'Antonio');
    const player = await app.createUser('carlos', 'regular', 'Carlos García');
    admin = await app.tokenFor('admin', boss.id);
    tokens['a player'] = await app.tokenFor('regular', player.id);
    tokens['an admin using "Ver como jugador"'] = await app.tokenFor(
      { role: 'admin', view: 'regular' },
      boss.id
    );
    tokens['an admin using "Ver como otro jugador"'] =
      await app.server.tokens.issueAccess(
        {
          userId: boss.id,
          role: 'admin',
          view: 'regular',
          actingAs: player.playerId,
        },
        app.clock.now()
      );
    app.conn
      .prepare(
        `INSERT INTO bizums (id, account, reference, direction, booked_on, amount_cents, currency,
                             sender_name, subject, kept_at)
         VALUES (1, 'h', 'r', 'incoming', '2026-10-12', 800, 'EUR', 'Marta G.L.', 'secreto', 'x')`
      )
      .run();
    app.conn
      .prepare(
        `INSERT INTO bizum_handling (bizum_id, status, reason_json, updated_at)
         VALUES (1, 'waiting', ?, 'x')`
      )
      .run(
        JSON.stringify({
          reason: { code: 'sender_unknown' },
          sender: { kind: 'unknown', suggestions: [] },
        })
      );
  });
  afterAll(async () => {
    await app.close();
  });

  it('shows it to the admin', async () => {
    const reply = await app.request('/api/bizums/waiting', { token: admin });

    expect(reply.status).toBe(200);
    expect(JSON.stringify(reply.body)).toContain('Marta G.L.');
  });

  it.each([
    'a player',
    'an admin using "Ver como jugador"',
    'an admin using "Ver como otro jugador"',
  ])('refuses its data to %s', async viewer => {
    const reply = await app.request('/api/bizums/waiting', {
      token: tokens[viewer],
    });

    expect(reply.status).toBe(403);
    expect(JSON.stringify(reply.body)).not.toContain('Marta');
    expect(JSON.stringify(reply.body)).not.toContain('secreto');
  });
});
