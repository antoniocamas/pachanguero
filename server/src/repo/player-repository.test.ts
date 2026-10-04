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

  it('is a no-op on a second enrolment: the first seniority stands', () => {
    const first = players.add(seasonId, 'Ana', 1);
    const second = players.add(seasonId, 'Ana', 5);
    expect(second.id).toBe(first.id);
    expect(second.seasons).toBe(1);
  });

  it('suggests last recorded + 1 for a returning player, across a gap', () => {
    const seasons = new SeasonRepository(conn);
    const old = seasons.create({ name: '2022/2023' }); // 2023/24 skipped
    const ana = players.add(old.id, 'Ana', 3);
    expect(players.hasAppeared(seasonId, ana.id)).toBe(false);
    expect(players.suggestSeniority(seasonId, ana.id)).toBe(4);
  });

  it('suggests the most recent season by calendar, not by insertion', () => {
    const seasons = new SeasonRepository(conn);
    const recent = seasons.create({ name: '2024/2025' });
    const older = seasons.create({ name: '2021/2022' });
    const ana = players.add(recent.id, 'Ana', 6);
    players.add(older.id, 'Ana', 2);
    expect(players.suggestSeniority(seasonId, ana.id)).toBe(7);
  });

  it('suggests 0 for a brand-new player', () => {
    const { lastInsertRowid } = conn
      .prepare("INSERT INTO players (name) VALUES ('Ana')")
      .run();
    expect(players.suggestSeniority(seasonId, Number(lastInsertRowid))).toBe(0);
  });

  it('lists every player, including one not enrolled in the season', () => {
    const other = new SeasonRepository(conn).create({ name: '2019/2020' });
    players.add(other.id, 'Zoe', 2);
    players.add(seasonId, 'Ana', 1);
    expect(players.list(seasonId).map(p => p.name)).toEqual(['Ana']);
    expect(players.listAll().map(p => p.name)).toEqual(['Ana', 'Zoe']);
  });

  it('knows a player has already appeared this season', () => {
    const ana = players.add(seasonId, 'Ana', 2);
    expect(players.hasAppeared(seasonId, ana.id)).toBe(true);
  });

  it('lists enrolled players ordered by name', () => {
    players.add(seasonId, 'Zoe', 1);
    players.add(seasonId, 'Ana', 1);
    expect(players.list(seasonId).map(p => p.name)).toEqual(['Ana', 'Zoe']);
  });

  it("updates a season player's seasons field", () => {
    const p = players.add(seasonId, 'Ana', 1);
    players.updateSeasonPlayer(seasonId, p.id, { seasons: 4 });
    const [row] = players.list(seasonId);
    expect(row.seasons).toBe(4);
  });
});
