import type Database from 'better-sqlite3';
import { ExclusionHistory } from '../domain/exclusion-history.js';
import type { ExclusionKind } from '../domain/types.js';

export class ExclusionRepository {
  constructor(private readonly conn: Database.Database) {}

  set(gameId: number, playerId: number, kind: ExclusionKind | null): void {
    if (kind === null) {
      this.conn
        .prepare('DELETE FROM exclusions WHERE game_id = ? AND player_id = ?')
        .run(gameId, playerId);
      return;
    }
    this.conn
      .prepare(
        `INSERT INTO exclusions (game_id, player_id, kind) VALUES (?, ?, ?)
         ON CONFLICT (game_id, player_id) DO UPDATE SET kind = excluded.kind`
      )
      .run(gameId, playerId, kind);
  }

  /** Season exclusion history per player, in game order. */
  historyFor(
    seasonId: number,
    upToGameId?: number
  ): Map<number, ExclusionHistory> {
    const rows = this.conn
      .prepare(
        `SELECT e.player_id, e.kind
           FROM exclusions e JOIN games g ON g.id = e.game_id
          WHERE g.season_id = @seasonId
            AND (@upTo IS NULL OR g.played_on < (SELECT played_on FROM games WHERE id = @upTo)
                 OR (g.played_on = (SELECT played_on FROM games WHERE id = @upTo) AND g.id < @upTo))
          ORDER BY g.played_on, g.id`
      )
      .all({ seasonId, upTo: upToGameId ?? null }) as Array<{
      player_id: number;
      kind: ExclusionKind;
    }>;

    const raw = new Map<number, ExclusionKind[]>();
    for (const r of rows) {
      const list = raw.get(r.player_id) ?? [];
      list.push(r.kind);
      raw.set(r.player_id, list);
    }
    return new Map(
      [...raw].map(([id, kinds]) => [id, new ExclusionHistory(kinds)])
    );
  }
}
