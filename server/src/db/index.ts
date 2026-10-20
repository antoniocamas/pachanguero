import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SystemClock } from '../domain/clock.js';
import { LocalCalendar } from '../domain/local-calendar.js';
import { DatabaseBackup } from './database-backup.js';
import { LATEST_SCHEMA_VERSION, SchemaMigrator } from './schema-migrator.js';
import { PaymentMethodMigration } from './payment-method-migration.js';
import { PaymentBizumLinkMigration } from './payment-bizum-link-migration.js';
import { PlayerBizumNameMigration } from './player-bizum-name-migration.js';
import { ViewAsMigration } from './view-as-migration.js';

const here = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = resolve(
  process.env.PACHANGUERO_DB ?? join(here, '../../../data/pachanguero.db')
);

/** Where backups are written: its own volume in a container, `backups/` beside the database otherwise. */
export const BACKUP_DIR = resolve(
  process.env.PACHANGUERO_BACKUPS ?? join(dirname(DB_PATH), 'backups')
);

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;
  const conn = new Database(DB_PATH);
  conn.pragma('foreign_keys = ON');
  const backup = new DatabaseBackup(
    conn,
    BACKUP_DIR,
    new SystemClock(),
    new LocalCalendar()
  );
  const schema = readFileSync(join(here, 'schema.sql'), 'utf8');
  try {
    new SchemaMigrator(
      conn,
      schema,
      LATEST_SCHEMA_VERSION,
      [
        new ViewAsMigration(),
        new PaymentMethodMigration(),
        new PlayerBizumNameMigration(),
        new PaymentBizumLinkMigration(),
      ],
      backup
    ).run();
  } catch (error) {
    conn.close();
    throw error;
  }
  instance = conn;
  return instance;
}

/** Wrap a unit of work in a transaction. */
export function tx<T>(fn: () => T): T {
  return db().transaction(fn)();
}
