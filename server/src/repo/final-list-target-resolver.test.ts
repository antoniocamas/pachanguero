import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { FinalListTargetResolver } from './final-list-target-resolver.js';
import { GameRepository } from './game-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { SeasonRepository } from './season-repository.js';

describe('FinalListTargetResolver', () => {
  let conn: Database.Database;
  let games: GameRepository;
  let schedule: ScheduleRepository;
  let resolver: FinalListTargetResolver;
  let seasonId: number;

  beforeEach(() => {
    conn = TestDatabase.create();
    games = new GameRepository(conn);
    schedule = new ScheduleRepository(conn);
    resolver = new FinalListTargetResolver(games, schedule);
    seasonId = new SeasonRepository(conn).create({ name: '2025/2026' }).id;
    // Monday 22:00, so the cutoff is 23:00.
    schedule.create({
      weekday: 1,
      kickoff_time: '22:00',
      effective_from: '2025-09-01',
    });
  });

  describe('with today and an older game both unresolved', () => {
    beforeEach(() => {
      games.create(seasonId, '2025-12-29');
      games.create(seasonId, '2026-01-05');
    });

    it("falls back to the older game before today's cutoff", () => {
      const game = resolver.resolve(new Date('2026-01-05T22:30'));
      expect(game?.played_on).toBe('2025-12-29');
    });

    it("targets today's game once the cutoff has passed", () => {
      const game = resolver.resolve(new Date('2026-01-05T23:15'));
      expect(game?.played_on).toBe('2026-01-05');
    });

    it('treats the cutoff minute itself as eligible', () => {
      const game = resolver.resolve(new Date('2026-01-05T23:00'));
      expect(game?.played_on).toBe('2026-01-05');
    });
  });

  it('returns a lone older game at any time of day', () => {
    games.create(seasonId, '2025-12-29');
    expect(resolver.resolve(new Date('2026-01-05T08:00'))?.played_on).toBe(
      '2025-12-29'
    );
  });

  it("returns nothing when only today's game exists and it is too early", () => {
    games.create(seasonId, '2026-01-05');
    expect(resolver.resolve(new Date('2026-01-05T22:30'))).toBeUndefined();
  });

  it('skips games already played or cancelled', () => {
    games.create(seasonId, '2025-12-22', null, 'played');
    games.create(seasonId, '2025-12-29', null, 'cancelled');
    expect(resolver.resolve(new Date('2026-01-05T23:15'))).toBeUndefined();
  });

  it('ignores games in the future', () => {
    games.create(seasonId, '2026-01-12');
    expect(resolver.resolve(new Date('2026-01-05T23:15'))).toBeUndefined();
  });

  it('returns undefined when there are no games at all', () => {
    expect(resolver.resolve(new Date('2026-01-05T23:15'))).toBeUndefined();
  });

  it("treats today's game as eligible when no schedule exists", () => {
    conn.prepare('DELETE FROM weekly_schedule').run();
    games.create(seasonId, '2026-01-05');
    expect(resolver.resolve(new Date('2026-01-05T09:00'))?.played_on).toBe(
      '2026-01-05'
    );
  });
});
