import { beforeEach, describe, expect, it } from 'vitest';
import { BankError } from '../bizum/ports.js';
import { BankPoller } from '../bizum/bank-poller.js';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The requirements of how the account is read and what becomes of each entry, as Given/When/Then,
 * through the real feed, handler, rules, settlement and poller on a real database with a scripted
 * bank. A share is 400 cents; "Marta G.L." is nobody the group knows, "Luis P.R." is Luis.
 */
describe('the bank feed requirements', () => {
  let rig: BizumFeedRig;
  let luis: number;

  const bizum = (
    id: string,
    bookedAt: string,
    cents: number,
    from: { name?: string; phone?: string },
    concept: string | null = null
  ) => FakeBankEntries.incoming(id, bookedAt, cents, from, concept);

  beforeEach(() => {
    rig = new BizumFeedRig();
    luis = rig.player('Luis Pérez', 'Luis P.R.');
    rig.connect();
  });

  describe('UC-006-02-S1 — A Bizum judged matched or dubious is kept', () => {
    it.each([
      [
        '4.00',
        400,
        '2026-10-12',
        { name: 'Marta G.L.' },
        'pachanga',
        'include_word',
      ],
      [
        '8.00',
        800,
        '2026-10-13',
        { phone: '+34600000000' },
        null,
        'sender_unknown',
      ],
      [
        '4.00',
        400,
        '2026-09-01',
        { name: 'Marta G.L.' },
        'miércoles',
        'sender_unknown',
      ],
    ])(
      'keeps %s EUR booked %s from %j with message %j, marked by why it waits',
      async (_amount, cents, booked, from, message, why) => {
        rig.connector.scriptedEntries = [
          bizum('r1', booked, cents, from, message),
        ];

        await rig.read();

        expect(rig.keptReferences()).toEqual(['r1']);
        const stored = rig.store.find(1)!.bizum;
        expect(stored).toMatchObject({
          amountCents: cents,
          bookedOn: booked,
          subject: message,
          key: { reference: 'r1' },
        });
        expect(stored.sender.name ?? stored.sender.phone).toBe(
          from.name ?? from.phone
        );
        expect(rig.handlingOf('r1')).toMatchObject({
          status: 'waiting',
          reason: { code: why },
        });
      }
    );
  });

  describe('UC-006-02-S2 — What is not kept', () => {
    it('keeps nothing of an outgoing Bizum', async () => {
      rig.connector.scriptedEntries = [
        {
          ...bizum('o1', '2026-10-10', 400, { name: 'Marta G.L.' }),
          kind: 'BIZUM_OUT',
        },
      ];

      await rig.read();

      expect(rig.keptReferences()).toEqual([]);
      expect(rig.ledgerOutcomes()).toEqual({ o1: 'discarded' });
    });

    it('keeps nothing of an entry that is not a Bizum', async () => {
      rig.connector.scriptedEntries = [
        { ...bizum('t1', '2026-10-10', 400, {}), kind: 'CARD' },
      ];

      await rig.read();

      expect(rig.keptReferences()).toEqual([]);
      expect(rig.ledgerOutcomes()).toEqual({ t1: 'not_bizum' });
    });

    it('keeps nothing of a Bizum still pending, and remembers nothing, to read it once booked', async () => {
      rig.connector.scriptedEntries = [
        {
          ...bizum('p1', '2026-10-10', 400, { name: 'Marta G.L.' }),
          state: 'PENDING',
        },
      ];

      await rig.read();

      expect(rig.keptReferences()).toEqual([]);
      expect(rig.ledgerOutcomes()).toEqual({});
    });

    it('keeps nothing of a Bizum booked before the start date', async () => {
      rig.connector.scriptedEntries = [
        bizum('b1', '2026-08-31', 400, { name: 'Marta G.L.' }, 'pachanga'),
      ];

      await rig.read('2026-09-01');

      expect(rig.keptReferences()).toEqual([]);
      expect(rig.ledgerOutcomes()).toEqual({});
    });

    it.each([
      ['R1', 'cena', 400],
      ['R2', null, 3200],
      ['R6', null, 450],
    ])(
      'keeps nothing of a Bizum that rule %s discards',
      async (_rule, subject, cents) => {
        rig.keywords.replace(['pachanga'], ['cena']);
        rig.connector.scriptedEntries = [
          bizum('d1', '2026-10-10', cents, { name: 'Marta G.L.' }, subject),
        ];

        await rig.read();

        expect(rig.keptReferences()).toEqual([]);
        expect(rig.ledgerOutcomes()).toEqual({ d1: 'discarded' });
        expect(
          rig.conn.prepare('SELECT COUNT(*) AS n FROM bizums').get()
        ).toEqual({ n: 0 });
      }
    );

    it('leaves no sender, message or amount of what it discards anywhere in the database', async () => {
      rig.keywords.replace(['pachanga'], ['cena']);
      rig.connector.scriptedEntries = [
        bizum('d1', '2026-10-10', 400, { name: 'Zoilo Q.Z.' }, 'cena privada'),
      ];

      await rig.read();

      const everything = JSON.stringify(
        ['bizum_entries', 'bizums', 'bizum_handling', 'bizum_feed_state'].map(
          table => rig.conn.prepare(`SELECT * FROM ${table}`).all()
        )
      );
      expect(everything).not.toContain('Zoilo');
      expect(everything).not.toContain('cena privada');
    });
  });

  describe('UC-006-02-S3 — An entry already processed is not processed again', () => {
    const entries = () => [
      bizum('settled', '2026-10-12', 400, { name: 'Luis P.R.' }),
      bizum('waiting', '2026-10-12', 800, { phone: '+34611111111' }),
      bizum('discarded', '2026-10-12', 450, { name: 'Marta G.L.' }),
      { ...bizum('card', '2026-10-12', 400, {}), kind: 'CARD' },
    ];

    beforeEach(() => {
      rig.owes(luis, '2026-10-07');
      rig.connector.scriptedEntries = entries();
    });

    it('does nothing the second time, whatever each entry became', async () => {
      await rig.read();
      const before = JSON.stringify([
        rig.payments(),
        rig.ledgerOutcomes(),
        rig.conn.prepare('SELECT * FROM bizum_handling').all(),
      ]);

      const counts = await rig.read();

      expect(counts).toMatchObject({
        entries: 4,
        known: 4,
        kept: 0,
        discarded: 0,
        notBizum: 0,
      });
      expect(
        JSON.stringify([
          rig.payments(),
          rig.ledgerOutcomes(),
          rig.conn.prepare('SELECT * FROM bizum_handling').all(),
        ])
      ).toBe(before);
    });

    it('does nothing after the connection was renewed, with new session accounts and the same account', async () => {
      await rig.read();
      rig.connect();
      rig.connector.scriptedEntries = entries();

      const counts = await rig.read();

      expect(counts).toMatchObject({ known: 4, kept: 0 });
      expect(rig.payments()).toHaveLength(1);
    });
  });

  describe('UC-006-02-S4 — Two Bizums that look the same are two Bizums', () => {
    it('processes both, each once', async () => {
      rig.connector.scriptedEntries = [
        bizum('a', '2026-10-12', 400, { name: 'Marta G.L.' }),
        bizum('b', '2026-10-12', 400, { name: 'Marta G.L.' }),
      ];

      const first = await rig.read();
      const second = await rig.read();

      expect(first.kept).toBe(2);
      expect(rig.keptReferences()).toEqual(['a', 'b']);
      expect(second.known).toBe(2);
    });
  });

  describe('UC-006-02-S5 — Amounts are kept exactly', () => {
    it.each([400, 1200, 450])('keeps %i cents as %i cents', async cents => {
      rig.connector.scriptedEntries = [
        bizum('r1', '2026-10-12', cents, { name: 'Marta G.L.' }, 'pachanga'),
      ];

      await rig.read();

      expect(rig.store.find(1)?.bizum.amountCents).toBe(cents);
    });
  });

  describe('UC-006-02-S6 — A read of many Bizums', () => {
    it('processes all 150 in the first read', async () => {
      rig.connector.scriptedEntries = Array.from({ length: 150 }, (_, i) =>
        bizum(
          `r${String(i).padStart(3, '0')}`,
          '2026-10-12',
          400,
          { name: `Persona ${i}` },
          'pachanga'
        )
      );

      const counts = await rig.read();

      expect(counts).toMatchObject({ entries: 150, kept: 150, known: 0 });
      expect(rig.keptReferences()).toHaveLength(150);
    });
  });

  describe('UC-006-02-S7 — A read that fails', () => {
    it.each([
      [
        'its rate limit',
        new BankError(
          'rate_limited',
          'ASPSP_RATE_LIMIT_EXCEEDED',
          new Date('2026-10-19T16:00:00Z')
        ),
      ],
      ['no answer', new BankError('unavailable', 'NETWORK')],
    ])(
      'keeps what earlier reads processed when the bank answers with %s, and loses or repeats nothing',
      async (_name, failure) => {
        rig.connector.scriptedEntries = [
          bizum('1', '2026-10-01', 400, { name: 'A A.A.' }),
          bizum('2', '2026-10-02', 400, { name: 'B B.B.' }),
          bizum('3', '2026-10-03', 400, { name: 'C C.C.' }),
        ];
        await rig.poller.requestRead();
        const kept = rig.keptReferences();
        rig.clock.advance(7 * HOUR);
        rig.connector.failNext(failure, 'entries');

        const outcome = await rig.poller.requestRead();

        expect(outcome).toMatchObject({
          kind: 'failed',
          failure: failure.failure,
          code: failure.code,
        });
        expect(rig.keptReferences()).toEqual(kept);
        expect(rig.poller.lastRead()).toMatchObject({
          result: failure.failure,
          code: failure.code,
        });

        rig.clock.advance(7 * HOUR);
        rig.connector.scriptedEntries.push(
          bizum('4', '2026-10-04', 400, { name: 'D D.D.' })
        );
        const next = await rig.poller.requestRead();

        expect(next).toMatchObject({
          kind: 'read',
          counts: { known: 3, kept: 1 },
        });
        expect(rig.keptReferences()).toEqual(['1', '2', '3', '4']);
      }
    );
  });

  describe('UC-006-02-S8 — A Bizum is processed within a day', () => {
    it('is read within a day of being booked, by the schedule alone', async () => {
      rig.poller.start();
      await rig.scheduler.fire();
      rig.connector.scriptedEntries = [
        bizum('r1', '2026-10-19', 400, { name: 'Marta G.L.' }),
      ];

      expect(BankPoller.INTERVAL_MS).toBeLessThanOrEqual(DAY);
      rig.clock.advance(rig.scheduler.lastWait!);
      await rig.scheduler.fire();

      expect(rig.keptReferences()).toEqual(['r1']);
    });

    it('is read on the first read after the server starts, if it was stopped meanwhile', async () => {
      rig.poller.start();
      await rig.scheduler.fire();
      rig.connector.scriptedEntries = [
        bizum('r1', '2026-10-19', 400, { name: 'Marta G.L.' }),
      ];
      rig.clock.advance(3 * DAY);

      const restarted = rig.poller;
      restarted.start();

      expect(rig.scheduler.lastWait).toBe(BankPoller.START_DELAY_MS);
      await rig.scheduler.fire();
      expect(rig.keptReferences()).toEqual(['r1']);
    });
  });

  describe('UC-006-02-S9 — The organiser forces a read', () => {
    it('reads at once, by the same rules, and shows the new time of the last read', async () => {
      rig.owes(luis, '2026-10-07');
      await rig.poller.requestRead();
      rig.clock.advance(30 * MINUTE);
      rig.connector.scriptedEntries = [
        bizum('r1', '2026-10-19', 400, { name: 'Luis P.R.' }),
        bizum('r2', '2026-10-19', 400, { name: 'Marta G.L.' }),
      ];

      const outcome = await rig.poller.requestRead();

      expect(outcome).toMatchObject({ kind: 'read', counts: { kept: 2 } });
      expect(rig.poller.lastRead()?.finishedAt).toEqual(rig.clock.now());
      expect(rig.handlingOf('r1')?.status).toBe('settled');
      expect(rig.handlingOf('r2')?.status).toBe('waiting');
    });

    it('processes nothing twice', async () => {
      rig.connector.scriptedEntries = [
        bizum('r1', '2026-10-19', 400, { name: 'Marta G.L.' }),
      ];
      await rig.poller.requestRead();
      rig.clock.advance(HOUR);

      const outcome = await rig.poller.requestRead();

      expect(outcome).toMatchObject({
        kind: 'read',
        counts: { known: 1, kept: 0 },
      });
    });
  });

  describe('UC-006-02-S10 — A forced read that cannot run', () => {
    it('a read is in progress', async () => {
      rig.connector.scriptedEntries = [];
      const first = rig.poller.requestRead();

      expect(await rig.poller.requestRead()).toEqual({
        kind: 'refused',
        refusal: { code: 'in_progress' },
      });
      await first;
    });

    it('the last read ended 2 minutes ago', async () => {
      await rig.poller.requestRead();
      rig.clock.advance(2 * MINUTE);

      expect(await rig.poller.requestRead()).toMatchObject({
        refusal: {
          code: 'too_soon',
          until: new Date(rig.clock.now().getTime() + 3 * MINUTE),
        },
      });
    });

    it('the bank answered the last read with its rate limit and its retry time has not come', async () => {
      const until = new Date('2026-10-19T16:00:00Z');
      rig.connector.failNext(
        new BankError('rate_limited', 'ASPSP_RATE_LIMIT_EXCEEDED', until),
        'entries'
      );
      await rig.poller.requestRead();
      rig.clock.advance(HOUR);

      expect(await rig.poller.requestRead()).toEqual({
        kind: 'refused',
        refusal: { code: 'rate_limited', until },
      });
    });

    it.each([
      ['there is no connection', () => rig.connections.delete()],
      [
        'the connection must be made again',
        () => rig.connections.markReconnectNeeded('CLOSED_SESSION'),
      ],
      [
        'the start date is not set',
        () =>
          rig.conn.prepare('UPDATE bank_settings SET start_date = NULL').run(),
      ],
      [
        'the account is not chosen',
        () =>
          rig.conn.prepare(`UPDATE bank_connection SET accounts_json = ?`).run(
            JSON.stringify([
              {
                ...BizumFeedRig.ACCOUNT,
                currency: 'EUR',
                kind: 'CACC',
                last4: '1111',
              },
              {
                stableId: 'h2',
                sessionId: 'uid-2',
                currency: 'EUR',
                kind: 'CACC',
                last4: '2222',
              },
            ])
          ),
      ],
    ])('is not offered when %s', async (_situation, undo) => {
      undo();

      expect(await rig.poller.requestRead()).toEqual({
        kind: 'refused',
        refusal: { code: 'not_ready' },
      });
      expect(rig.connector.read).toEqual([]);
    });
  });

  describe('UC-006-03-S5 — A settled Bizum leaves a payment that says how it was paid', () => {
    it('shows the method Bizum, the link to that Bizum, and the date the money arrived', async () => {
      const game = rig.owes(luis, '2026-10-07');
      rig.connector.scriptedEntries = [
        bizum('r1', '2026-10-12', 400, { name: 'Luis P.R.' }),
      ];

      await rig.read();

      const stored = rig.conn.prepare('SELECT id FROM bizums').get() as {
        id: number;
      };
      expect(rig.payments()).toEqual([
        expect.objectContaining({
          game_id: game,
          method: 'bizum',
          bizum_id: stored.id,
          paid_on: '2026-10-12',
          amount_cents: 400,
        }),
      ]);
      expect(rig.flow.debts.list(game)).toEqual([]);
    });
  });

  describe('UC-006-03-S6 — Nothing to settle yet', () => {
    it('settles nothing and the Bizum waits when the sender has no open debt', async () => {
      rig.connector.scriptedEntries = [
        bizum('r1', '2026-10-12', 400, { name: 'Luis P.R.' }),
      ];

      await rig.read();

      expect(rig.payments()).toEqual([]);
      expect(rig.handlingOf('r1')).toMatchObject({
        status: 'waiting',
        reason: {
          code: 'not_enough_debts',
          playerId: luis,
          shares: 1,
          debts: 0,
        },
      });
    });
  });

  describe('UC-006-04-S3 — A waiting Bizum stays until something resolves it', () => {
    it('is still listed, once, unchanged, after 30 days of daily reads', async () => {
      rig.connector.scriptedEntries = [
        bizum('r1', '2026-10-19', 800, { phone: '+34611111111' }),
      ];
      await rig.poller.requestRead();
      const before = JSON.stringify(rig.handling.waiting());

      for (let day = 0; day < 30; day++) {
        rig.clock.advance(DAY);
        await rig.poller.requestRead();
      }

      expect(rig.handling.waiting()).toHaveLength(1);
      expect(JSON.stringify(rig.handling.waiting())).toBe(before);
    });
  });
});
