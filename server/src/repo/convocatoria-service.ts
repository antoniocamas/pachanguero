import type Database from 'better-sqlite3';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import type {
  Contender,
  ConvocatoriaResult,
  SeasonRules,
} from '../domain/types.js';
import { GameRepository, type GameRow } from './game-repository.js';
import {
  ParticipationRepository,
  type ParticipationRow,
} from './participation-repository.js';
import type {
  GuestCandidateRepository,
  GuestCandidateRow,
} from './guest-candidate-repository.js';
import type { PlayerRepository } from './player-repository.js';
import type { GuestSlotAllocator } from '../domain/guest-slot-allocator.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { StandingsService } from './standings-service.js';
import { SeasonRepository } from './season-repository.js';

export class ConvocatoriaService {
  constructor(
    private readonly games: GameRepository,
    private readonly participations: ParticipationRepository,
    private readonly exclusions: ExclusionRepository,
    private readonly standings: StandingsService,
    private readonly builder: ConvocatoriaBuilder,
    private readonly seasons: SeasonRepository,
    private readonly guests: GuestCandidateRepository,
    private readonly players: PlayerRepository,
    private readonly allocator: GuestSlotAllocator,
    private readonly conn: Database.Database
  ) {}

  /**
   * Run selection for a game without persisting it. While regulars alone fit
   * the slots, everyone regular is in and guests fill what is left by arrival
   * order; once regulars alone overflow, everybody is ranked by points.
   */
  preview(gameId: number): ConvocatoriaResult & { game: GameRow } {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`No game ${gameId}`);

    const rules = this.rulesOf(game);
    const signedUp = this.participations
      .list(gameId)
      .filter(p => p.signed_up === 1);
    const guestRows = this.guests.list(gameId);
    const namedGuestIds = new Set(
      guestRows.flatMap(g => (g.player_id === null ? [] : [g.player_id]))
    );
    const regulars = signedUp.filter(p => !namedGuestIds.has(p.player_id));

