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

  it('findOrCreate reuses the unlabelled game for a date', () => {
    const first = games.findOrCreate(seasonId, '2025-09-08');
    const again = games.findOrCreate(seasonId, '2025-09-08');
    expect(again.id).toBe(first.id);
    expect(games.list(seasonId)).toHaveLength(1);
  });

  it('findOrCreate ignores a labelled replay of the same date', () => {
    const bis = games.create(seasonId, '2025-09-08', 'Bis');
    expect(games.findOrCreate(seasonId, '2025-09-08').id).not.toBe(bis.id);
  });

  it('unresolvedOnOrBefore returns open games up to the date, newest first', () => {
    games.create(seasonId, '2025-09-08');
    games.create(seasonId, '2025-09-15', null, 'played');
    games.create(seasonId, '2025-09-22', null, 'cancelled');
    games.create(seasonId, '2025-09-29');
    games.create(seasonId, '2025-10-06');
    expect(
      games.unresolvedOnOrBefore('2025-09-29').map(g => g.played_on)
    ).toEqual(['2025-09-29', '2025-09-08']);
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
