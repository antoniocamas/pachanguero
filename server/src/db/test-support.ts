import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Builds a real, in-memory SQLite DB from the actual schema.sql — never a mocked DB. */
export class TestDatabase {
  static create(): Database.Database {
    const conn = new Database(':memory:');
    conn.pragma('foreign_keys = ON');
    conn.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
    return conn;
  }
}
