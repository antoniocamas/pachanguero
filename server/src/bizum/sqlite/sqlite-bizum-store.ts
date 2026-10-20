import type Database from 'better-sqlite3';
import { Bizum, BizumKey, type BizumDirection } from '../model.js';
import type { BizumStore, Clock, StoredBizum } from '../ports.js';

interface BizumRow {
  id: number;
  account: string;
  reference: string;
  direction: BizumDirection;
  booked_on: string;
  amount_cents: number;
  currency: string;
  sender_name: string | null;
  sender_phone: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  subject: string | null;
}

/** The kept Bizums, one column per field; a row the model refuses is corruption and throws. */
export class SqliteBizumStore implements BizumStore {
  constructor(
    private readonly conn: Database.Database,
    private readonly clock: Clock
  ) {}

  save(bizum: Bizum): StoredBizum {
    const info = this.conn
      .prepare(
        `INSERT INTO bizums
           (account, reference, direction, booked_on, amount_cents, currency,
            sender_name, sender_phone, receiver_name, receiver_phone, subject, kept_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        bizum.key.account,
        bizum.key.reference,
        bizum.direction,
        bizum.bookedOn,
        bizum.amountCents,
        bizum.currency,
        bizum.sender.name,
        bizum.sender.phone,
        bizum.receiver.name,
        bizum.receiver.phone,
        bizum.subject,
        this.clock.now().toISOString()
      );
    return { id: Number(info.lastInsertRowid), bizum };
  }

  find(id: number): StoredBizum | null {
    const row = this.conn
      .prepare('SELECT * FROM bizums WHERE id = ?')
      .get(id) as BizumRow | undefined;
    return row === undefined ? null : this.stored(row);
  }

  remove(id: number): void {
    this.conn.prepare('DELETE FROM bizums WHERE id = ?').run(id);
  }

  private stored(row: BizumRow): StoredBizum {
    return {
      id: row.id,
      bizum: new Bizum({
        key: new BizumKey(row.account, row.reference),
        direction: row.direction,
        bookedOn: row.booked_on,
        amountCents: row.amount_cents,
        currency: row.currency,
        sender: { name: row.sender_name, phone: row.sender_phone },
        receiver: { name: row.receiver_name, phone: row.receiver_phone },
        subject: row.subject,
      }),
    };
  }
}
