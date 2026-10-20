import type Database from 'better-sqlite3';
import type { UnitOfWork } from '../feed.js';

/** A better-sqlite3 transaction: synchronous, nesting as a savepoint, rolled back on a throw. */
export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly conn: Database.Database) {}

  run<T>(work: () => T): T {
    return this.conn.transaction(work)();
  }
}
