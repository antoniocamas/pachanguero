import type Database from 'better-sqlite3';
import type { MigrationStep } from './schema-migrator.js';

/**
 * Payments say how they were paid; those recorded before read "otro". A file created by the
 * current schema already has the column, so the step checks first.
 */
export class PaymentMethodMigration implements MigrationStep {
  readonly version = 3;

  apply(conn: Database.Database): void {
    const columns = conn.pragma('table_info(payments)') as { name: string }[];
    if (columns.some(column => column.name === 'method')) return;
    conn.exec(
      `ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'otro'
         CHECK (method IN ('efectivo', 'bizum', 'otro'))`
    );
  }
}
