import type Database from 'better-sqlite3';
import type { GameState } from '../domain/types.js';

export interface GameRow {
  id: number;
  season_id: number;
  played_on: string;
  label: string | null;
  status: GameState;
  /** The state a cancelled game returns to; null for any other. */
  cancelled_from: Exclude<GameState, 'cancelled'> | null;
  notes: string | null;
}

const UPDATABLE_COLUMNS = ['played_on', 'label', 'notes'] as const;

export type GamePatch = Partial<
  Pick<GameRow, (typeof UPDATABLE_COLUMNS)[number]>
>;

export class GameRepository {
  constructor(private readonly conn: Database.Database) {}

  list(seasonId: number): GameRow[] {
    return this.conn
      .prepare('SELECT * FROM games WHERE season_id = ? ORDER BY played_on, id')
      .all(seasonId) as GameRow[];
  }

  get(id: number): GameRow | undefined {
    return this.conn.prepare('SELECT * FROM games WHERE id = ?').get(id) as
      GameRow | undefined;
  }

  create(
    seasonId: number,
    playedOn: string,
    label?: string | null,
    status: GameState = 'open',
    cancelledFrom: GameRow['cancelled_from'] = null
  ): GameRow {
    const info = this.conn
      .prepare(
        `INSERT INTO games (season_id, played_on, label, status, cancelled_from)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(seasonId, playedOn, label ?? null, status, cancelledFrom);
    return this.get(Number(info.lastInsertRowid))!;
  }

  /** The plain (unlabelled) game on that date, created if it does not exist yet. */
  findOrCreate(seasonId: number, playedOn: string): GameRow {
    const existing = this.conn
      .prepare(
        'SELECT * FROM games WHERE season_id = ? AND played_on = ? AND label IS NULL'
      )
      .get(seasonId, playedOn) as GameRow | undefined;
    return existing ?? this.create(seasonId, playedOn);
  }

  /** Edit the plain fields of a game; its state moves only through `setState`. */
  update(id: number, patch: GamePatch): GameRow | undefined {
    const keys = UPDATABLE_COLUMNS.filter(k => patch[k] !== undefined);
    if (keys.length) {
      const set = keys.map(k => `${k} = @${k}`).join(', ');
      this.conn
        .prepare(`UPDATE games SET ${set} WHERE id = @id`)
        .run({ id, ...Object.fromEntries(keys.map(k => [k, patch[k]])) });
    }
    return this.get(id);
  }

  setState(
    id: number,
    status: GameState,
    cancelledFrom: GameRow['cancelled_from'] = null
  ): void {
    this.conn
      .prepare('UPDATE games SET status = ?, cancelled_from = ? WHERE id = ?')
      .run(status, cancelledFrom, id);
  }

  delete(id: number): void {
    this.conn.prepare('DELETE FROM games WHERE id = ?').run(id);
  }
}
