import type Database from 'better-sqlite3';

/** SQL only: who usually brings each invitado, the usual one first. */
export class PlayerHostRepository {
  constructor(private readonly conn: Database.Database) {}

  list(playerId: number): number[] {
    return (
      this.conn
        .prepare(
          'SELECT host_player_id FROM player_hosts WHERE player_id = ? ORDER BY position'
        )
        .all(playerId) as { host_player_id: number }[]
    ).map(r => r.host_player_id);
  }

  /** Every player's usual hosts, the usual one first. */
  listAll(): Map<number, number[]> {
    const rows = this.conn
      .prepare(
        'SELECT player_id, host_player_id FROM player_hosts ORDER BY player_id, position'
      )
      .all() as { player_id: number; host_player_id: number }[];
    const out = new Map<number, number[]>();
    for (const r of rows) {
      out.set(r.player_id, [...(out.get(r.player_id) ?? []), r.host_player_id]);
    }
    return out;
  }

  /** Adds a host after the others; one already listed stays where it is. */
  add(playerId: number, hostId: number): void {
    this.conn
      .prepare(
        `INSERT OR IGNORE INTO player_hosts (player_id, host_player_id, position)
         VALUES (@playerId, @hostId,
                 (SELECT COALESCE(MAX(position), 0) + 1 FROM player_hosts WHERE player_id = @playerId))`
      )
      .run({ playerId, hostId });
  }

  remove(playerId: number, hostId: number): void {
    this.conn
      .prepare(
        'DELETE FROM player_hosts WHERE player_id = ? AND host_player_id = ?'
      )
      .run(playerId, hostId);
  }

  /** Writes the list as given, in that order. */
  replace(playerId: number, hostIds: readonly number[]): void {
    this.conn
      .prepare('DELETE FROM player_hosts WHERE player_id = ?')
      .run(playerId);
    const insert = this.conn.prepare(
      'INSERT INTO player_hosts (player_id, host_player_id, position) VALUES (?, ?, ?)'
    );
    hostIds.forEach((hostId, i) => insert.run(playerId, hostId, i + 1));
  }
}
