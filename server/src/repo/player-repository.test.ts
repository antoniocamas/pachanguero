import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';

describe('PlayerRepository', () => {
  let conn: Database.Database;
  let players: PlayerRepository;
  let seasonId: number;

  beforeEach(() => {
    conn = TestDatabase.create();
    players = new PlayerRepository(conn);
    seasonId = new SeasonRepository(conn).create({ name: '2025/2026' }).id;
  });

  it('creates a player and enrols them in the season', () => {
    const p = players.add(seasonId, 'Ana', 3);
    expect(p.name).toBe('Ana');
    expect(p.seasons).toBe(3);
  });

  it('is idempotent on the players row (INSERT OR IGNORE)', () => {
    const first = players.add(seasonId, 'Ana', 1);
    const second = players.add(seasonId, 'Ana', 5);
    expect(second.id).toBe(first.id);
    expect(second.seasons).toBe(5);
  });

  it('lists enrolled players ordered by name', () => {
    players.add(seasonId, 'Zoe');
    players.add(seasonId, 'Ana');
    expect(players.list(seasonId).map(p => p.name)).toEqual(['Ana', 'Zoe']);
  });

  it("updates a season player's seasons/active fields", () => {
    const p = players.add(seasonId, 'Ana', 1);
    players.updateSeasonPlayer(seasonId, p.id, { seasons: 4, active: false });
    const [row] = players.list(seasonId);
    expect(row.seasons).toBe(4);
    expect(row.active).toBe(0);
  });
});
