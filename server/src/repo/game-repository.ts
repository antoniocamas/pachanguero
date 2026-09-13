import type Database from 'better-sqlite3';

export interface GameRow {
  id: number;
  season_id: number;
  played_on: string;
  label: string | null;
  status: 'scheduled' | 'played' | 'cancelled';
  notes: string | null;
}

const UPDATABLE_COLUMNS = ['played_on', 'label', 'status', 'notes'] as const;

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
    status: GameRow['status'] = 'scheduled'
  ): GameRow {
    const info = this.conn
      .prepare(
        'INSERT INTO games (season_id, played_on, label, status) VALUES (?, ?, ?, ?)'
      )
      .run(seasonId, playedOn, label ?? null, status);
    return this.get(Number(info.lastInsertRowid))!;
  }

  update(id: number, patch: Partial<GameRow>): GameRow | undefined {
    const keys = UPDATABLE_COLUMNS.filter(k => patch[k] !== undefined);
    if (keys.length) {
      const set = keys.map(k => `${k} = @${k}`).join(', ');
      this.conn
        .prepare(`UPDATE games SET ${set} WHERE id = @id`)
        .run({ id, ...Object.fromEntries(keys.map(k => [k, patch[k]])) });
    }
    return this.get(id);
  }

  delete(id: number): void {
    this.conn.prepare('DELETE FROM games WHERE id = ?').run(id);
  }
}
