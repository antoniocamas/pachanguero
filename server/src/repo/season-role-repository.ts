import type Database from 'better-sqlite3';
import type { SeasonRole } from '../domain/season-role.js';

/** SQL only: the role written for a player in a season, and the facts its rules read. */
export class SeasonRoleRepository {
  constructor(private readonly conn: Database.Database) {}

  get(seasonId: number, playerId: number): SeasonRole | null {
    const row = this.conn
      .prepare(
        'SELECT role FROM season_roles WHERE season_id = ? AND player_id = ?'
      )
      .get(seasonId, playerId) as { role: SeasonRole } | undefined;
    return row?.role ?? null;
  }

  /** Every role written for the season. */
  listForSeason(seasonId: number): Map<number, SeasonRole> {
    const rows = this.conn
      .prepare('SELECT player_id, role FROM season_roles WHERE season_id = ?')
      .all(seasonId) as { player_id: number; role: SeasonRole }[];
    return new Map(rows.map(r => [r.player_id, r.role]));
  }

  /** Each player's role in their latest season that starts before this one and has one written. */
  listPrevious(seasonId: number): Map<number, SeasonRole> {
    const rows = this.conn
      .prepare(
        `SELECT r.player_id, r.role
           FROM season_roles r JOIN seasons s ON s.id = r.season_id
          WHERE s.starts_on < (SELECT starts_on FROM seasons WHERE id = @seasonId)
            AND s.starts_on = (
              SELECT MAX(s2.starts_on) FROM season_roles r2 JOIN seasons s2 ON s2.id = r2.season_id
               WHERE r2.player_id = r.player_id
                 AND s2.starts_on < (SELECT starts_on FROM seasons WHERE id = @seasonId))`
      )
      .all({ seasonId }) as { player_id: number; role: SeasonRole }[];
    return new Map(rows.map(r => [r.player_id, r.role]));
  }

  set(seasonId: number, playerId: number, role: SeasonRole): void {
    this.conn
      .prepare(
        `INSERT INTO season_roles (season_id, player_id, role) VALUES (?, ?, ?)
         ON CONFLICT (season_id, player_id) DO UPDATE SET role = excluded.role`
      )
      .run(seasonId, playerId, role);
  }

  /** Writes the role only where the season has none yet. */
  setIfMissing(seasonId: number, playerId: number, role: SeasonRole): void {
    this.conn
      .prepare(
        'INSERT OR IGNORE INTO season_roles (season_id, player_id, role) VALUES (?, ?, ?)'
      )
      .run(seasonId, playerId, role);
  }

  /** Whether the player played a played game of the season without being anyone's guest in it. */
  playedAsFijo(seasonId: number, playerId: number): boolean {
    return (
      this.conn
        .prepare(
          `SELECT 1 FROM participations p JOIN games g ON g.id = p.game_id
            WHERE g.season_id = ? AND p.player_id = ? AND p.played = 1 AND g.status = 'played'
              AND NOT EXISTS (SELECT 1 FROM guest_candidates gc
                               WHERE gc.game_id = p.game_id AND gc.player_id = p.player_id)
            LIMIT 1`
        )
        .get(seasonId, playerId) !== undefined
    );
  }
}
