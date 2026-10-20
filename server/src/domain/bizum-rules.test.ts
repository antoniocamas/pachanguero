import { describe, expect, it } from 'vitest';
import {
  BizumRuleSet,
  ExcludeWordRule,
  NotEnoughDebtsRule,
  OverSevenRule,
  SettleRule,
  ShareCount,
  type BizumFacts,
  type OpenShare,
} from './bizum-rules.js';
import { KeywordList } from './keyword-list.js';

const luis = 1;

const share = (debtId: number, playedOn: string): OpenShare => ({
  debtId,
  gameId: debtId,
  playedOn,
  member: { playerId: luis },
  holderId: luis,
  amountCents: 400,
});

/** Share 4.00, Luis known and owing two shares, "pachanga" included, "cena" excluded. */
const facts = (over: Partial<BizumFacts> = {}): BizumFacts => ({
  amountCents: 400,
  subject: null,
  shareCents: 400,
  sender: { kind: 'player', playerId: luis },
  openShares: [share(2, '2026-10-07'), share(1, '2026-09-30')],
  include: new KeywordList(['pachanga', 'fútbol']),
  exclude: new KeywordList(['cena']),
  ...over,
});

const unknown = { kind: 'unknown', suggestions: [] } as const;

describe('ShareCount', () => {
  it('is whole when the amount divides by the share', () => {
    const count = new ShareCount(800, 400);
    expect(count).toMatchObject({ whole: true, shares: 2, overSeven: false });
    expect(count.playable).toBe(true);
  });

  it('is not whole otherwise', () => {
    expect(new ShareCount(450, 400)).toMatchObject({
      whole: false,
      playable: false,
    });
  });

  it('is over seven from eight shares on, and seven is playable', () => {
    expect(new ShareCount(2800, 400)).toMatchObject({
      overSeven: false,
      playable: true,
    });
    expect(new ShareCount(3200, 400)).toMatchObject({
      overSeven: true,
      playable: false,
    });
  });

  it('is nothing without a season', () => {
    expect(new ShareCount(400, null)).toMatchObject({
      whole: false,
      overSeven: false,
      playable: false,
    });
  });
});

