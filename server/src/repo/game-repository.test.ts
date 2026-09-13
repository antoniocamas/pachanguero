import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { SeasonRepository } from './season-repository.js';
import { GameRepository } from './game-repository.js';

describe('GameRepository', () => {
  let conn: Database.Database;
  let games: GameRepository;
  let seasonId: number;

  beforeEach(() => {
    conn = TestDatabase.create();
    games = new GameRepository(conn);
    seasonId = new SeasonRepository(conn).create({ name: '2025/2026' }).id;
  });

  it('creates and gets a game', () => {
    const g = games.create(seasonId, '2025-09-08');
    expect(games.get(g.id)).toMatchObject({
      played_on: '2025-09-08',
      status: 'scheduled',
    });
  });

  it('lists games ordered by date', () => {
    games.create(seasonId, '2025-09-15');
    games.create(seasonId, '2025-09-08');
    expect(games.list(seasonId).map(g => g.played_on)).toEqual([
      '2025-09-08',
      '2025-09-15',
    ]);
  });

  it('updates only the allowed columns', () => {
    const g = games.create(seasonId, '2025-09-08');
    const updated = games.update(g.id, {
      played_on: '2025-09-09',
      status: 'played',
    });
    expect(updated).toMatchObject({
      played_on: '2025-09-09',
      status: 'played',
    });
  });

  it('deletes a game', () => {
    const g = games.create(seasonId, '2025-09-08');
    games.delete(g.id);
    expect(games.get(g.id)).toBeUndefined();
  });
});
