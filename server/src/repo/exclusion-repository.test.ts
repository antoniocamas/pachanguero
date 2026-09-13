import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';
import { GameRepository } from './game-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { DEFAULT_RULES } from '../domain/types.js';

describe('ExclusionRepository', () => {
  let conn: Database.Database;
  let exclusions: ExclusionRepository;
  let seasonId: number;
  let playerId: number;
  let g1: number;
  let g2: number;

  beforeEach(() => {
    conn = TestDatabase.create();
    seasonId = new SeasonRepository(conn).create({ name: '2025/2026' }).id;
    playerId = new PlayerRepository(conn).add(seasonId, 'Ana').id;
    const games = new GameRepository(conn);
    g1 = games.create(seasonId, '2025-09-08').id;
    g2 = games.create(seasonId, '2025-09-15').id;
    exclusions = new ExclusionRepository(conn);
  });

  it('sets and clears an exclusion', () => {
    exclusions.set(g1, playerId, 'points');
    expect(
      exclusions.historyFor(seasonId).get(playerId)?.waitCounter(DEFAULT_RULES)
    ).toBe(1);
    exclusions.set(g1, playerId, null);
    expect(exclusions.historyFor(seasonId).has(playerId)).toBe(false);
  });

  it('upserts the kind on conflict', () => {
    exclusions.set(g1, playerId, 'points');
    exclusions.set(g1, playerId, 'demoted');
    expect(exclusions.historyFor(seasonId).get(playerId)?.demotionCount()).toBe(
      1
    );
  });

  it('returns a wrapped ExclusionHistory whose methods work like the pre-move free functions', () => {
    exclusions.set(g1, playerId, 'points');
    exclusions.set(g2, playerId, 'mercy');
    const history = exclusions.historyFor(seasonId).get(playerId)!;
    expect(history.mercyCount()).toBe(1);
    expect(
      history.waitCounter({ ...DEFAULT_RULES, mercyResetsCounter: true })
    ).toBe(0);
  });

  it('excludes games at or after upToGameId, in date order', () => {
    exclusions.set(g1, playerId, 'points');
    exclusions.set(g2, playerId, 'points');
    const upToG2 = exclusions.historyFor(seasonId, g2).get(playerId)!;
    expect(upToG2.waitCounter(DEFAULT_RULES)).toBe(1);
  });
});