describe('BizumRuleSet', () => {
  const rules = new BizumRuleSet();

  describe('in new mode', () => {
    it('discards a subject with an exclude word before anything else (R1)', () => {
      expect(rules.judge(facts({ subject: 'cena pachanga' }), 'new')).toEqual({
        action: 'discard',
        rule: 'R1',
      });
    });

    it('discards more than seven shares, whatever the subject (R2)', () => {
      expect(
        rules.judge(facts({ amountCents: 3200, subject: 'pachanga' }), 'new')
      ).toEqual({ action: 'discard', rule: 'R2' });
    });

    it('settles the nearest shares a known player can cover (R3)', () => {
      const verdict = rules.judge(facts({ amountCents: 800 }), 'new');
      expect(verdict).toEqual({
        action: 'settle',
        rule: 'R3',
        playerId: luis,
        shares: [share(2, '2026-10-07'), share(1, '2026-09-30')],
      });
    });

    it('settles exactly as many shares as were paid (R3)', () => {
      const verdict = rules.judge(facts(), 'new');
      expect(verdict).toMatchObject({ action: 'settle' });
      expect((verdict as { shares: OpenShare[] }).shares).toEqual([
        share(2, '2026-10-07'),
      ]);
    });

    it('waits when the known player owes fewer shares than were paid (R4)', () => {
      expect(rules.judge(facts({ amountCents: 1200 }), 'new')).toEqual({
        action: 'wait',
        rule: 'R4',
        reason: {
          code: 'not_enough_debts',
          playerId: luis,
          shares: 3,
          debts: 2,
        },
        sender: { kind: 'player', playerId: luis },
      });
    });

    it('waits at seven shares with fewer debts (R4)', () => {
      expect(rules.judge(facts({ amountCents: 2800 }), 'new')).toMatchObject({
        action: 'wait',
        rule: 'R4',
      });
    });

    it('waits for a subject with an include word, noting the shares are not whole (R5)', () => {
      expect(
        rules.judge(
          facts({ amountCents: 450, sender: unknown, subject: 'pachanga' }),
          'new'
        )
      ).toEqual({
        action: 'wait',
        rule: 'R5',
        reason: { code: 'include_word', word: 'pachanga', wholeShares: false },
        sender: unknown,
      });
    });

    it('notes an include word on whole shares of an unknown sender (R5 before R7)', () => {
      expect(
        rules.judge(
          facts({ amountCents: 800, sender: unknown, subject: 'pachanga' }),
          'new'
        )
      ).toMatchObject({
        rule: 'R5',
        reason: { code: 'include_word', wholeShares: true },
      });
    });

    it('discards an amount that is not whole shares (R6)', () => {
      expect(
        rules.judge(facts({ amountCents: 450, sender: unknown }), 'new')
      ).toEqual({ action: 'discard', rule: 'R6' });
    });

    it('waits for whole shares from an unknown sender (R7)', () => {
      expect(
        rules.judge(facts({ amountCents: 800, sender: unknown }), 'new')
      ).toEqual({
        action: 'wait',
        rule: 'R7',
        reason: { code: 'sender_unknown' },
        sender: unknown,
      });
    });

    it('names the players an ambiguous sender could be (R7)', () => {
      const sender = { kind: 'ambiguous', playerIds: [2, 3] } as const;
      expect(
        rules.judge(facts({ amountCents: 800, sender }), 'new')
      ).toMatchObject({
        rule: 'R7',
        reason: { code: 'sender_ambiguous', playerIds: [2, 3] },
        sender,
      });
    });

    it('waits without a season, since no share can be counted', () => {
      expect(
        rules.judge(facts({ shareCents: null, openShares: [] }), 'new')
      ).toEqual({
        action: 'wait',
        rule: null,
        reason: { code: 'no_season' },
        sender: { kind: 'player', playerId: luis },
      });
    });

    it('still lets an exclude word discard without a season', () => {
      expect(
        rules.judge(facts({ shareCents: null, subject: 'cena' }), 'new')
      ).toMatchObject({ action: 'discard', rule: 'R1' });
    });
  });

  describe('in review mode', () => {
    it('does not discard for an exclude word added later, and settles when it can', () => {
      expect(rules.judge(facts({ subject: 'cena' }), 'review')).toMatchObject({
        action: 'settle',
        rule: 'R3',
      });
    });

    it('does not discard more than seven shares; it keeps waiting', () => {
      expect(
        rules.judge(facts({ amountCents: 3200, sender: unknown }), 'review')
      ).toEqual({
        action: 'wait',
        rule: 'R7',
        reason: { code: 'sender_unknown' },
        sender: unknown,
      });
    });

    it('does not discard an amount that is no longer whole shares; it waits as kept', () => {
      expect(
        rules.judge(facts({ amountCents: 450, sender: unknown }), 'review')
      ).toEqual({
        action: 'wait',
        rule: null,
        reason: { code: 'kept' },
        sender: unknown,
      });
    });

    it('never answers discard for any amount, sender or subject', () => {
      const senders = [
        unknown,
        { kind: 'player', playerId: luis },
        { kind: 'ambiguous', playerIds: [2, 3] },
      ] as const;
      for (const sender of senders) {
        for (const amountCents of [100, 400, 450, 1200, 2800, 3200, 9999]) {
          for (const subject of [null, 'cena', 'pachanga', 'cena pachanga']) {
            expect(
              rules.judge(facts({ sender, amountCents, subject }), 'review')
                .action
            ).not.toBe('discard');
          }
        }
      }
    });
  });

  it('takes its order from the list: with R3 before R1 a cena Bizum settles', () => {
    const swapped = new BizumRuleSet([
      new SettleRule(),
      new ExcludeWordRule(),
      new OverSevenRule(),
      new NotEnoughDebtsRule(),
    ]);
    const bizum = facts({ subject: 'cena pachanga' });
    expect(rules.judge(bizum, 'new')).toMatchObject({
      action: 'discard',
      rule: 'R1',
    });
    expect(swapped.judge(bizum, 'new')).toMatchObject({
      action: 'settle',
      rule: 'R3',
    });
  });
});
