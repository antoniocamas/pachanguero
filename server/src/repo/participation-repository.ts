import type Database from 'better-sqlite3';

export interface ParticipationRow {
  game_id: number;
  player_id: number;
  name: string;
  signed_up: number;
  played: number;
  paid_cents: number;
  paid_on: string | null;
  guests: number;
  note: string | null;
}

export interface ParticipationPatch {
  signed_up?: boolean;
  played?: boolean;
  paid_cents?: number;
  paid_on?: string | null;
  guests?: number;
  note?: string | null;
}

export class ParticipationRepository {
  constructor(private readonly conn: Database.Database) {}

  list(gameId: number): ParticipationRow[] {
    return this.conn
      .prepare(
        `SELECT pa.*, p.name FROM participations pa JOIN players p ON p.id = pa.player_id
          WHERE pa.game_id = ? ORDER BY p.name COLLATE NOCASE`
      )
      .all(gameId) as ParticipationRow[];
  }

  /**
   * Set a player's state for a game. Signup, attendance and payment are separate
   * fields on purpose — the legacy sheet crammed all three into one `*`/`4` cell
   * and lost the fact that a payment ever arrived late.
   */
  set(gameId: number, playerId: number, patch: ParticipationPatch): void {
    this.conn
      .prepare(
        `INSERT INTO participations (game_id, player_id) VALUES (?, ?)
         ON CONFLICT (game_id, player_id) DO NOTHING`
      )
      .run(gameId, playerId);

    const sets: string[] = [];
    const values: Record<string, unknown> = { gameId, playerId };
    const put = (col: string, v: unknown) => {
      sets.push(`${col} = @${col}`);
      values[col] = v;
    };

    if (patch.signed_up !== undefined)
      put('signed_up', patch.signed_up ? 1 : 0);
    if (patch.played !== undefined) put('played', patch.played ? 1 : 0);
    if (patch.guests !== undefined) put('guests', patch.guests);
    if (patch.note !== undefined) put('note', patch.note);
    if (patch.paid_cents !== undefined) {
      put('paid_cents', patch.paid_cents);
      // Stamp the settlement date when money first appears, clear it when reversed.
      if (patch.paid_on !== undefined) put('paid_on', patch.paid_on);
      else
        put(
          'paid_on',
          patch.paid_cents > 0 ? new Date().toISOString().slice(0, 10) : null
        );
    } else if (patch.paid_on !== undefined) {
      put('paid_on', patch.paid_on);
    }

    if (!sets.length) return;
    this.conn
      .prepare(
        `UPDATE participations SET ${sets.join(', ')} WHERE game_id = @gameId AND player_id = @playerId`
      )
      .run(values);
  }

  remove(gameId: number, playerId: number): void {
    this.conn
      .prepare('DELETE FROM participations WHERE game_id = ? AND player_id = ?')
      .run(gameId, playerId);
  }
}
