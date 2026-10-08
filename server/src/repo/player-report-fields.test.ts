import { beforeEach, describe, expect, it } from 'vitest';
import type { ExclusionKind } from '../domain/types.js';
import { CallUpStat } from './call-up-stat.js';
import { GameFlow } from './game-flow-test-support.js';
import { MercySeasonStat } from './mercy-season-stat.js';
import { PaymentStat } from './payment-stat.js';
import { PlayerReportService } from './player-report-service.js';
import { PointsSeasonStat } from './points-season-stat.js';

type Fate = 'paid' | 'owed' | 'free' | ExclusionKind;

/**
 * One player's year, written game by game. The current season (2025/2026,
 * today 2026-03-20) and an earlier one (2024/2025) carry different results
 * so that any figure that leaks across seasons shows up as a wrong number.
 *
 *   paid / owed / free  played, with the own share settled / owed / never billed
 *   points | demoted    signed up and left out (each scores a point)
 *   mercy               played on a plaza de gracia (scores nothing)
 */
class Scenario {
  readonly flow = new GameFlow();
  readonly playerId: number;
  readonly today = '2026-03-20';
  private day = 0;

  constructor() {
    this.playerId = this.flow.players.add(this.flow.seasonId, 'Ana', 1).id;
    this.flow.players.add(this.flow.seasonId, 'Zed', 1);
  }

  /** Games of the current season, one per day from 1 March. */
  now(...fates: Fate[]): number[] {
    return fates.map(f => this.game(this.flow.seasonId, '2026-03', f));
  }

  /** Games of 2024/2025, in which Ana had two seasons of seniority. */
  before(...fates: Fate[]): number[] {
    const old = this.flow.seasons.create({ name: '2024/2025' }).id;
    this.flow.players.add(old, 'Ana', 2);
    this.day = 0;
    return fates.map(f => this.game(old, '2025-03', f));
  }

  report() {
    const { flow } = this;
    return new PlayerReportService(
      [new CallUpStat(flow.conn), new PaymentStat(flow.conn)],
      [
        new PointsSeasonStat(flow.standings),
        new MercySeasonStat(flow.exclusions, flow.seasons),
      ],
      flow.seasons,
      flow.conn
    ).report(this.playerId, this.today);
  }

  private game(seasonId: number, month: string, fate: Fate): number {
    const { flow, playerId } = this;
    const date = `${month}-${String(++this.day).padStart(2, '0')}`;
    const gameId = flow.games.create(seasonId, date).id;
    flow.conn
      .prepare("UPDATE games SET status = 'played' WHERE id = ?")
      .run(gameId);
    const out = fate === 'points' || fate === 'demoted';
    flow.participations.set(gameId, playerId, {
      signed_up: true,
      played: !out,
    });
    if (out || fate === 'mercy') flow.exclusions.set(gameId, playerId, fate);
    if (fate === 'paid') {
      flow.payments.append({
        gameId,
        member: { playerId },
        holderId: playerId,
        payerId: playerId,
        amountCents: 400,
        paidOn: date,
      });
      flow.participations.set(gameId, playerId, {
        paid_cents: 400,
        paid_on: date,
      });
    }
    if (fate === 'owed') flow.debts.insert(gameId, { playerId }, playerId, 400);
    return gameId;
  }
}

