import type Database from 'better-sqlite3';

/** What a player did in a season, counted for the players table. */
export interface PlayerActivity {
  played: number;
  asGuest: number;
  lastPlayedOn: string | null;
}

/** SQL only: per-season counts the players table shows beside each player. */
export class PlayerActivityRepository {
  constructor(private readonly conn: Database.Database) {}

  /** Games each player played in the season's played games, and how many of them as a guest. */
  bySeason(seasonId: number): Map<number, PlayerActivity> {
    const rows = this.conn
      .prepare(
        `SELECT p.player_id AS playerId, COUNT(*) AS played,
                SUM(EXISTS (SELECT 1 FROM guest_candidates gc
                             WHERE gc.game_id = p.game_id AND gc.player_id = p.player_id)) AS asGuest,
                MAX(g.played_on) AS lastPlayedOn
           FROM participations p JOIN games g ON g.id = p.game_id
          WHERE g.season_id = ? AND g.status = 'played' AND p.played = 1
          GROUP BY p.player_id`
      )
      .all(seasonId) as ({ playerId: number } & PlayerActivity)[];
    return new Map(
      rows.map(({ playerId, ...activity }) => [playerId, activity])
    );
  }

  /** When each player was registered. */
  createdOn(): Map<number, string> {
    const rows = this.conn
      .prepare('SELECT id, created_at FROM players')
      .all() as { id: number; created_at: string }[];
    return new Map(rows.map(r => [r.id, r.created_at.slice(0, 10)]));
  }
}
