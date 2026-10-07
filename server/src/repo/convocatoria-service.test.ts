import { GameLifecycle } from '../domain/game-lifecycle.js';
import { DebtRepository } from './debt-repository.js';
import { GameLifecycleService } from './game-lifecycle-service.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';
import { GameRepository } from './game-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { StandingsService } from './standings-service.js';
import { ConvocatoriaRepository } from './convocatoria-repository.js';
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
      new DebtRepository(conn),
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
      new ConvocatoriaRepository(conn),
      new GameLifecycleService(
        games,
        new GameLifecycle(),
        new DebtRepository(conn),
        [],
        conn
      )
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

  const stateOf = (id: number) => games.get(id)!.status;
  const signUp = (game: number, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const p = players.add(seasonId, `S${game}-${i}`, 1);
      participations.set(game, p.id, { signed_up: true });
      return p.id;
    });

  describe.each([
    [12, 12, 0],
    [14, 14, 0],
    [16, 14, 2],
  ])('create with %i signed up', (signed, playing, out) => {
    it(`seats ${playing}, leaves ${out} out, writes no exclusion and moves the game to created`, () => {
      const game = games.create(seasonId, '2025-09-22').id;
      signUp(game, signed);

      const result = service.create(game);

      expect(result.entries.filter(e => e.playing)).toHaveLength(playing);
      const saved = service.saved(game)!;
      expect(saved.entries).toHaveLength(signed);
      expect(saved.entries.filter(e => e.outcome === 'excluded')).toHaveLength(
        out
      );
      expect(saved.confirmed_at).toBeNull();
      expect(saved.source).toBe('generated');
      expect(
        conn.prepare('SELECT * FROM exclusions WHERE game_id = ?').all(game)
      ).toEqual([]);
      expect(stateOf(game)).toBe('convocatoria_created');
      // Who actually played is derived when the game is played.
      expect(participations.list(game).every(p => p.played === 0)).toBe(true);
    });
  });

  it('create refuses when nobody is signed up and leaves the game open', () => {
    const game = games.create(seasonId, '2025-09-22').id;
    expect(() => service.create(game)).toThrow('No hay nadie apuntado');
    expect(stateOf(game)).toBe('open');
    expect(service.saved(game)).toBeNull();
  });

  it('create is refused for a played or cancelled game', () => {
    const played = games.create(seasonId, '2025-09-22', null, 'played').id;
    signUp(played, 3);
    expect(() => service.create(played)).toThrow(
      'Reabre el partido para editarlo'
    );
    const cancelled = games.create(
      seasonId,
      '2025-09-29',
      null,
      'cancelled',
      'open'
    ).id;
    signUp(cancelled, 3);
    expect(() => service.create(cancelled)).toThrow(
      'El partido está cancelado'
    );
  });

  it('confirm stamps the convocatoria and leaves its entries as they were', () => {
    service.create(gameId);
    const before = service.saved(gameId)!.entries;

    service.confirm(gameId);

    const after = service.saved(gameId)!;
    expect(stateOf(gameId)).toBe('convocatoria_confirmed');
    expect(after.confirmed_at).not.toBeNull();
    expect(after.entries).toEqual(before);
  });

  it('confirm is refused before the convocatoria exists', () => {
    const game = games.create(seasonId, '2025-09-22').id;
    expect(() => service.confirm(game)).toThrow(
      'Crea la convocatoria antes de confirmarla'
    );
  });

  describe('recreating', () => {
    const handSwap = () => {
      const [first] = service
        .saved(gameId)!
        .entries.filter(e => e.playing === 1);
      conn
        .prepare('UPDATE convocatoria_entries SET playing = 0 WHERE id = ?')
        .run(first.id);
    };

    it('replaces the prior convocatoria rather than accumulating', () => {
      service.create(gameId);
      participations.set(gameId, playerIds[0], { signed_up: false });
      const newcomer = players.add(seasonId, 'P17', 1);
      participations.set(gameId, newcomer.id, { signed_up: true });

      service.create(gameId);

      expect(service.saved(gameId)!.entries).toHaveLength(16);
      expect(
        conn
          .prepare('SELECT * FROM convocatorias WHERE game_id = ?')
          .all(gameId)
      ).toHaveLength(1);
    });

    it('refuses to throw away hand corrections unless told to, from created and from confirmed', () => {
      service.create(gameId);
      handSwap();
      expect(() => service.create(gameId)).toThrow(
        'Se perderán tus correcciones'
      );

      service.confirm(gameId);
      expect(() => service.create(gameId)).toThrow(
        'Se perderán tus correcciones'
      );
      expect(stateOf(gameId)).toBe('convocatoria_confirmed');

      service.create(gameId, { discardEdits: true });
      expect(stateOf(gameId)).toBe('convocatoria_created');
      const saved = service.saved(gameId)!;
      expect(saved.confirmed_at).toBeNull();
      expect(saved.entries.some(e => e.changed_by_hand)).toBe(false);
    });

    it('recreates freely when nothing was changed by hand', () => {
      service.create(gameId);
      service.confirm(gameId);
      expect(() => service.create(gameId)).not.toThrow();
      expect(stateOf(gameId)).toBe('convocatoria_created');
    });
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
          `SELECT ce.player_id, ce.guest_host_player_id, ce.guest_ordinal, ce.outcome, ce.playing
             FROM convocatoria_entries ce
             JOIN convocatorias c ON c.id = ce.convocatoria_id WHERE c.game_id = ?`
        )
        .all(game) as {
        player_id: number | null;
        guest_host_player_id: number | null;
        guest_ordinal: number | null;
        outcome: string;
        playing: number;
      }[];

    beforeEach(() => {
      // The outer fixture signs 16 players up to its own game; keep these isolated.
      participations.clearSignups(gameId);
    });

    it('excludes the guest when regulars exactly fill the slots', () => {
      const { game, ids } = freshGame(14);
      const guest = namedGuest(game, 'G1', 15, ids[0]);

      const result = service.create(game);
      expect(result.oversubscribed).toBe(false);
      expect(result.entries.filter(e => e.playing)).toHaveLength(14);
      expect(entryRows(game).filter(e => e.playing)).toHaveLength(14);
      expect(entryRows(game).find(e => e.player_id === guest)).toMatchObject({
        outcome: 'excluded',
        playing: 0,
      });
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

      const result = service.create(game);

      expect(result.entries).toHaveLength(15);
      expect(result.entries.filter(e => e.playing)).toHaveLength(14);
      // 11 regulars + Adri + the anonymous +1 + Juan are in; Ruben (14th to arrive) is out.
      const rows = entryRows(game);
      expect(rows).toHaveLength(15); // the anonymous guest is an entry too
      expect(rows.filter(r => r.outcome === 'called_up')).toHaveLength(14);
      expect(rows.filter(r => r.outcome === 'excluded')).toHaveLength(1);
      expect(rows.find(r => r.player_id === ruben)).toMatchObject({
        outcome: 'excluded',
        playing: 0,
      });
      expect(rows.find(r => r.player_id === null)).toMatchObject({
        guest_host_player_id: ids[3],
        guest_ordinal: 1,
        playing: 1,
      });
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

      const result = service.create(game);

      expect(result.oversubscribed).toBe(true);
      const starEntry = result.entries.find(e => e.playerId === star)!;
      expect(starEntry.position).toBe(1);
      expect(starEntry.playing).toBe(true);
      // Three people are cut (16 real + 1 anonymous = 17 for 14 slots); the
      // anonymous guest, at zero points, is among them but is never stored.
      const stored = entryRows(game);
      expect(stored).toHaveLength(17);
      expect(stored.filter(r => r.player_id === null)).toHaveLength(1);
      expect(stored.filter(r => r.playing === 1)).toHaveLength(14);
      expect(result.entries.find(e => e.playerId < 0)).toBeDefined();
    });

    it('leaves participations.played untouched on both branches', () => {
      const small = freshGame(5);
      service.create(small.game);
      expect(participations.list(small.game).every(p => p.played === 0)).toBe(
        true
      );

      const big = freshGame(16);
      service.create(big.game);
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
      expect(() => service.create(big.game)).toThrow(/Nuevo/);

      const small = freshGame(3);
      participations.set(small.game, strangerId, { signed_up: true });
      expect(() => service.create(small.game)).not.toThrow();
      expect(service.preview(small.game).entries.map(e => e.name)).toContain(
        'Nuevo'
      );
    });
  });
});
