import type Database from 'better-sqlite3';
import { SeniorityAdvisor } from '../domain/seniority-advisor.js';

export interface PlayerRow {
  id: number;
  name: string;
  seasons: number;
}

export class PlayerRepository {
  private readonly advisor = new SeniorityAdvisor();

  constructor(private readonly conn: Database.Database) {}

  nameOf(playerId: number): string | undefined {
    const row = this.conn
      .prepare('SELECT name FROM players WHERE id = ?')
      .get(playerId) as { name: string } | undefined;
    return row?.name;
  }

  /** Whether the player already has a row in this season. */
  hasAppeared(seasonId: number, playerId: number): boolean {
    return !!this.conn
      .prepare(
        'SELECT 1 FROM season_players WHERE season_id = ? AND player_id = ?'
      )
      .get(seasonId, playerId);
  }

  /**
   * Seniority to propose for a first appearance: continues from the player's
   * most recent other season (by calendar), or 0 if they have none.
   */
  suggestSeniority(seasonId: number, playerId: number): number {
    const last = this.conn
      .prepare(
        `SELECT sp.seasons
           FROM season_players sp JOIN seasons s ON s.id = sp.season_id
          WHERE sp.player_id = ? AND sp.season_id <> ?
          ORDER BY s.starts_on DESC LIMIT 1`
      )
      .get(playerId, seasonId) as { seasons: number } | undefined;
    return this.advisor.suggest(last?.seasons ?? null);
  }

  list(seasonId: number): PlayerRow[] {
    return this.conn
      .prepare(
        `SELECT p.id, p.name, sp.seasons
           FROM season_players sp JOIN players p ON p.id = sp.player_id
          WHERE sp.season_id = ?
          ORDER BY p.name COLLATE NOCASE`
      )
      .all(seasonId) as PlayerRow[];
  }

  /**
   * Create the player if new, then enrol them in the season. Idempotent: an
   * existing enrolment keeps its seniority.
   */
  add(seasonId: number, name: string, seasons: number): PlayerRow {
    return this.conn.transaction(() => {
      this.conn
        .prepare('INSERT OR IGNORE INTO players (name) VALUES (?)')
        .run(name.trim());
      const { id } = this.conn
        .prepare('SELECT id FROM players WHERE name = ?')
        .get(name.trim()) as {
        id: number;
      };
      this.conn
        .prepare(
          `INSERT INTO season_players (season_id, player_id, seasons) VALUES (?, ?, ?)
           ON CONFLICT (season_id, player_id) DO NOTHING`
        )
        .run(seasonId, id, seasons);
      return this.conn
        .prepare(
          `SELECT p.id, p.name, sp.seasons
             FROM season_players sp JOIN players p ON p.id = sp.player_id
            WHERE sp.season_id = ? AND p.id = ?`
        )
        .get(seasonId, id) as PlayerRow;
    })();
  }

  updateSeasonPlayer(
    seasonId: number,
    playerId: number,
    patch: { seasons?: number }
  ): void {
    if (patch.seasons !== undefined) {
      this.conn
        .prepare(
          'UPDATE season_players SET seasons = ? WHERE season_id = ? AND player_id = ?'
        )
        .run(patch.seasons, seasonId, playerId);
    }
  }
}
