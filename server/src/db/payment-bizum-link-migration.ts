import type Database from 'better-sqlite3';
import type { MigrationStep } from './schema-migrator.js';

/**
 * A payment may name the Bizum that paid it. A file created by the current schema already has the
 * column, so the step checks first. No index: a column added by a step cannot be indexed for new
 * files without changing the migrator, and the lookup is by a handful of rows.
 */
export class PaymentBizumLinkMigration implements MigrationStep {
  readonly version = 5;

  apply(conn: Database.Database): void {
    const columns = conn.pragma('table_info(payments)') as { name: string }[];
    if (columns.some(column => column.name === 'bizum_id')) return;
    conn.exec(
      'ALTER TABLE payments ADD COLUMN bizum_id INTEGER REFERENCES bizums(id)'
    );
  }
}
