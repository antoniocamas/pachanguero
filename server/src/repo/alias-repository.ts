import type Database from 'better-sqlite3';
import type { PlayerAlias } from '../domain/name-matcher.js';

export class AliasRepository {
  constructor(private readonly conn: Database.Database) {}

  listAll(): PlayerAlias[] {
    return this.conn
      .prepare(
        'SELECT player_id AS playerId, alias FROM player_aliases ORDER BY player_id, alias'
      )
      .all() as PlayerAlias[];
  }

  /** Idempotent: saving the same alias for the same player twice is a no-op. */
  add(playerId: number, alias: string): void {
    this.conn
      .prepare(
        'INSERT OR IGNORE INTO player_aliases (player_id, alias) VALUES (?, ?)'
      )
      .run(playerId, alias);
  }
}
