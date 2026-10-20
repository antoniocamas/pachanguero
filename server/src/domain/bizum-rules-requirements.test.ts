import { describe, expect, it } from 'vitest';
import type { BizumParty } from '../bizum/model.js';
import {
  BizumRuleSet,
  type BizumFacts,
  type OpenShare,
  type Verdict,
} from './bizum-rules.js';
import { KeywordList } from './keyword-list.js';
import { NearestDebtOrder } from './nearest-debt-order.js';
import { SenderIdentification } from './sender-identification.js';
import { SenderSuggestion } from './sender-suggestion.js';

/**
 * The requirements of how a Bizum is judged, as Given/When/Then, run through the real rule set,
 * sender identification, suggestion and nearest-first ordering. What is stored for the group is
 * handed over as plain data; the database side has its own tests.
 */

const luis = { id: 1, name: 'Luis Pérez' };
const marta = { id: 2, name: 'Marta García' };
const martaGomez = { id: 3, name: 'Marta Gómez' };

/** One debt of one share, on a played game of the given date. */
class Debt {
  constructor(
    private readonly debtId: number,
    private readonly playedOn: string,
    private readonly member: OpenShare['member'],
    private readonly holderId: number,
    private readonly cents: number
  ) {}

  asShare(): OpenShare {
    return {
      debtId: this.debtId,
      gameId: this.debtId,
      playedOn: this.playedOn,
      member: this.member,
      holderId: this.holderId,
      amountCents: this.cents,
    };
  }
}

/** What the group has stored, and the Bizums it judges. */
class Group {
  readonly shareCents: number;
  bizumNames: { playerId: number; bizumName: string }[] = [];
  phones: { playerId: number; phone: string }[] = [];
  players: { id: number; name: string }[] = [];
  debts: Debt[] = [];
  include = ['pachanga'];
  exclude = ['cena'];

  constructor(shareCents = 400) {
    this.shareCents = shareCents;
  }

  /** Debts of the player Luis, one per played date. */
  luisOwes(...dates: string[]): this {
    this.debts = dates.map(
      (date, index) =>
        new Debt(
          index + 1,
          date,
          { playerId: luis.id },
          luis.id,
          this.shareCents
        )
    );
    return this;
  }

  identify(sender: BizumParty) {
    return new SenderIdentification(
      this.bizumNames,
      this.phones,
      new SenderSuggestion(this.players, [])
    ).identify(sender);
  }

  facts(
    sender: BizumParty,
    amountCents: number,
    subject: string | null,
    bookedOn: string
  ): BizumFacts {
    const identity = this.identify(sender);
    const openShares =
      identity.kind === 'player'
        ? new NearestDebtOrder().order(
            this.debts.map(debt => debt.asShare()),
            identity.playerId,
            bookedOn
          )
        : [];
    return {
      amountCents,
      subject,
      shareCents: this.shareCents,
      sender: identity,
      openShares,
      include: new KeywordList(this.include),
      exclude: new KeywordList(this.exclude),
    };
  }

  judge(
    sender: BizumParty,
    amountCents: number,
    subject: string | null = null,
    bookedOn = '2026-10-12'
  ): Verdict {
    return new BizumRuleSet().judge(
      this.facts(sender, amountCents, subject, bookedOn),
      'new'
    );
  }
}

const named = (name: string): BizumParty => ({ name, phone: null });
const phoned = (phone: string): BizumParty => ({ name: null, phone });
const playedOn = (verdict: Verdict) =>
  verdict.action === 'settle' ? verdict.shares.map(s => s.playedOn) : [];

