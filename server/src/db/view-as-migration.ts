import type Database from 'better-sqlite3';
import type { MigrationStep } from './schema-migrator.js';

/**
 * Sessions remember which player an admin is looking at the app as. A file written before has
 * no such column; one created by the current schema already does, so the step checks first.
 */
export class ViewAsMigration implements MigrationStep {
  readonly version = 2;

  apply(conn: Database.Database): void {
    const columns = conn.pragma('table_info(refresh_tokens)') as {
      name: string;
    }[];
    if (columns.some(column => column.name === 'acting_as')) return;
    conn.exec(
      'ALTER TABLE refresh_tokens ADD COLUMN acting_as INTEGER REFERENCES players(id) ON DELETE SET NULL'
    );
  }
}
