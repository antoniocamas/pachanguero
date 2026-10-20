import type Database from 'better-sqlite3';
import type { FeedState, FeedStateStore, ReadResult } from '../bank-poller.js';

interface StateRow {
  started_at: string;
  finished_at: string;
  result: ReadResult;
  code: string | null;
  entries: number;
  kept: number;
  discarded: number;
  not_bizum: number;
  pending: number;
  unidentified: number;
  known: number;
  rate_limited_until: string | null;
}

/** The last read: its times, its result code and its counts, never what it held. */
export class SqliteFeedStateStore implements FeedStateStore {
  constructor(private readonly conn: Database.Database) {}

  load(): FeedState | null {
    const row = this.conn
      .prepare('SELECT * FROM bizum_feed_state WHERE id = 1')
      .get() as StateRow | undefined;
    if (row === undefined) return null;
    return {
      startedAt: new Date(row.started_at),
      finishedAt: new Date(row.finished_at),
      result: row.result,
      code: row.code,
      counts: {
        entries: row.entries,
        kept: row.kept,
        discarded: row.discarded,
        notBizum: row.not_bizum,
        pending: row.pending,
        unidentified: row.unidentified,
        known: row.known,
      },
      rateLimitedUntil:
        row.rate_limited_until === null
          ? null
          : new Date(row.rate_limited_until),
    };
  }

  save(state: FeedState): void {
    const c = state.counts;
    this.conn
      .prepare(
        `INSERT OR REPLACE INTO bizum_feed_state
           (id, started_at, finished_at, result, code, entries, kept, discarded,
            not_bizum, pending, unidentified, known, rate_limited_until)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        state.startedAt.toISOString(),
        state.finishedAt.toISOString(),
        state.result,
        state.code,
        c.entries,
        c.kept,
        c.discarded,
        c.notBizum,
        c.pending,
        c.unidentified,
        c.known,
        state.rateLimitedUntil?.toISOString() ?? null
      );
  }
}
