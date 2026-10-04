import type Database from 'better-sqlite3';

export interface GuestCandidateRow {
  position: number;
  /** null for an anonymous '+1'. */
  player_id: number | null;
  host_player_id: number;
}

export class GuestCandidateRepository {
  constructor(private readonly conn: Database.Database) {}

  list(gameId: number): GuestCandidateRow[] {
    return this.conn
      .prepare(
        `SELECT position, player_id, host_player_id FROM guest_candidates
          WHERE game_id = ? ORDER BY position`
      )
      .all(gameId) as GuestCandidateRow[];
  }

  /** Staging data: a new paste wholly replaces the previous one. */
  replaceAll(gameId: number, rows: readonly GuestCandidateRow[]): void {
    this.conn.transaction(() => {
      this.conn
        .prepare('DELETE FROM guest_candidates WHERE game_id = ?')
        .run(gameId);
      for (const row of rows) this.insert(gameId, row);
    })();
  }

  /** Add or replace the guest at one position, leaving the others alone. */
  put(gameId: number, row: GuestCandidateRow): void {
    this.conn
      .prepare(
        'DELETE FROM guest_candidates WHERE game_id = ? AND position = ?'
      )
      .run(gameId, row.position);
    this.insert(gameId, row);
  }

  private insert(gameId: number, row: GuestCandidateRow): void {
    this.conn
      .prepare(
        `INSERT INTO guest_candidates (game_id, position, player_id, host_player_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(gameId, row.position, row.player_id, row.host_player_id);
  }
}
