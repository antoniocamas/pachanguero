import type Database from 'better-sqlite3';
import type { MigrationStep } from './schema-migrator.js';

/**
 * A player may carry the name the bank shows for them as a Bizum sender. A file created by the
 * current schema already has the column, so the step checks first.
 */
export class PlayerBizumNameMigration implements MigrationStep {
  readonly version = 4;

  apply(conn: Database.Database): void {
    const columns = conn.pragma('table_info(players)') as { name: string }[];
    if (columns.some(column => column.name === 'bizum_name')) return;
    conn.exec('ALTER TABLE players ADD COLUMN bizum_name TEXT');
  }
}