    const result =
      regulars.length <= rules.slots
        ? this.byArrival(game, signedUp, regulars.length, guestRows, rules)
        : this.byPoints(game, signedUp, guestRows, rules);
    return { ...result, game };
  }

  /** Run selection and write the outcome: frozen entries plus exclusion marks. */
  commit(gameId: number): ConvocatoriaResult & { game: GameRow } {
    const preview = this.preview(gameId);
    const game = preview.game;

    this.conn.transaction(() => {
      this.conn
        .prepare('DELETE FROM convocatorias WHERE game_id = ?')
        .run(gameId);
      const info = this.conn
        .prepare(
          'INSERT INTO convocatorias (game_id, rules_json) VALUES (?, ?)'
        )
        .run(gameId, JSON.stringify(this.rulesOf(game)));
      const cid = Number(info.lastInsertRowid);

      const insert = this.conn.prepare(
        `INSERT INTO convocatoria_entries
           (convocatoria_id, player_id, position, points, wait_counter, outcome, playing)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      this.conn.prepare('DELETE FROM exclusions WHERE game_id = ?').run(gameId);

      for (const e of preview.entries) {
        // Anonymous guests have no player to record anything against.
        if (e.playerId < 0) continue;
        insert.run(
          cid,
          e.playerId,
          e.position,
          e.points,
          e.waitCounter,
          e.outcome,
          e.playing ? 1 : 0
        );
        if (e.outcome === 'mercy')
          this.exclusions.set(gameId, e.playerId, 'mercy');
        else if (e.outcome === 'demoted')
          this.exclusions.set(gameId, e.playerId, 'demoted');
        else if (e.outcome === 'excluded')
          this.exclusions.set(gameId, e.playerId, 'points');
        // Whether anyone actually played is the final list's to say, not this selection's.
      }
    })();

    return preview;
  }

  saved(gameId: number) {
    const head = this.conn
      .prepare('SELECT * FROM convocatorias WHERE game_id = ?')
      .get(gameId) as
      { id: number; rules_json: string; created_at: string } | undefined;
    if (!head) return null;
    const entries = this.conn
      .prepare(
        `SELECT ce.*, p.name FROM convocatoria_entries ce JOIN players p ON p.id = ce.player_id
          WHERE ce.convocatoria_id = ? ORDER BY ce.position`
      )
      .all(head.id);
    return { ...head, rules: JSON.parse(head.rules_json), entries };
  }

  /** Regulars all play; guests take the remaining slots in order of arrival. */
  private byArrival(
    game: GameRow,
    signedUp: ParticipationRow[],
    regularsCount: number,
    guestRows: GuestCandidateRow[],
    rules: SeasonRules
  ): ConvocatoriaResult {
    const points = this.pointsOf(game);
    const namedGuestIds = new Set(guestRows.map(g => g.player_id));
    const regulars = signedUp
      .filter(p => !namedGuestIds.has(p.player_id))
      .map(p => ({
        playerId: p.player_id,
        name: p.name,
        points: points.get(p.player_id) ?? 0,
      }))
      .sort(
        (a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es')
      );

    const { calledUp, excluded } = this.allocator.allocate(
      regularsCount,
      guestRows,
      rules.slots
    );
    const names = this.nameLookup(signedUp);
    const guestEntry = (g: GuestCandidateRow, playing: boolean) => ({
      playerId: g.player_id ?? -g.position,
      name:
        g.player_id === null
          ? `Invitado de ${names.get(g.host_player_id) ?? '?'}`
          : (names.get(g.player_id) ?? '?'),
      points: g.player_id === null ? 0 : (points.get(g.player_id) ?? 0),
      playing,
    });

    const ordered = [
      ...regulars.map(r => ({ ...r, playing: true })),
      ...calledUp.map(g => guestEntry(g, true)),
      ...excluded.map(g => guestEntry(g, false)),
    ];
    return {
      entries: ordered.map((e, i) => ({
        ...e,
        position: i + 1,
        outcome: e.playing ? 'called_up' : 'excluded',
        waitCounter: 0,
      })),
      swaps: [],
      oversubscribed: false,
    };
  }

  /**
   * Everyone competes on points. Anonymous guests join as zero-point
   * stand-ins with negative ids, which no real player can have.
   */
  private byPoints(
    game: GameRow,
    signedUp: ParticipationRow[],
    guestRows: GuestCandidateRow[],
    rules: SeasonRules
  ): ConvocatoriaResult {
    const table = this.standings.standings(game.season_id, game.id);
    const enrolled = new Set(table.map(s => s.playerId));
    const missing = signedUp.filter(p => !enrolled.has(p.player_id));
    if (missing.length) {
      throw new Error(
        `Falta la antigüedad de: ${missing.map(p => p.name).join(', ')}`
      );
    }

    const signedIds = new Set(signedUp.map(p => p.player_id));
    const names = this.nameLookup(signedUp);
    const contenders: Contender[] = [
      ...table
        .filter(s => signedIds.has(s.playerId))
        .map(s => ({ playerId: s.playerId, name: s.name, points: s.points })),
      ...guestRows
        .filter(g => g.player_id === null)
        .map(g => ({
          playerId: -g.position,
          name: `Invitado de ${names.get(g.host_player_id) ?? '?'}`,
          points: 0,
        })),
    ];
    const history = this.exclusions.historyFor(game.season_id, game.id);
    return this.builder.build(contenders, history, rules);
  }

  private pointsOf(game: GameRow): Map<number, number> {
    return new Map(
      this.standings
        .standings(game.season_id, game.id)
        .map(s => [s.playerId, s.points])
    );
  }

  private nameLookup(signedUp: ParticipationRow[]): Map<number, string> {
    const names = new Map(signedUp.map(p => [p.player_id, p.name]));
    for (const p of this.players.listAll()) {
      if (!names.has(p.id)) names.set(p.id, p.name);
    }
    return names;
  }

  private rulesOf(game: GameRow): SeasonRules {
    return this.seasons.rulesOf(this.seasons.get(game.season_id)!);
  }
}
