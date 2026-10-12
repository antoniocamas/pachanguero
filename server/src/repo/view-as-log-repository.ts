import type Database from 'better-sqlite3';

export interface ViewAsEntry {
  at: Date;
  admin: string;
  playerId: number;
  playerName: string;
}

interface Row {
  started_at: string;
  username: string;
  player_id: number;
  player_name: string;
}

/** The trace of an admin looking at the app as another player. Entries are only ever added. */
export class ViewAsLogRepository {
  constructor(private readonly conn: Database.Database) {}

  record(
    adminUserId: number,
    playerId: number,
    playerName: string,
    at: Date
  ): void {
    this.conn
      .prepare(
        'INSERT INTO view_as_log (admin_user_id, player_id, player_name, started_at) VALUES (?, ?, ?, ?)'
      )
      .run(adminUserId, playerId, playerName, at.toISOString());
  }

  /** The latest entries, newest first. */
  recent(limit: number): ViewAsEntry[] {
    const rows = this.conn
      .prepare(
        `SELECT l.started_at, u.username, l.player_id, l.player_name
           FROM view_as_log l JOIN users u ON u.id = l.admin_user_id
          ORDER BY l.id DESC LIMIT ?`
      )
      .all(limit) as Row[];
    return rows.map(row => ({
      at: new Date(row.started_at),
      admin: row.username,
      playerId: row.player_id,
      playerName: row.player_name,
    }));
  }
}
