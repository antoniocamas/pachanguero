import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';
import { GameRepository } from './game-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { DebtRepository } from './debt-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { StandingsService } from './standings-service.js';
import { PointsCalculator } from '../domain/points.js';

describe('StandingsService', () => {
  let conn: Database.Database;
  let seasons: SeasonRepository;
  let players: PlayerRepository;
  let games: GameRepository;
  let participations: ParticipationRepository;
  let exclusions: ExclusionRepository;
  let standings: StandingsService;
  let seasonId: number;

  beforeEach(() => {
    conn = TestDatabase.create();
    seasons = new SeasonRepository(conn);
    players = new PlayerRepository(conn);
    games = new GameRepository(conn);
    participations = new ParticipationRepository(conn);
    exclusions = new ExclusionRepository(conn);
    standings = new StandingsService(
      players,
      exclusions,
      new DebtRepository(conn),
      new PointsCalculator(),
      conn
    );
    seasonId = seasons.create({
      name: '2025/2026',
      price_cents: 5600,
      slots: 14,
    }).id;
  });

  it('combines paid games, exclusions and seniority into points, sorted descending', () => {
    const ana = players.add(seasonId, 'Ana', 0);
    const bea = players.add(seasonId, 'Bea', 0);
    const g1 = games.create(seasonId, '2025-09-08').id;
    participations.set(g1, ana.id, { played: true, paid_cents: 400 });
    exclusions.set(g1, bea.id, 'points');

    const table = standings.standings(seasonId);
    expect(table[0]).toMatchObject({ name: 'Ana', paidGames: 1, points: 1 });
    expect(table[1]).toMatchObject({ name: 'Bea', exclusions: 1, points: 1 });
  });

  describe('debt', () => {
    const debts = () => new DebtRepository(conn);

    it('is the shares a holder still owes in played games', () => {
      const ana = players.add(seasonId, 'Ana', 0);
      const g1 = games.create(seasonId, '2025-09-08', null, 'played').id;
      debts().insert(g1, { playerId: ana.id }, ana.id, 400);
      const [row] = standings.standings(seasonId);
      expect(row.debtCents).toBe(400); // 5600 / 14
    });

    it('lands on the holder, once, when a guest share is held by a host', () => {
      const ana = players.add(seasonId, 'Ana', 0);
      const marta = players.add(seasonId, 'Marta', 0);
      const g1 = games.create(seasonId, '2025-09-08', null, 'played').id;
      debts().insert(g1, { playerId: ana.id }, ana.id, 400);
      debts().insert(g1, { playerId: marta.id }, ana.id, 400);
      const table = standings.standings(seasonId);
      expect(table.find(r => r.name === 'Ana')!.debtCents).toBe(800);
      expect(table.find(r => r.name === 'Marta')!.debtCents).toBe(0);
    });

    it('ignores a game that is not played', () => {
      const ana = players.add(seasonId, 'Ana', 0);
      const g1 = games.create(
        seasonId,
        '2025-09-08',
        null,
        'cancelled',
        'played'
      ).id;
      debts().insert(g1, { playerId: ana.id }, ana.id, 400);
      expect(standings.standings(seasonId)[0].debtCents).toBe(0);
    });
  });

  it('excludes a cancelled game from paid/games-played counts', () => {
    const ana = players.add(seasonId, 'Ana', 0);
    const g1 = games.create(
      seasonId,
      '2025-09-08',
      null,
      'cancelled',
      'open'
    ).id;
    participations.set(g1, ana.id, { played: true, paid_cents: 400 });
    const [row] = standings.standings(seasonId);
    expect(row.paidGames).toBe(0);
  });

  it('upToGameId scopes the standings to games strictly before it', () => {
    const ana = players.add(seasonId, 'Ana', 0);
    const g1 = games.create(seasonId, '2025-09-08').id;
    const g2 = games.create(seasonId, '2025-09-15').id;
    participations.set(g1, ana.id, { played: true, paid_cents: 400 });
    participations.set(g2, ana.id, { played: true, paid_cents: 400 });
    const [row] = standings.standings(seasonId, g2);
    expect(row.paidGames).toBe(1);
  });
});
