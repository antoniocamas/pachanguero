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
import { GuestSlotAllocator } from '../domain/guest-slot-allocator.js';
import { GuestCandidateRepository } from './guest-candidate-repository.js';

describe('ConvocatoriaService', () => {
  let conn: Database.Database;
  let seasons: SeasonRepository;
  let players: PlayerRepository;
  let games: GameRepository;
  let participations: ParticipationRepository;
  let exclusions: ExclusionRepository;
  let guests: GuestCandidateRepository;
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
    guests = new GuestCandidateRepository(conn);
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
      guests,
      players,
      new GuestSlotAllocator(),
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

  it('commits: writes convocatoria_entries and exclusions, never participations.played', () => {
    const result = service.commit(gameId);
    expect(result.entries.filter(e => e.playing)).toHaveLength(14);
    expect(result.entries.filter(e => e.outcome === 'excluded')).toHaveLength(
      2
    );
    expect(service.saved(gameId)!.entries).toHaveLength(16);
    expect(
      conn.prepare('SELECT * FROM exclusions WHERE game_id = ?').all(gameId)
    ).toHaveLength(2);

    // Who actually played is the final list's call; selection leaves it alone.
    expect(participations.list(gameId).map(p => p.played)).toEqual(
      Array(16).fill(0)
    );
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

  describe('with guests', () => {
    /** A fresh game with `regulars` regulars signed up, ready for guests. */
    const freshGame = (regulars: number, slots = 14) => {
      seasons.update(seasonId, { slots });
      const game = games.create(seasonId, '2025-09-15').id;
      const ids = Array.from({ length: regulars }, (_, i) => {
        const p = players.add(
          seasonId,
          `R${String(i + 1).padStart(2, '0')}`,
          1
        );
        participations.set(game, p.id, { signed_up: true });
        return p.id;
      });
      return { game, ids };
    };
    const namedGuest = (
      game: number,
      name: string,
      position: number,
      host: number
    ) => {
      const p = players.add(seasonId, name, 1);
      participations.set(game, p.id, { signed_up: true });
      guests.put(game, { position, player_id: p.id, host_player_id: host });
      return p.id;
    };
    const entryRows = (game: number) =>
      conn
        .prepare(
          `SELECT ce.player_id, ce.outcome, ce.playing FROM convocatoria_entries ce
             JOIN convocatorias c ON c.id = ce.convocatoria_id WHERE c.game_id = ?`
        )
        .all(game) as { player_id: number; outcome: string; playing: number }[];
    const exclusionRows = (game: number) =>
      conn
        .prepare('SELECT player_id, kind FROM exclusions WHERE game_id = ?')
        .all(game) as { player_id: number; kind: string }[];

    beforeEach(() => {
      // The outer fixture signs 16 players up to its own game; keep these isolated.
      participations.clearSignups(gameId);
    });

    it('excludes the guest when regulars exactly fill the slots', () => {
      const { game, ids } = freshGame(14);
      const guest = namedGuest(game, 'G1', 15, ids[0]);

      const result = service.commit(game);
      expect(result.oversubscribed).toBe(false);
      expect(result.entries.filter(e => e.playing)).toHaveLength(14);
      expect(exclusionRows(game)).toEqual([
        { player_id: guest, kind: 'points' },
      ]);
      expect(entryRows(game).filter(e => e.playing)).toHaveLength(14);
    });

    it("runs the organiser's example: 11 regulars, 4 guests, 14 slots", () => {
      const { game, ids } = freshGame(11);
      namedGuest(game, 'Adri', 8, ids[0]);
      const ruben = namedGuest(game, 'Ruben', 14, ids[1]);
      namedGuest(game, 'Juan', 13, ids[2]);
      guests.put(game, {
        position: 12,
        player_id: null,
        host_player_id: ids[3],
      });

      const result = service.commit(game);

      expect(result.entries).toHaveLength(15);
      expect(result.entries.filter(e => e.playing)).toHaveLength(14);
      // 11 regulars + Adri + the anonymous +1 + Juan are in; Ruben (14th to arrive) is out.
      const rows = entryRows(game);
      expect(rows).toHaveLength(14); // the anonymous guest is never stored
      expect(rows.filter(r => r.outcome === 'called_up')).toHaveLength(13);
      expect(rows.filter(r => r.outcome === 'excluded')).toHaveLength(1);
      expect(exclusionRows(game)).toEqual([
        { player_id: ruben, kind: 'points' },
      ]);
      expect(result.entries.find(e => e.playerId < 0)).toMatchObject({
        playing: true,
        outcome: 'called_up',
      });
    });

    it('ranks guests with everyone once regulars alone overflow the slots', () => {
      const { game, ids } = freshGame(15);
      const star = namedGuest(game, 'Star', 16, ids[0]);
      guests.put(game, {
        position: 17,
        player_id: null,
        host_player_id: ids[1],
      });
      // Give the guest points no regular can match: three paid games.
      const earlier = games.create(seasonId, '2025-09-01').id;
      const earlier2 = games.create(seasonId, '2025-09-02').id;
      const earlier3 = games.create(seasonId, '2025-09-03').id;
      for (const g of [earlier, earlier2, earlier3]) {
        participations.set(g, star, { played: true, paid_cents: 500 });
      }

      const result = service.commit(game);

      expect(result.oversubscribed).toBe(true);
      const starEntry = result.entries.find(e => e.playerId === star)!;
      expect(starEntry.position).toBe(1);
      expect(starEntry.playing).toBe(true);
      // Three people are cut (16 real + 1 anonymous = 17 for 14 slots); the
      // anonymous guest, at zero points, is among them but is never stored.
      const stored = entryRows(game);
      expect(stored.every(r => r.player_id > 0)).toBe(true);
      expect(stored).toHaveLength(16);
      expect(exclusionRows(game).every(r => r.player_id > 0)).toBe(true);
      expect(result.entries.find(e => e.playerId < 0)).toBeDefined();
    });

    it('leaves participations.played untouched on both branches', () => {
      const small = freshGame(5);
      service.commit(small.game);
      expect(participations.list(small.game).every(p => p.played === 0)).toBe(
        true
      );

      const big = freshGame(16);
      service.commit(big.game);
      expect(participations.list(big.game).every(p => p.played === 0)).toBe(
        true
      );
    });

    it('requires captured seniority only when regulars overflow the slots', () => {
      const big = freshGame(14);
      const stranger = conn
        .prepare("INSERT INTO players (name) VALUES ('Nuevo')")
        .run();
      const strangerId = Number(stranger.lastInsertRowid);
      participations.set(big.game, strangerId, { signed_up: true });

      expect(() => service.preview(big.game)).toThrow(/Nuevo/);
      expect(() => service.commit(big.game)).toThrow(/Nuevo/);

      const small = freshGame(3);
      participations.set(small.game, strangerId, { signed_up: true });
      expect(() => service.commit(small.game)).not.toThrow();
      expect(service.preview(small.game).entries.map(e => e.name)).toContain(
        'Nuevo'
      );
    });
  });
});
