import type Database from 'better-sqlite3';
import type { BankEntryLedger, EntryOutcome } from '../feed.js';
import type { BizumKey } from '../model.js';
import type { Clock } from '../ports.js';

export class SqliteBankEntryLedger implements BankEntryLedger {
  constructor(
    private readonly conn: Database.Database,
    private readonly clock: Clock
  ) {}

  has(key: BizumKey): boolean {
    return (
      this.conn
        .prepare(
          'SELECT 1 FROM bizum_entries WHERE account = ? AND reference = ?'
        )
        .get(key.account, key.reference) !== undefined
    );
  }

  remember(key: BizumKey, outcome: EntryOutcome): void {
    this.conn
      .prepare(
        `INSERT INTO bizum_entries (account, reference, outcome, recorded_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(key.account, key.reference, outcome, this.clock.now().toISOString());
  }

  dismiss(key: BizumKey): void {
    this.conn
      .prepare(
        `UPDATE bizum_entries SET outcome = 'dismissed', recorded_at = ?
          WHERE account = ? AND reference = ?`
      )
      .run(this.clock.now().toISOString(), key.account, key.reference);
  }
}