describe('player report: every field, current season only', () => {
  let s: Scenario;

  beforeEach(() => {
    s = new Scenario();
    // Current season, in date order:
    //  1 paid · 2 points · 3 demoted · 4 mercy · 5 points · 6 owed · 7 paid · 8 free
    s.now(
      'paid',
      'points',
      'demoted',
      'mercy',
      'points',
      'owed',
      'paid',
      'free'
    );
    // Earlier season: every figure would change if any of these were counted.
    s.before(
      'paid',
      'paid',
      'paid',
      'points',
      'points',
      'demoted',
      'mercy',
      'mercy',
      'owed'
    );
  });

  describe('header', () => {
    it('names the current season', () => {
      expect(s.report().season?.name).toBe('2025/2026');
      expect(s.report().player.name).toBe('Ana');
    });

    it('counts the games played this season: the pitch, a plaza de gracia, not the games left out', () => {
      // 1, 4, 6, 7, 8
      expect(s.report().summary.gamesPlayed).toBe(5);
    });
  });

  describe('Convocatoria summary', () => {
    it('splits the season into played / out / plaza de gracia / demoted', () => {
      expect(s.report().summary.callUp).toEqual({
        played: 4,
        out: 2,
        mercy: 1,
        demoted: 1,
      });
    });

    it('adds up to every game of the season in the summary', () => {
      const c = s.report().summary.callUp as Record<string, number>;
      expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(8);
    });
  });

  describe('Pago summary', () => {
    it('counts the paid and the owed games and what is still owed', () => {
      expect(s.report().summary.payment).toEqual({
        paid: 2,
        owed: 1,
        owedCents: 400,
      });
    });
  });

  describe('Puntos card', () => {
    const points = () =>
      s.report().seasonStats.points as Record<string, number>;

    it('counts the games with the own share paid', () => {
      expect(points().paidGames).toBe(2);
    });

    it('counts a point for each game left out, demotions included, mercy seats not', () => {
      expect(points().exclusions).toBe(3);
    });

    it('takes the seniority of this season only: one season is exactly 1', () => {
      expect(points().seniority).toBeCloseTo(1, 10);
    });

    it('adds the three parts up to the total', () => {
      const p = points();
      expect(p.points).toBeCloseTo(2 + 3 + 1, 10);
      expect(p.points).toBeCloseTo(
        p.paidGames + p.exclusions + p.seniority,
        10
      );
    });

    it('shows the games played of the season, matching the header', () => {
      expect(points().gamesPlayed).toBe(5);
    });

    it('places the player among those enrolled this season', () => {
      expect(points()).toMatchObject({ rank: 1, of: 2 });
    });
  });

  describe('Plaza de gracia card', () => {
    const mercy = () => s.report().seasonStats.mercy as Record<string, number>;

    it('counts weeks out on points apart from demotions', () => {
      expect(mercy().outOnPoints).toBe(2);
    });

    it('counts the plazas de gracia taken this season', () => {
      expect(mercy().mercySeats).toBe(1);
    });

    it('counts the demotions this season', () => {
      expect(mercy().demotions).toBe(1);
    });

    it('follows the wait counter through the season: 1, 2, then the mercy seat takes 2 off, then 1', () => {
      expect(mercy().waitCounter).toBe(1);
    });

    it('takes the threshold from the season rules', () => {
      expect(mercy().threshold).toBe(2);
    });

    it('says how many weeks out are still missing for the next one', () => {
      expect(mercy().gamesUntilMercy).toBe(1);
    });
  });

  describe('games list', () => {
    it('lists every season, newest first', () => {
      const games = s.report().games;
      expect(games).toHaveLength(8 + 9);
      const dates = games.map(g => g.playedOn);
      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('marks each game with its season, so the page can keep this one', () => {
      const games = s.report().games;
      expect(games.filter(g => g.season === '2025/2026')).toHaveLength(8);
      expect(games.filter(g => g.season === '2024/2025')).toHaveLength(9);
      expect(new Set(games.map(g => g.seasonId)).size).toBe(2);
    });

    it('gives each game its outcome, payment and whether the player was on the pitch', () => {
      const now = s
        .report()
        .games.filter(g => g.season === '2025/2026')
        .reverse();
      expect(now.map(g => g.stats.callUp)).toEqual([
        'played',
        'out',
        'demoted',
        'mercy',
        'out',
        'played',
        'played',
        'played',
      ]);
      expect(now.map(g => g.played)).toEqual([
        true,
        false,
        false,
        true,
        false,
        true,
        true,
        true,
      ]);
      expect(
        now.map(
          g => (g.stats.payment as { status: string } | undefined)?.status
        )
      ).toEqual([
        'paid',
        undefined,
        undefined,
        undefined,
        undefined,
        'owed',
        'paid',
        undefined,
      ]);
    });

    it('describes a payment with its amount, payer and date, and a debt with its holder', () => {
      const now = s
        .report()
        .games.filter(g => g.season === '2025/2026')
        .reverse();
      expect(now[0].stats.payment).toEqual({
        status: 'paid',
        amountCents: 400,
        payerId: s.playerId,
        payerName: 'Ana',
        paidOn: '2026-03-01',
      });
      expect(now[5].stats.payment).toEqual({
        status: 'owed',
        amountCents: 400,
        holderId: s.playerId,
        holderName: 'Ana',
      });
    });
  });

  describe('a season with nothing yet', () => {
    it('reports zeros, not the previous season', () => {
      const fresh = new Scenario();
      fresh.before('paid', 'paid', 'points', 'mercy');
      const r = fresh.report();
      expect(r.summary.gamesPlayed).toBe(0);
      expect(r.summary.callUp).toEqual({
        played: 0,
        out: 0,
        mercy: 0,
        demoted: 0,
      });
      expect(r.summary.payment).toEqual({ paid: 0, owed: 0, owedCents: 0 });
      expect(r.seasonStats.points).toMatchObject({
        paidGames: 0,
        exclusions: 0,
        gamesPlayed: 0,
        points: 1,
      });
      expect(r.seasonStats.mercy).toMatchObject({
        outOnPoints: 0,
        mercySeats: 0,
        demotions: 0,
        waitCounter: 0,
        gamesUntilMercy: 2,
      });
    });
  });
});
