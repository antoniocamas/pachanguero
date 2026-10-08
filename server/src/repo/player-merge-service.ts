import type Database from 'better-sqlite3';
import type { AliasRepository } from './alias-repository.js';
import type { PlayerRepository } from './player-repository.js';

/** Every column that holds a player id, and so moves with a merge. */
const REFERENCES: readonly [table: string, column: string][] = [
  ['participations', 'player_id'],
  ['guest_candidates', 'player_id'],
  ['guest_candidates', 'host_player_id'],
  ['candidate_lines', 'name_player_id'],
  ['candidate_lines', 'host_player_id'],
  ['exclusions', 'player_id'],
  ['convocatoria_entries', 'player_id'],
  ['convocatoria_entries', 'guest_host_player_id'],
  ['share_debts', 'holder_player_id'],
  ['share_debts', 'beneficiary_player_id'],
  ['payments', 'holder_player_id'],
  ['payments', 'beneficiary_player_id'],
  ['payments', 'payer_player_id'],
];

/** Where one player's per-game rows would collide with the other's. */
const OVERLAPS = `
  SELECT DISTINCT g.played_on AS playedOn FROM games g WHERE g.id IN (
    SELECT a.game_id FROM participations a JOIN participations b
        ON a.game_id = b.game_id AND a.player_id = @from AND b.player_id = @into
    UNION SELECT a.game_id FROM exclusions a JOIN exclusions b
        ON a.game_id = b.game_id AND a.player_id = @from AND b.player_id = @into
    UNION SELECT c.game_id FROM convocatoria_entries a
        JOIN convocatoria_entries b ON a.convocatoria_id = b.convocatoria_id
        JOIN convocatorias c ON c.id = a.convocatoria_id
       WHERE a.player_id = @from AND b.player_id = @into
  ) ORDER BY g.played_on`;

/**
 * Folds one player into another when they turn out to be the same person: the
 * absorbed player's games, payments, debts and aliases become the survivor's,
 * and their name is kept as an alias so pasted lists keep matching. Refused,
 * with nothing changed, when both took part in the same game: there is no
 * telling which row is right.
 */
export class PlayerMergeService {
  constructor(
    private readonly players: PlayerRepository,
    private readonly aliases: AliasRepository,
    private readonly conn: Database.Database
  ) {}

  merge(intoId: number, fromId: number): void {
    if (intoId === fromId) throw new Error('Choose two different players');
    const into = this.players.nameOf(intoId);
    const from = this.players.nameOf(fromId);
    if (!into) throw new Error(`Unknown player: ${intoId}`);
    if (!from) throw new Error(`Unknown player: ${fromId}`);
    this.refuseSharedGames(intoId, fromId, into, from);

    try {
      this.conn.transaction(() => {
        this.mergeSeasons(intoId, fromId);
        this.mergeIntroducers(intoId, fromId);
        for (const [table, column] of REFERENCES) {
          this.conn
            .prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`)
            .run(intoId, fromId);
        }
        for (const { alias } of this.aliases
          .listAll()
          .filter(a => a.playerId === fromId)) {
          this.aliases.add(intoId, alias);
        }
        this.aliases.add(intoId, from);
        // Cascades whatever was left (the absorbed player's own seasons rows).
        this.conn.prepare('DELETE FROM players WHERE id = ?').run(fromId);
      })();
    } catch (e) {
      if ((e as { code?: string }).code?.startsWith('SQLITE_CONSTRAINT')) {
        throw new Error(
          `No se puede fundir ${from} con ${into}: aparecen los dos en el mismo partido o pago`,
          { cause: e }
        );
      }
      throw e;
    }
  }

  private refuseSharedGames(
    intoId: number,
    fromId: number,
    into: string,
    from: string
  ): void {
    const shared = this.conn
      .prepare(OVERLAPS)
      .all({ from: fromId, into: intoId }) as { playedOn: string }[];
    if (shared.length) {
      throw new Error(
        `No se puede fundir ${from} con ${into}: aparecen los dos en ${shared
          .map(g => g.playedOn)
          .join(', ')}`
      );
    }
  }

  /** In a season both are in, the larger seniority stands. */
  private mergeSeasons(intoId: number, fromId: number): void {
    this.conn
      .prepare(
        `INSERT INTO season_players (season_id, player_id, seasons)
         SELECT season_id, @into, seasons FROM season_players WHERE player_id = @from
         ON CONFLICT (season_id, player_id)
         DO UPDATE SET seasons = MAX(season_players.seasons, excluded.seasons)`
      )
      .run({ into: intoId, from: fromId });
  }

  /** Who introduced them follows the person, never pointing at themselves. */
  private mergeIntroducers(intoId: number, fromId: number): void {
    this.conn
      .prepare(
        `UPDATE players SET introduced_by = (
           SELECT introduced_by FROM players WHERE id = @from)
          WHERE id = @into AND introduced_by IS NULL`
      )
      .run({ into: intoId, from: fromId });
    this.conn
      .prepare(
        'UPDATE players SET introduced_by = @into WHERE introduced_by = @from'
      )
      .run({ into: intoId, from: fromId });
    this.conn
      .prepare(
        'UPDATE players SET introduced_by = NULL WHERE id = @into AND introduced_by = @into'
      )
      .run({ into: intoId });
  }
}
