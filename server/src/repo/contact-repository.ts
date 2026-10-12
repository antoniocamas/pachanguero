import type Database from 'better-sqlite3';
import type { ContactPatch } from '../domain/contact-validator.js';

export interface Contact {
  email: string | null;
  phone: string | null;
}

/** SQL only: one optional row per player, removed when nothing is left in it. */
export class ContactRepository {
  constructor(private readonly conn: Database.Database) {}

  get(playerId: number): Contact {
    const row = this.conn
      .prepare('SELECT email, phone FROM player_contacts WHERE player_id = ?')
      .get(playerId) as Contact | undefined;
    return row ?? { email: null, phone: null };
  }

  /** Changes only the fields the patch names. */
  save(playerId: number, patch: ContactPatch): Contact {
    const next = { ...this.get(playerId), ...patch };
    if (next.email === null && next.phone === null) {
      this.conn
        .prepare('DELETE FROM player_contacts WHERE player_id = ?')
        .run(playerId);
    } else {
      this.conn
        .prepare(
          `INSERT INTO player_contacts (player_id, email, phone)
           VALUES (@playerId, @email, @phone)
           ON CONFLICT (player_id) DO UPDATE SET email = @email, phone = @phone`
        )
        .run({ playerId, ...next });
    }
    return next;
  }
}
