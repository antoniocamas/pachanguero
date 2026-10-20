import type Database from 'better-sqlite3';
import type { MigrationStep } from './schema-migrator.js';

/**
 * The bank may show one player under several names, so the names leave the player's row for a
 * table of their own. Each non-blank name is copied across and the column goes. A file the
 * current schema made has no column, so the step checks first.
 */
export class PlayerBizumNamesMigration implements MigrationStep {
  readonly version = 6;

  apply(conn: Database.Database): void {
    const columns = conn.pragma('table_info(players)') as { name: string }[];
    if (!columns.some(column => column.name === 'bizum_name')) return;
    conn.exec(`
      INSERT OR IGNORE INTO player_bizum_names (player_id, bizum_name)
        SELECT id, trim(bizum_name) FROM players
         WHERE bizum_name IS NOT NULL AND trim(bizum_name) <> '';
      ALTER TABLE players DROP COLUMN bizum_name;
    `);
  }
}
