import { beforeEach, describe, expect, it } from 'vitest';
import { Bizum, BizumKey, type BizumParty } from '../bizum/model.js';
import { BizumRuleSet } from '../domain/bizum-rules.js';
import { AliasRepository } from './alias-repository.js';
import { BizumFactsReader, type KeywordSource } from './bizum-facts-reader.js';
import { ContactRepository } from './contact-repository.js';
import { GameFlow } from './game-flow-test-support.js';

describe('BizumFactsReader', () => {
  let flow: GameFlow;
  let reader: BizumFactsReader;
  let contacts: ContactRepository;
  let nextSeasonId: number;
  let luis: number;
  let words: { include: string[]; exclude: string[] };

  const keywords: KeywordSource = {
    include: () => words.include,
    exclude: () => words.exclude,
  };

  /** A played game in a season with Luis (and nobody else) owing a share. */
  const playedGame = (seasonId: number, playedOn: string): number => {
    const gameId = flow.games.create(seasonId, playedOn).id;
    flow.players.add(seasonId, 'Luis Pérez', 1);
    flow.participations.set(gameId, luis, { signed_up: true });
    flow.played(gameId);
    return gameId;
  };

  const bizum = (
    bookedOn: string,
    sender: BizumParty = { name: 'Luis P.R.', phone: null },
    amountCents = 400,
    subject: string | null = null
  ) =>
    new Bizum({
      key: new BizumKey('h1', `e-${bookedOn}-${amountCents}`),
      direction: 'incoming',
      bookedOn,
      amountCents,
      currency: 'EUR',
      sender,
      receiver: { name: null, phone: null },
      subject,
    });

  beforeEach(() => {
    flow = new GameFlow();
    contacts = new ContactRepository(flow.conn);
    words = { include: ['pachanga'], exclude: ['cena'] };
    reader = new BizumFactsReader(
      flow.seasons,
      flow.players,
      new AliasRepository(flow.conn),
      contacts,
      flow.debts,
      keywords
    );
    nextSeasonId = flow.seasons.create({ name: '2026/2027' }).id;
    luis = flow.players.add(flow.seasonId, 'Luis Pérez', 1).id;
    flow.conn
      .prepare("UPDATE players SET bizum_name = 'Luis P.R.' WHERE id = ?")
      .run(luis);
  });

  it('reads the share, the amount, the subject and the lists', () => {
    playedGame(nextSeasonId, '2026-10-07');

    const facts = reader.read(bizum('2026-10-12', undefined, 800, 'cena'));

    expect(facts).toMatchObject({
      amountCents: 800,
      subject: 'cena',
      shareCents: 400,
      sender: { kind: 'player', playerId: luis },
    });
    expect(facts.exclude.find('la cena')).toBe('cena');
    expect(facts.include.find('pachanga')).toBe('pachanga');
  });

  it('reads the lists afresh each time', () => {
    playedGame(nextSeasonId, '2026-10-07');
    words.exclude = [];
    expect(reader.read(bizum('2026-10-12')).exclude.find('cena')).toBeNull();
    words.exclude = ['cena'];
    expect(reader.read(bizum('2026-10-12')).exclude.find('cena')).toBe('cena');
  });

  it("reads only the shares of the Bizum's own season, nearest first", () => {
    const old = playedGame(flow.seasonId, '2026-06-10');
    const early = playedGame(nextSeasonId, '2026-09-30');
    const recent = playedGame(nextSeasonId, '2026-10-07');

    const facts = reader.read(bizum('2026-10-12'));

    expect(facts.openShares.map(s => s.gameId)).toEqual([recent, early]);
    expect(facts.openShares.map(s => s.gameId)).not.toContain(old);
  });

  it('reads the earlier season for a Bizum booked in it', () => {
    const old = playedGame(flow.seasonId, '2026-06-10');
    playedGame(nextSeasonId, '2026-10-07');

    const facts = reader.read(bizum('2026-08-31'));

    expect(facts.openShares.map(s => s.gameId)).toEqual([old]);
  });

  it('leaves out a game played after the booking date', () => {
    const early = playedGame(nextSeasonId, '2026-09-30');
    playedGame(nextSeasonId, '2026-10-07');

    expect(
      reader.read(bizum('2026-10-06')).openShares.map(s => s.gameId)
    ).toEqual([early]);
  });

  it('does not read a debt of a game reopened from played', () => {
    const kept = playedGame(nextSeasonId, '2026-09-30');
    const reopened = playedGame(nextSeasonId, '2026-10-07');
    flow.reopen(reopened);

    expect(flow.debts.list(reopened)).not.toEqual([]);
    expect(
      reader.read(bizum('2026-10-12')).openShares.map(s => s.gameId)
    ).toEqual([kept]);
  });

  it('reads no shares of a settled debt', () => {
    const gameId = playedGame(nextSeasonId, '2026-10-07');
    flow.paymentService.pay(gameId, {
      method: 'efectivo',
      shares: [{ playerId: luis }],
      payerPlayerId: luis,
    });

    expect(reader.read(bizum('2026-10-12')).openShares).toEqual([]);
  });

  it('has no share when the season does not exist', () => {
    const facts = reader.read(bizum('2028-01-05'));

    expect(facts.shareCents).toBeNull();
    expect(facts.openShares).toEqual([]);
  });

  it('reads no shares for a sender who is not a player', () => {
    playedGame(nextSeasonId, '2026-10-07');

    const facts = reader.read(
      bizum('2026-10-12', { name: 'Marta G.L.', phone: null })
    );

    expect(facts.sender).toMatchObject({ kind: 'unknown' });
    expect(facts.openShares).toEqual([]);
  });

  it('identifies a player by a phone stored as typed', () => {
    contacts.save(luis, { phone: '611 11 11 11' });

    const facts = reader.read(
      bizum('2026-10-12', { name: null, phone: '+34611111111' })
    );

    expect(facts.sender).toEqual({ kind: 'player', playerId: luis });
  });

  it('suggests a player to an unknown sender from names and aliases', () => {
    const marta = flow.players.register('Marta García').id;
    new AliasRepository(flow.conn).add(luis, 'Marta G.');

    const facts = reader.read(
      bizum('2026-10-12', { name: 'Marta G.L.', phone: null })
    );

    // Ordered by the players' names: "Luis Pérez" (through his alias) before "Marta García".
    expect(facts.sender).toEqual({
      kind: 'unknown',
      suggestions: [luis, marta],
    });
  });

  describe('judged by the rules', () => {
    const rules = new BizumRuleSet();

    it('a Bizum with no debt in its own season waits, whatever another season holds', () => {
      playedGame(flow.seasonId, '2026-06-10');

      expect(
        rules.judge(reader.read(bizum('2026-10-12')), 'new')
      ).toMatchObject({
        action: 'wait',
        reason: { code: 'not_enough_debts', shares: 1, debts: 0 },
      });
    });

    it('settles the debt of its own season and leaves the other', () => {
      playedGame(flow.seasonId, '2026-06-10');
      const current = playedGame(nextSeasonId, '2026-10-07');

      const verdict = rules.judge(reader.read(bizum('2026-10-12')), 'new');

      expect(verdict).toMatchObject({ action: 'settle' });
      expect(
        (verdict as { shares: { gameId: number }[] }).shares.map(s => s.gameId)
      ).toEqual([current]);
    });

    it("settles the earlier season's debt for a Bizum booked at its end", () => {
      const old = playedGame(flow.seasonId, '2026-06-10');
      playedGame(nextSeasonId, '2026-10-07');

      const verdict = rules.judge(reader.read(bizum('2026-08-31')), 'new');

      expect(
        (verdict as { shares: { gameId: number }[] }).shares.map(s => s.gameId)
      ).toEqual([old]);
    });

    it('two shares against one open debt wait, whatever other seasons hold', () => {
      playedGame(flow.seasonId, '2026-06-10');
      playedGame(nextSeasonId, '2026-10-07');

      expect(
        rules.judge(reader.read(bizum('2026-10-12', undefined, 800)), 'new')
      ).toMatchObject({
        action: 'wait',
        reason: { code: 'not_enough_debts', shares: 2, debts: 1 },
      });
    });
  });

  describe('the two reads the organiser asks for', () => {
    it('identifies a sender without a Bizum', () => {
      expect(reader.identify({ name: 'Luis P.R.', phone: null })).toEqual({
        kind: 'player',
        playerId: luis,
      });
      expect(reader.identify({ name: null, phone: '+34611111111' })).toEqual({
        kind: 'unknown',
        suggestions: [],
      });
    });

    it("reads any player's open shares in the Bizum's season, nearest first", () => {
      const nearer = playedGame(nextSeasonId, '2026-10-07');
      const farther = playedGame(nextSeasonId, '2026-10-01');
      playedGame(nextSeasonId, '2026-10-20');
      playedGame(flow.seasonId, '2026-06-10');

      expect(
        reader.openSharesOf(luis, bizum('2026-10-12')).map(s => s.gameId)
      ).toEqual([nearer, farther]);
    });

    it('reads no shares when no season holds the booking date', () => {
      expect(reader.openSharesOf(luis, bizum('2031-01-01'))).toEqual([]);
    });
  });
});
