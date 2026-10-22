import type Database from 'better-sqlite3';
import type { ContactPatch } from '../domain/contact-validator.js';

export interface Contact {
  /** In the order they were given. */
  emails: string[];
  phone: string | null;
}

/** SQL only: a player's emails, and one optional phone row removed when it is cleared. */
export class ContactRepository {
  constructor(private readonly conn: Database.Database) {}

  get(playerId: number): Contact {
    const row = this.conn
      .prepare('SELECT phone FROM player_contacts WHERE player_id = ?')
      .get(playerId) as { phone: string | null } | undefined;
    return { emails: this.emailsOf(playerId), phone: row?.phone ?? null };
  }

  /** Every player's contact data that has any. */
  listAll(): Map<number, Contact> {
    const out = new Map<number, Contact>();
    const entry = (playerId: number) => {
      const found = out.get(playerId) ?? { emails: [], phone: null };
      out.set(playerId, found);
      return found;
    };
    const emails = this.conn
      .prepare(
        'SELECT player_id, email FROM player_emails ORDER BY player_id, rowid'
      )
      .all() as { player_id: number; email: string }[];
    for (const e of emails) entry(e.player_id).emails.push(e.email);
    for (const { playerId, phone } of this.listPhones())
      entry(playerId).phone = phone;
    return out;
  }

  /** Every phone on file, with the player it belongs to. */
  listPhones(): { playerId: number; phone: string }[] {
    return this.conn
      .prepare(
        `SELECT player_id AS playerId, phone FROM player_contacts
          WHERE phone IS NOT NULL ORDER BY player_id`
      )
      .all() as { playerId: number; phone: string }[];
  }

  /** Changes only the fields the patch names; `emails` replaces the whole list. */
  save(playerId: number, patch: ContactPatch): Contact {
    if (patch.emails !== undefined) this.replaceEmails(playerId, patch.emails);
    if (patch.phone !== undefined) this.savePhone(playerId, patch.phone);
    return this.get(playerId);
  }

  private emailsOf(playerId: number): string[] {
    return (
      this.conn
        .prepare(
          'SELECT email FROM player_emails WHERE player_id = ? ORDER BY rowid'
        )
        .all(playerId) as { email: string }[]
    ).map(r => r.email);
  }

  private replaceEmails(playerId: number, emails: readonly string[]): void {
    this.conn
      .prepare('DELETE FROM player_emails WHERE player_id = ?')
      .run(playerId);
    const insert = this.conn.prepare(
      'INSERT OR IGNORE INTO player_emails (player_id, email) VALUES (?, ?)'
    );
    for (const email of emails) insert.run(playerId, email);
  }

  private savePhone(playerId: number, phone: string | null): void {
    if (phone === null) {
      this.conn
        .prepare('DELETE FROM player_contacts WHERE player_id = ?')
        .run(playerId);
      return;
    }
    this.conn
      .prepare(
        `INSERT INTO player_contacts (player_id, phone) VALUES (?, ?)
         ON CONFLICT (player_id) DO UPDATE SET phone = excluded.phone`
      )
      .run(playerId, phone);
  }
}
