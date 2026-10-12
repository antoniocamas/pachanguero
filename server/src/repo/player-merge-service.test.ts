import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { AliasRepository } from './alias-repository.js';
import { GameRepository } from './game-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { PlayerMergeService } from './player-merge-service.js';
import { PlayerRepository } from './player-repository.js';
import { UserRepository } from './user-repository.js';
import { SeasonRepository } from './season-repository.js';

describe('PlayerMergeService', () => {
  let conn: Database.Database;
  let players: PlayerRepository;
  let aliases: AliasRepository;
  let participations: ParticipationRepository;
  let users: UserRepository;
  let merge: PlayerMergeService;
  let seasonId: number;
  let santi: number;
  let santo: number;
  let games: GameRepository;

  beforeEach(() => {
    conn = TestDatabase.create();
    players = new PlayerRepository(conn);
    aliases = new AliasRepository(conn);
    participations = new ParticipationRepository(conn);
    games = new GameRepository(conn);
    users = new UserRepository(conn);
    merge = new PlayerMergeService(players, aliases, users, conn);
    seasonId = new SeasonRepository(conn).create({ name: '2025/2026' }).id;
    santi = players.add(seasonId, 'Santi Zuaraz', 2).id;
    santo = players.add(seasonId, 'Santo', 5).id;
  });

  it('moves the absorbed games to the survivor and keeps the old name as an alias', () => {
    const game = games.create(seasonId, '2025-09-08').id;
    participations.set(game, santo, { played: true, paid_cents: 400 });
    aliases.add(santo, 'Santito');

    merge.merge(santi, santo);

    expect(players.nameOf(santo)).toBeUndefined();
    expect(participations.list(game)).toMatchObject([
      { player_id: santi, name: 'Santi Zuaraz', played: 1, paid_cents: 400 },
    ]);
    expect(
      aliases
        .listAll()
        .filter(a => a.playerId === santi)
        .map(a => a.alias)
        .sort()
    ).toEqual(['Santito', 'Santo']);
  });

  it('keeps the larger seniority of a season both are in', () => {
    merge.merge(santi, santo);
    expect(players.list(seasonId).find(p => p.id === santi)?.seasons).toBe(5);
  });

  it('refuses when both took part in the same game, changing nothing', () => {
    const game = games.create(seasonId, '2025-09-08').id;
    participations.set(game, santi, { signed_up: true });
    participations.set(game, santo, { signed_up: true });

    expect(() => merge.merge(santi, santo)).toThrow(/2025-09-08/);
    expect(players.nameOf(santo)).toBe('Santo');
  });

  it('points who introduced them at the survivor, never at themselves', () => {
    const caro = players.add(seasonId, 'Caro', 1).id;
    players.setIntroducedBy(santo, caro);
    players.setIntroducedBy(caro, santo);
    players.setIntroducedBy(santi, santo);

    merge.merge(santi, santo);

    const byId = new Map(players.listDetailed().map(p => [p.id, p]));
    expect(byId.get(santi)?.introducedBy).toBeNull();
    expect(byId.get(caro)?.introducedBy).toBe(santi);
  });

  it('rejects the same player twice and unknown players', () => {
    expect(() => merge.merge(santi, santi)).toThrow(/different/);
    expect(() => merge.merge(santi, 999)).toThrow(/Unknown/);
  });

  describe('players with an account', () => {
    const account = (username: string, playerId: number) =>
      users.create({ username, passwordHash: 'h', role: 'regular', playerId });

    it("moves the absorbed player's account to the survivor", () => {
      const user = account('santo', santo);

      merge.merge(santi, santo);

      expect(users.byId(user.id)?.playerId).toBe(santi);
      expect(users.byPlayer(santi)?.username).toBe('santo');
      expect(conn.pragma('foreign_key_check')).toEqual([]);
    });

    it("keeps the survivor's own account when only the survivor has one", () => {
      const user = account('santi', santi);

      merge.merge(santi, santo);

      expect(users.byId(user.id)?.playerId).toBe(santi);
      expect(conn.pragma('foreign_key_check')).toEqual([]);
    });

    it('refuses when both have an account, naming both and changing nothing', () => {
      account('santi', santi);
      account('santo', santo);

      expect(() => merge.merge(santi, santo)).toThrow(
        /los dos tienen usuario \(santi, santo\)/
      );
      expect(players.nameOf(santo)).toBe('Santo');
      expect(users.byPlayer(santo)?.username).toBe('santo');
    });
  });
});
