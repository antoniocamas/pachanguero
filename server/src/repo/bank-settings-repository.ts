import type Database from 'better-sqlite3';

export interface StoredBankSettings {
  bankId: string | null;
  currency: string;
  accountStableId: string | null;
  startDate: string | null;
}

interface SettingsRow {
  bank_id: string | null;
  currency: string;
  account_stable_id: string | null;
  start_date: string | null;
}

/** SQL only: the one row of what is read, written with its first words on first use. */
export class BankSettingsRepository {
  static readonly INITIAL_INCLUDE_WORDS = [
    'pachanga',
    'futbol',
    'fútbol',
    'fubol',
  ];

  constructor(private readonly conn: Database.Database) {}

  /** Creates the row and the initial include words, once, only when the row does not exist. */
  ensure(): void {
    this.conn.transaction(() => {
      const exists = this.conn
        .prepare('SELECT 1 FROM bank_settings WHERE id = 1')
        .get();
      if (exists !== undefined) return;
      this.conn.prepare('INSERT INTO bank_settings (id) VALUES (1)').run();
      const insert = this.conn.prepare(
        `INSERT INTO bank_keywords (list, word) VALUES ('include', ?)`
      );
      for (const word of BankSettingsRepository.INITIAL_INCLUDE_WORDS) {
        insert.run(word);
      }
    })();
  }

  get(): StoredBankSettings {
    this.ensure();
    const row = this.conn
      .prepare('SELECT * FROM bank_settings WHERE id = 1')
      .get() as SettingsRow;
    return {
      bankId: row.bank_id,
      currency: row.currency,
      accountStableId: row.account_stable_id,
      startDate: row.start_date,
    };
  }

  /** Writes the given fields and leaves the others as they are. */
  update(change: Partial<StoredBankSettings>): void {
    const current = this.get();
    const next = { ...current, ...change };
    this.conn
      .prepare(
        `UPDATE bank_settings
            SET bank_id = ?, currency = ?, account_stable_id = ?, start_date = ?
          WHERE id = 1`
      )
      .run(next.bankId, next.currency, next.accountStableId, next.startDate);
  }
}