describe('how a Bizum is judged', () => {
  describe('UC-006-03-S1 — A sender is recognised as a player', () => {
    it.each([
      {
        knowledge: 'paired `Luis P.R.` with Luis Pérez',
        group: () => {
          const group = new Group();
          group.bizumNames = [{ playerId: luis.id, bizumName: 'Luis P.R.' }];
          return group;
        },
        sender: named('Luis P.R.'),
        payer: { kind: 'player', playerId: luis.id },
      },
      {
        knowledge:
          'no Bizum name `Marta G.L.`, though "Marta" would be suggested',
        group: () => {
          const group = new Group();
          group.players = [{ id: 4, name: 'Marta' }];
          return group;
        },
        sender: named('Marta G.L.'),
        payer: { kind: 'unknown', suggestions: [4] },
      },
      {
        knowledge: 'Luis Pérez has the phone `+34600000000`',
        group: () => {
          const group = new Group();
          group.phones = [{ playerId: luis.id, phone: '+34600000000' }];
          return group;
        },
        sender: phoned('+34600000000'),
        payer: { kind: 'player', playerId: luis.id },
      },
      {
        knowledge: 'paired `Marta G.L.` with two players',
        group: () => {
          const group = new Group();
          group.bizumNames = [
            { playerId: marta.id, bizumName: 'Marta G.L.' },
            { playerId: martaGomez.id, bizumName: 'Marta G.L.' },
          ];
          return group;
        },
        sender: named('Marta G.L.'),
        payer: { kind: 'ambiguous', playerIds: [marta.id, martaGomez.id] },
      },
      {
        knowledge: 'no player is linked to `+34611111111`',
        group: () => new Group(),
        sender: phoned('+34611111111'),
        payer: { kind: 'unknown', suggestions: [] },
      },
    ])('$knowledge', ({ group, sender, payer }) => {
      expect(group().identify(sender)).toEqual(payer);
    });
  });

  describe('UC-006-03-S2 — A bizum of whole shares settles the nearest open debts first', () => {
    it.each([
      {
        share: 400,
        games: ['2026-09-30', '2026-10-07'],
        amount: 400,
        booked: '2026-10-12',
        settled: ['2026-10-07'],
      },
      {
        share: 400,
        games: ['2026-09-30', '2026-10-07'],
        amount: 800,
        booked: '2026-10-12',
        settled: ['2026-10-07', '2026-09-30'],
      },
      {
        share: 500,
        games: ['2026-09-30', '2026-10-07'],
        amount: 500,
        booked: '2026-10-06',
        settled: ['2026-09-30'],
      },
    ])(
      'share $share, games $games, amount $amount booked $booked settles $settled',
      ({ share, games, amount, booked, settled }) => {
        const group = new Group(share).luisOwes(...games);
        group.bizumNames = [{ playerId: luis.id, bizumName: 'Luis P.R.' }];

        const verdict = group.judge(named('Luis P.R.'), amount, null, booked);

        expect(verdict).toMatchObject({ action: 'settle', playerId: luis.id });
        expect(playedOn(verdict)).toEqual(settled);
      }
    );
  });

  describe("UC-006-03-S3 — A host's Bizum settles the shares the host holds", () => {
    const hostGroup = () => {
      const group = new Group();
      group.bizumNames = [{ playerId: marta.id, bizumName: 'Marta G.L.' }];
      group.debts = [
        new Debt(
          10,
          '2026-10-07',
          { hostPlayerId: marta.id, ordinal: 1 },
          marta.id,
          400
        ),
        new Debt(11, '2026-10-07', { playerId: marta.id }, marta.id, 400),
      ];
      return group;
    };

    it('4.00 settles her own share of that game first', () => {
      const verdict = hostGroup().judge(named('Marta G.L.'), 400);
      expect(verdict).toMatchObject({ action: 'settle' });
      expect(
        (verdict as { shares: OpenShare[] }).shares.map(s => s.member)
      ).toEqual([{ playerId: marta.id }]);
    });

    it('8.00 settles both shares of that game', () => {
      const verdict = hostGroup().judge(named('Marta G.L.'), 800);
      expect(
        (verdict as { shares: OpenShare[] }).shares.map(s => s.debtId)
      ).toEqual([11, 10]);
    });
  });

  describe('UC-006-03-S4 — An amount that is not whole shares is discarded unless the subject names Pachanguero', () => {
    const group = () => {
      const g = new Group().luisOwes('2026-09-30', '2026-10-07');
      g.bizumNames = [{ playerId: luis.id, bizumName: 'Luis P.R.' }];
      g.include = ['pachanga', 'fútbol'];
      return g;
    };

    it.each([
      { amount: 450, subject: null, action: 'discard', rule: 'R6' },
      { amount: 200, subject: 'cena', action: 'discard', rule: 'R1' },
      {
        amount: 600,
        subject: 'partido de la pachanga',
        action: 'wait',
        rule: 'R5',
      },
      { amount: 200, subject: 'fútbol', action: 'wait', rule: 'R5' },
    ])(
      '$amount with $subject: $action by $rule',
      ({ amount, subject, action, rule }) => {
        expect(
          group().judge(named('Luis P.R.'), amount, subject)
        ).toMatchObject({
          action,
          rule,
        });
      }
    );
  });

  describe('UC-006-03-S7 — A Bizum larger than the open debts', () => {
    it.each([
      { amount: 1200, action: 'wait', rule: 'R4' },
      { amount: 2800, action: 'wait', rule: 'R4' },
      { amount: 3200, action: 'discard', rule: 'R2' },
      { amount: 4000, action: 'discard', rule: 'R2' },
    ])('$amount: $action by $rule', ({ amount, action, rule }) => {
      const group = new Group().luisOwes('2026-09-30', '2026-10-07');
      group.bizumNames = [{ playerId: luis.id, bizumName: 'Luis P.R.' }];

      expect(group.judge(named('Luis P.R.'), amount)).toMatchObject({
        action,
        rule,
      });
    });
  });

  describe('UC-006-03-S8 — The first matching rule decides', () => {
    const group = () => {
      const g = new Group().luisOwes('2026-09-30', '2026-10-07');
      g.bizumNames = [{ playerId: luis.id, bizumName: 'Luis P.R.' }];
      return g;
    };

    it.each([
      {
        sender: 'Luis P.R.',
        amount: 400,
        subject: 'cena pachanga',
        action: 'discard',
        rule: 'R1',
      },
      {
        sender: 'Luis P.R.',
        amount: 3200,
        subject: 'pachanga',
        action: 'discard',
        rule: 'R2',
      },
      {
        sender: 'Luis P.R.',
        amount: 800,
        subject: 'pachanga',
        action: 'settle',
        rule: 'R3',
      },
      {
        sender: 'Luis P.R.',
        amount: 1200,
        subject: null,
        action: 'wait',
        rule: 'R4',
      },
      {
        sender: 'Marta G.L.',
        amount: 450,
        subject: 'pachanga',
        action: 'wait',
        rule: 'R5',
      },
      {
        sender: 'Marta G.L.',
        amount: 450,
        subject: null,
        action: 'discard',
        rule: 'R6',
      },
      {
        sender: 'Marta G.L.',
        amount: 800,
        subject: null,
        action: 'wait',
        rule: 'R7',
      },
    ])(
      '$sender $amount $subject: rule $rule',
      ({ sender, amount, subject, action, rule }) => {
        expect(group().judge(named(sender), amount, subject)).toMatchObject({
          action,
          rule,
        });
      }
    );
  });

  describe('UC-006-04-S5 — An unknown sender comes with a suggestion', () => {
    it.each([
      {
        sender: 'Marta G.L.',
        players: ['Marta', 'Luis Pérez'],
        suggested: ['Marta'],
      },
      {
        sender: 'Alberto H.M.',
        players: ['Alberto', 'Alberto H.'],
        suggested: ['Alberto', 'Alberto H.'],
      },
      {
        sender: 'Álvaro B.X.',
        players: ['Álvaro B.', 'Álvaro C.'],
        suggested: ['Álvaro B.'],
      },
      { sender: 'Marta G.L.', players: ['Marta García Pérez'], suggested: [] },
      { sender: 'Jorge G.A.', players: ['Guti'], suggested: [] },
      {
        sender: '+34611111111',
        players: ['Marta', 'Luis Pérez'],
        suggested: [],
      },
    ])('$sender among $players', ({ sender, players, suggested }) => {
      const group = new Group();
      group.players = players.map((name, index) => ({ id: index + 1, name }));
      const party = sender.startsWith('+') ? phoned(sender) : named(sender);

      const verdict = group.judge(party, 800);

      expect(verdict).toMatchObject({
        action: 'wait',
        rule: 'R7',
        reason: { code: 'sender_unknown' },
      });
      const suggestions = (verdict as { sender: { suggestions: number[] } })
        .sender.suggestions;
      expect(
        suggestions.map(id => group.players.find(p => p.id === id)!.name)
      ).toEqual(suggested);
    });
  });

  describe("UC-006-11-S1 — Only debts of the Bizum's own season are paid", () => {
    // The season of a Bizum is read where the debts are gathered; here the open shares are
    // already restricted to it, so what the rules must do is count only those.
    it('a Bizum with no debt in its own season waits', () => {
      const group = new Group();
      group.bizumNames = [{ playerId: luis.id, bizumName: 'Luis P.R.' }];

      expect(group.judge(named('Luis P.R.'), 400)).toMatchObject({
        action: 'wait',
        rule: 'R4',
        reason: { code: 'not_enough_debts', shares: 1, debts: 0 },
      });
    });

    it('settles the debt of its own season', () => {
      const group = new Group().luisOwes('2026-10-07');
      group.bizumNames = [{ playerId: luis.id, bizumName: 'Luis P.R.' }];

      expect(playedOn(group.judge(named('Luis P.R.'), 400))).toEqual([
        '2026-10-07',
      ]);
    });
  });

  describe("UC-006-11-S2 — A Bizum larger than the season's open debts waits, whatever other seasons hold", () => {
    it('two shares against one open debt waits', () => {
      const group = new Group().luisOwes('2026-10-07');
      group.bizumNames = [{ playerId: luis.id, bizumName: 'Luis P.R.' }];

      expect(group.judge(named('Luis P.R.'), 800)).toMatchObject({
        action: 'wait',
        reason: { code: 'not_enough_debts', shares: 2, debts: 1 },
      });
    });

    it('waits without a season at all', () => {
      const group = new Group();
      const facts = group.facts(named('Luis P.R.'), 400, null, '2026-10-12');
      expect(
        new BizumRuleSet().judge({ ...facts, shareCents: null }, 'new')
      ).toMatchObject({ action: 'wait', reason: { code: 'no_season' } });
    });
  });
});
