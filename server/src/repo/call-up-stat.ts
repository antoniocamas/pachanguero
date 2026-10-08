import type Database from 'better-sqlite3';
import type { PlayerGameStat } from './player-game-stat.js';

/** What happened to the player in a game's selection. */
export type CallUpValue = 'played' | 'mercy' | 'out' | 'demoted';

export interface CallUpSummary {
  played: number;
  out: number;
  mercy: number;
  demoted: number;
}

/** Played, left out on points, in on a mercy seat, or demoted to make room for one. */
export class CallUpStat implements PlayerGameStat {
  readonly key = 'callUp';

  constructor(private readonly conn: Database.Database) {}

  valuesFor(playerId: number): Map<number, CallUpValue> {
    const values = new Map<number, CallUpValue>();
    const played = this.conn
      .prepare(
        'SELECT game_id AS gameId FROM participations WHERE player_id = ? AND played = 1'
      )
      .all(playerId) as Array<{ gameId: number }>;
    for (const { gameId } of played) values.set(gameId, 'played');
    const excluded = this.conn
      .prepare(
        'SELECT game_id AS gameId, kind FROM exclusions WHERE player_id = ?'
      )
      .all(playerId) as Array<{
      gameId: number;
      kind: 'points' | 'demoted' | 'mercy';
    }>;
    for (const { gameId, kind } of excluded)
      values.set(gameId, kind === 'points' ? 'out' : kind);
    return values;
  }

  summarize(values: ReadonlyMap<number, unknown>): CallUpSummary {
    const summary: CallUpSummary = { played: 0, out: 0, mercy: 0, demoted: 0 };
    for (const v of values.values() as IterableIterator<CallUpValue>)
      summary[v]++;
    return summary;
  }
}
