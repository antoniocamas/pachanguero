import type Database from 'better-sqlite3';
import type { MigrationStep } from './schema-migrator.js';

/**
 * A player gets a role per season (fijo or invitado), usual hosts and any number of emails.
 *
 * - The one email of `player_contacts` moves to `player_emails` and its column goes.
 * - Each season's roles are read from what its saved lists recorded: someone who came as a named
 *   guest in a season is an invitado in it, anyone else who took part is a fijo. Guest wins
 *   because a returning guest used to be signed up as a regular, which is the bug this fixes.
 * - The hosts named guests came with become their usual hosts, the earliest game first.
 *
 * `schema.sql` has already created the new tables; a file the current schema made has no email
 * column and its tables are filled by use, so each part checks first.
 */
export class PlayerProfileMigration implements MigrationStep {
  readonly version = 7;

  apply(conn: Database.Database): void {
    this.moveEmails(conn);
    this.seedRoles(conn);
    this.seedHosts(conn);
  }

  private moveEmails(conn: Database.Database): void {
    const columns = conn.pragma('table_info(player_contacts)') as {
      name: string;
    }[];
    if (!columns.some(column => column.name === 'email')) return;
    conn.exec(`
      INSERT OR IGNORE INTO player_emails (player_id, email)
        SELECT player_id, trim(email) FROM player_contacts
         WHERE email IS NOT NULL AND trim(email) <> '';
      DELETE FROM player_contacts WHERE phone IS NULL;
      ALTER TABLE player_contacts DROP COLUMN email;
    `);
  }

  private seedRoles(conn: Database.Database): void {
    if (conn.prepare('SELECT 1 FROM season_roles LIMIT 1').get()) return;
    conn.exec(`
      INSERT OR IGNORE INTO season_roles (season_id, player_id, role)
        SELECT DISTINCT g.season_id, gc.player_id, 'invitado'
          FROM guest_candidates gc JOIN games g ON g.id = gc.game_id
         WHERE gc.player_id IS NOT NULL;
      INSERT OR IGNORE INTO season_roles (season_id, player_id, role)
        SELECT DISTINCT g.season_id, p.player_id, 'fijo'
          FROM participations p JOIN games g ON g.id = p.game_id;
    `);
  }

  private seedHosts(conn: Database.Database): void {
    if (conn.prepare('SELECT 1 FROM player_hosts LIMIT 1').get()) return;
    const rows = conn
      .prepare(
        `SELECT gc.player_id AS playerId, gc.host_player_id AS hostId
           FROM guest_candidates gc JOIN games g ON g.id = gc.game_id
          WHERE gc.player_id IS NOT NULL AND gc.player_id <> gc.host_player_id
          ORDER BY g.played_on, g.id, gc.position`
      )
      .all() as { playerId: number; hostId: number }[];
    const insert = conn.prepare(
      `INSERT OR IGNORE INTO player_hosts (player_id, host_player_id, position)
       VALUES (@playerId, @hostId,
               (SELECT COALESCE(MAX(position), 0) + 1 FROM player_hosts WHERE player_id = @playerId))`
    );
    for (const row of rows) insert.run(row);
  }
}
