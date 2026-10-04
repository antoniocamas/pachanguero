import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { GameRepository } from './game-repository.js';
import { GameDayResolutionService } from './game-day-resolution-service.js';
import { ScheduleRepository } from './schedule-repository.js';
import { SeasonRepository } from './season-repository.js';

describe('GameDayResolutionService', () => {
  let conn: Database.Database;
  let games: GameRepository;
  let schedule: ScheduleRepository;
  let seasons: SeasonRepository;
  let service: GameDayResolutionService;

  beforeEach(() => {
    conn = TestDatabase.create();
    games = new GameRepository(conn);
    schedule = new ScheduleRepository(conn);
    seasons = new SeasonRepository(conn);
    service = new GameDayResolutionService(games, schedule, seasons);
    schedule.create({
      weekday: 1,
      kickoff_time: '22:00',
      effective_from: '2025-09-01',
    });
  });

  it('creates the game for the next game day in the owning season', () => {
    const season = seasons.create({ name: '2025/2026' });
    const game = service.resolveTarget('2025-11-05'); // a Wednesday
    expect(game).toMatchObject({
      season_id: season.id,
      played_on: '2025-11-10',
    });
  });

  it('returns the same game for two pastes landing on the same date', () => {
    seasons.create({ name: '2025/2026' });
    const first = service.resolveTarget('2025-11-05');
    const second = service.resolveTarget('2025-11-07');
    expect(second.id).toBe(first.id);
    expect(conn.prepare('SELECT COUNT(*) AS n FROM games').get()).toEqual({
      n: 1,
    });
  });

  it('assigns a game day falling in the next season to that season', () => {
    seasons.create({ name: '2025/2026' });
    const next = seasons.create({ name: '2026/2027' });
    const game = service.resolveTarget('2026-08-28'); // Friday -> Mon 31 Aug
    expect(game.played_on).toBe('2026-08-31');
    expect(game.season_id).not.toBe(next.id);
    expect(service.resolveTarget('2026-09-01').season_id).toBe(next.id);
  });

  it('refuses when no season covers the game day', () => {
    expect(() => service.resolveTarget('2025-11-05')).toThrow(
      /No season covers/
    );
  });
});
