import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';
import { GameRepository } from './game-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { StandingsService } from './standings-service.js';
import { ConvocatoriaService } from './convocatoria-service.js';
import { PointsCalculator } from '../domain/points.js';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';

describe('ConvocatoriaService', () => {
  let conn: Database.Database;
  let seasons: SeasonRepository;
  let players: PlayerRepository;
  let games: GameRepository;
  let participations: ParticipationRepository;
  let exclusions: ExclusionRepository;
  let service: ConvocatoriaService;
  let seasonId: number;
  let gameId: number;
  let playerIds: number[];

  beforeEach(() => {
    conn = TestDatabase.create();
    seasons = new SeasonRepository(conn);
    players = new PlayerRepository(conn);
    games = new GameRepository(conn);
    participations = new ParticipationRepository(conn);
    exclusions = new ExclusionRepository(conn);
    const standings = new StandingsService(
      players,
      exclusions,
      seasons,
      new PointsCalculator(),
      conn
    );
    service = new ConvocatoriaService(
      games,
      participations,
      exclusions,
      standings,
      new ConvocatoriaBuilder(),
      seasons,
      conn
    );

    seasonId = seasons.create({ name: '2025/2026', slots: 14 }).id;
    gameId = games.create(seasonId, '2025-09-08').id;
    playerIds = Array.from({ length: 16 }, (_, i) => {
      const name = `P${String(i + 1).padStart(2, '0')}`;
      const p = players.add(seasonId, name, 1);
      participations.set(gameId, p.id, { signed_up: true });
      return p.id;
    });
  });

  it('previews without persisting anything', () => {
    const result = service.preview(gameId);
    expect(result.oversubscribed).toBe(true);
    expect(result.entries.filter(e => e.playing)).toHaveLength(14);
    expect(service.saved(gameId)).toBeNull();
  });

  it('commits: writes convocatoria_entries, exclusions, and participations.played', () => {
    const result = service.commit(gameId);
    expect(result.entries.filter(e => e.playing)).toHaveLength(14);
    expect(result.entries.filter(e => e.outcome === 'excluded')).toHaveLength(
      2
    );

    const saved = service.saved(gameId)!;
    expect(saved.entries).toHaveLength(16);

    const excludedIds = result.entries
      .filter(e => !e.playing)
      .map(e => e.playerId);
    for (const id of excludedIds) {
      const [row] = participations.list(gameId).filter(p => p.player_id === id);
      expect(row.played).toBe(0);
    }
    const playingIds = result.entries
      .filter(e => e.playing)
      .map(e => e.playerId);
    for (const id of playingIds) {
      const [row] = participations.list(gameId).filter(p => p.player_id === id);
      expect(row.played).toBe(1);
    }

    const exclusionRows = conn
      .prepare('SELECT * FROM exclusions WHERE game_id = ?')
      .all(gameId);
    expect(exclusionRows).toHaveLength(2);
  });

  it('re-committing replaces the prior commit rather than accumulating', () => {
    service.commit(gameId);
    // Drop one signed-up player, sign up a brand-new one, commit again.
    participations.set(gameId, playerIds[0], { signed_up: false });
    const newcomer = players.add(seasonId, 'P17', 1);
    participations.set(gameId, newcomer.id, { signed_up: true });

    service.commit(gameId);

    const entries = conn
      .prepare(
        'SELECT * FROM convocatoria_entries ce JOIN convocatorias c ON c.id = ce.convocatoria_id WHERE c.game_id = ?'
      )
      .all(gameId);
    expect(entries).toHaveLength(16); // still 16 signed up, not 32
    const convocatorias = conn
      .prepare('SELECT * FROM convocatorias WHERE game_id = ?')
      .all(gameId);
    expect(convocatorias).toHaveLength(1);
  });
});
