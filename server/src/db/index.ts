import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = resolve(
  process.env.PACHANGUERO_DB ?? join(here, '../../../data/pachanguero.db'),
);

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;
  instance = new Database(DB_PATH);
  instance.pragma('foreign_keys = ON');
  instance.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  return instance;
}

/** Wrap a unit of work in a transaction. */
export function tx<T>(fn: () => T): T {
  return db().transaction(fn)();
}
