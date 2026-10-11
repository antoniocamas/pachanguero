import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LATEST_SCHEMA_VERSION, SchemaMigrator } from './schema-migrator.js';
import type { MigrationBackup } from './schema-migrator.js';

const here = dirname(fileURLToPath(import.meta.url));

/** A new database never needs a backup, so asking for one is a test failure. */
class NoBackup implements MigrationBackup {
  create(): string {
    throw new Error('a new test database must not need a backup');
  }
}

/** Builds a real, in-memory SQLite DB from the actual schema.sql — never a mocked DB. */
export class TestDatabase {
  static create(): Database.Database {
    const conn = new Database(':memory:');
    conn.pragma('foreign_keys = ON');
    const schema = readFileSync(join(here, 'schema.sql'), 'utf8');
    new SchemaMigrator(
      conn,
      schema,
      LATEST_SCHEMA_VERSION,
      [],
      new NoBackup()
    ).run();
    return conn;
  }
}
