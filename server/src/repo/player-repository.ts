import type Database from 'better-sqlite3';

export interface PlayerRow {
  id: number;
  name: string;
  seasons: number;
  active: number;
}

export class PlayerRepository {
  constructor(private readonly conn: Database.Database) {}

  list(seasonId: number): PlayerRow[] {
    return this.conn
      .prepare(
        `SELECT p.id, p.name, sp.seasons, sp.active
           FROM season_players sp JOIN players p ON p.id = sp.player_id
          WHERE sp.season_id = ?
          ORDER BY p.name COLLATE NOCASE`
      )
      .all(seasonId) as PlayerRow[];
  }

  /** Create the player if new, then enrol them in the season. Idempotent. */
  add(seasonId: number, name: string, seasons = 1): PlayerRow {
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
           ON CONFLICT (season_id, player_id) DO UPDATE SET seasons = excluded.seasons, active = 1`
        )
        .run(seasonId, id, seasons);
      return this.conn
        .prepare(
          `SELECT p.id, p.name, sp.seasons, sp.active
             FROM season_players sp JOIN players p ON p.id = sp.player_id
            WHERE sp.season_id = ? AND p.id = ?`
        )
        .get(seasonId, id) as PlayerRow;
    })();
  }

  updateSeasonPlayer(
    seasonId: number,
    playerId: number,
    patch: { seasons?: number; active?: boolean }
  ): void {
    if (patch.seasons !== undefined) {
      this.conn
        .prepare(
          'UPDATE season_players SET seasons = ? WHERE season_id = ? AND player_id = ?'
        )
        .run(patch.seasons, seasonId, playerId);
    }
    if (patch.active !== undefined) {
      this.conn
        .prepare(
          'UPDATE season_players SET active = ? WHERE season_id = ? AND player_id = ?'
        )
        .run(patch.active ? 1 : 0, seasonId, playerId);
    }
  }
}
