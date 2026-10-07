import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import { GameLifecycle } from '../domain/game-lifecycle.js';
import { GuestSlotAllocator } from '../domain/guest-slot-allocator.js';
import { PointsCalculator } from '../domain/points.js';
import { TestDatabase } from '../db/test-support.js';
import { ConvocatoriaHistoryConverter } from './convocatoria-history-converter.js';
import { ConvocatoriaRepository } from './convocatoria-repository.js';
import { ConvocatoriaService } from './convocatoria-service.js';
import { DebtRepository } from './debt-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { GameLifecycleService } from './game-lifecycle-service.js';
import { GameRepository, type GameRow } from './game-repository.js';
import { GuestCandidateRepository } from './guest-candidate-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { PlayerRepository } from './player-repository.js';
import { SeasonRepository } from './season-repository.js';
import { StandingsService } from './standings-service.js';

describe('ConvocatoriaHistoryConverter', () => {
  let conn: Database.Database;
  let games: GameRepository;
  let players: PlayerRepository;
  let participations: ParticipationRepository;
  let convocatorias: ConvocatoriaRepository;
  let standings: StandingsService;
  let converter: ConvocatoriaHistoryConverter;
  let seasonId: number;
  let day = 0;

  const date = () => `2025-10-${String(++day).padStart(2, '0')}`;
  /** A played game on which `signed` people signed up and the first `played` of them played. */
  const playedGame = (
    pool: number[],
    signed: number,
    played = signed,
    status: GameRow['status'] = 'played'
  ) => {
    const id = games.create(seasonId, date(), null, status).id;
    pool.slice(0, signed).forEach((playerId, i) =>
      participations.set(id, playerId, {
        signed_up: true,
        played: i < played,
      })
    );
    return id;
  };
  const roster = (count: number) =>
    Array.from(
      { length: count },
      (_, i) =>
        players.add(seasonId, `J${String(i + 1).padStart(2, '0')}`, 1).id
    );
  const dump = () => ({
    participations: conn
      .prepare('SELECT * FROM participations ORDER BY 1,2')
      .all(),
    exclusions: conn.prepare('SELECT * FROM exclusions ORDER BY 1,2').all(),
    payments: conn.prepare('SELECT * FROM payments ORDER BY id').all(),
    debts: conn.prepare('SELECT * FROM share_debts ORDER BY id').all(),
    games: conn.prepare('SELECT * FROM games ORDER BY id').all(),
    standings: standings.standings(seasonId),
  });

  beforeEach(() => {
    day = 0;
    conn = TestDatabase.create();
    const seasons = new SeasonRepository(conn);
    players = new PlayerRepository(conn);
    games = new GameRepository(conn);
    participations = new ParticipationRepository(conn);
    convocatorias = new ConvocatoriaRepository(conn);
    const exclusions = new ExclusionRepository(conn);
    standings = new StandingsService(
      players,
      exclusions,
      new DebtRepository(conn),
      new PointsCalculator(),
      conn
    );
    const service = new ConvocatoriaService(
      games,
      participations,
      exclusions,
      standings,
      new ConvocatoriaBuilder(),
      seasons,
      new GuestCandidateRepository(conn),
      players,
      new GuestSlotAllocator(),
      convocatorias,
      new GameLifecycleService(
        games,
        new GameLifecycle(),
        new DebtRepository(conn),
        [],
        conn
      )
    );
    converter = new ConvocatoriaHistoryConverter(
      games,
      convocatorias,
      service,
      conn
    );
    seasonId = seasons.create({ name: '2025/2026', slots: 14 }).id;
  });

  it.each([
    [16, 14],
    [15, 14],
    [14, 14],
    [10, 10],
  ])(
    'stores a confirmed history convocatoria with %i signed up and %i playing',
    (signed, playing) => {
      const game = playedGame(roster(16), signed);

      const result = converter.convertSeason(seasonId);

      expect(result.converted).toEqual([game]);
      const stored = convocatorias.find(game)!;
      expect(stored.source).toBe('history');
      expect(stored.confirmed_at).not.toBeNull();
      expect(stored.entries).toHaveLength(signed);
      expect(stored.entries.filter(e => e.playing === 1)).toHaveLength(playing);
    }
  );

  it('changes no history column and no standing, and leaves every game in its state', () => {
    const pool = roster(16);
    playedGame(pool, 16, 14);
    playedGame(pool, 12);
    games.create(seasonId, date(), null, 'cancelled', 'open');
    games.create(seasonId, date());
    const before = dump();

    converter.convertSeason(seasonId);

    expect(dump()).toEqual(before);
  });

  it('keeps played = 1 for someone the selection left out, and stores them as excluded', () => {
    const pool = roster(16);
    // All 16 signed up and all 16 played: the algorithm leaves two out.
    const game = playedGame(pool, 16, 16);

    converter.convertSeason(seasonId);

    const left = convocatorias
      .find(game)!
      .entries.filter(e => e.outcome === 'excluded');
    expect(left).toHaveLength(2);
    for (const e of left) {
      const row = participations
        .list(game)
        .find(p => p.player_id === e.player_id)!;
      expect(row.played).toBe(1);
    }
  });

  it('skips cancelled and open games, and a second run adds nothing', () => {
    const pool = roster(14);
    const played = playedGame(pool, 14);
    const cancelled = games.create(
      seasonId,
      date(),
      null,
      'cancelled',
      'open'
    ).id;
    const open = games.create(seasonId, date()).id;

    const first = converter.convertSeason(seasonId);
    expect(first.converted).toEqual([played]);
    expect(first.skipped).toEqual([cancelled, open]);
    expect(convocatorias.find(cancelled)).toBeNull();
    expect(convocatorias.find(open)).toBeNull();
    expect(games.get(cancelled)!.status).toBe('cancelled');

    const snapshot = convocatorias.find(played);
    const second = converter.convertSeason(seasonId);
    expect(second.converted).toEqual([]);
    expect(convocatorias.find(played)).toEqual(snapshot);
  });

  it('ranks a game with the payments made before it, not the ones made after', () => {
    const pool = roster(15);
    const [early, ...rest] = pool;
    const last = pool[14];
    // Game 1: only `early` paid. Game 2 overflows (15 > 14 slots). Game 3: `last` paid.
    const g1 = games.create(seasonId, date()).id;
    games.setState(g1, 'played');
    participations.set(g1, early, {
      signed_up: true,
      played: true,
      paid_cents: 400,
    });
    const g2 = playedGame(pool, 15, 14);
    const g3 = games.create(seasonId, date(), null, 'played').id;
    participations.set(g3, last, {
      signed_up: true,
      played: true,
      paid_cents: 400,
    });
    void rest;

    converter.convertSeason(seasonId);

    const entries = convocatorias.find(g2)!.entries;
    const pointsOf = (id: number) =>
      entries.find(e => e.player_id === id)!.points;
    expect(pointsOf(early)).toBeGreaterThan(pointsOf(last));
    expect(pointsOf(last)).toBe(pointsOf(pool[1]));
  });

  it('fails loudly naming the game, and undoes the whole conversion', () => {
    const pool = roster(14);
    const fine = playedGame(pool, 14);
    // 15 sign-ups, one of them with no seniority row: the selection cannot rank them.
    const stranger = Number(
      conn.prepare("INSERT INTO players (name) VALUES ('Nuevo')").run()
        .lastInsertRowid
    );
    const broken = playedGame([...pool, stranger], 15);

    expect(() => converter.convertSeason(seasonId)).toThrow(
      new RegExp(`partido ${broken} .*Nuevo`)
    );
    expect(convocatorias.find(fine)).toBeNull();
    expect(convocatorias.find(broken)).toBeNull();
  });
});
