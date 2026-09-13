import type Database from 'better-sqlite3';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import type {
  Contender,
  ConvocatoriaResult,
  SeasonRules,
} from '../domain/types.js';
import { GameRepository, type GameRow } from './game-repository.js';
import { ParticipationRepository } from './participation-repository.js';
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
    private readonly conn: Database.Database
  ) {}

  /** Run selection for a game without persisting it. */
  preview(gameId: number): ConvocatoriaResult & { game: GameRow } {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`No game ${gameId}`);

    const signedUp = this.conn
      .prepare(
        `SELECT pa.player_id FROM participations pa WHERE pa.game_id = ? AND pa.signed_up = 1`
      )
      .all(gameId) as Array<{ player_id: number }>;
    const signedIds = new Set(signedUp.map(r => r.player_id));

    const table = this.standings.standings(game.season_id, gameId);
    const contenders: Contender[] = table
      .filter(s => signedIds.has(s.playerId))
      .map(s => ({ playerId: s.playerId, name: s.name, points: s.points }));

    const history = this.exclusions.historyFor(game.season_id, gameId);
    const result = this.builder.build(contenders, history, this.rulesOf(game));
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
        // Only those who play are marked as playing; payment is recorded later.
        this.participations.set(gameId, e.playerId, { played: e.playing });
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

  private rulesOf(game: GameRow): SeasonRules {
    return this.seasons.rulesOf(this.seasons.get(game.season_id)!);
  }
}
