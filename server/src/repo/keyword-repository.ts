import type Database from 'better-sqlite3';
import type { BankSettingsRepository } from './bank-settings-repository.js';
import type { KeywordSource } from './bizum-facts-reader.js';

export type KeywordListName = 'include' | 'exclude';

/** SQL only: the two word lists, as typed and in the order they were given. */
export class KeywordRepository implements KeywordSource {
  constructor(
    private readonly conn: Database.Database,
    private readonly settings: BankSettingsRepository
  ) {}

  include(): string[] {
    return this.words('include');
  }

  exclude(): string[] {
    return this.words('exclude');
  }

  /** Replaces both lists whole. */
  replace(include: readonly string[], exclude: readonly string[]): void {
    this.settings.ensure();
    this.conn.transaction(() => {
      this.conn.prepare('DELETE FROM bank_keywords').run();
      const insert = this.conn.prepare(
        'INSERT INTO bank_keywords (list, word) VALUES (?, ?)'
      );
      for (const word of include) insert.run('include', word);
      for (const word of exclude) insert.run('exclude', word);
    })();
  }

  private words(list: KeywordListName): string[] {
    this.settings.ensure();
    return (
      this.conn
        .prepare('SELECT word FROM bank_keywords WHERE list = ? ORDER BY rowid')
        .all(list) as { word: string }[]
    ).map(row => row.word);
  }
}
