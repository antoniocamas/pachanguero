import type Database from 'better-sqlite3';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from '../domain/clock.js';
import type { LocalCalendar } from '../domain/local-calendar.js';
import type { MigrationBackup } from './schema-migrator.js';

/**
 * Writes one consistent copy of the open database into a directory, with `VACUUM INTO`
 * (so rows still only in the write-ahead log are included). A copy is written under a
 * temporary name and renamed, takes a name nobody has, and is readable by its owner only
 * because it holds password hashes. Nothing here ever deletes or overwrites a backup.
 */
export class DatabaseBackup implements MigrationBackup {
  constructor(
    private readonly conn: Database.Database,
    private readonly dir: string,
    private readonly clock: Clock,
    private readonly calendar: LocalCalendar
  ) {}

  /** Returns the path of the file written. `label` is appended to the name. */
  create(label?: string): string {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const target = this.freeName(label);
    const partial = `${target}.part`;
    rmSync(partial, { force: true });
    try {
      this.conn.exec(`VACUUM INTO '${partial.replaceAll("'", "''")}'`);
      chmodSync(partial, 0o600);
      renameSync(partial, target);
    } catch (error) {
      rmSync(partial, { force: true });
      throw error;
    }
    return target;
  }

  private freeName(label?: string): string {
    const stem = `pachanguero-${this.calendar.timestampOf(this.clock.now())}${label ? `-${label}` : ''}`;
    let candidate = join(this.dir, `${stem}.db`);
    for (let n = 2; existsSync(candidate); n++) {
      candidate = join(this.dir, `${stem}-${n}.db`);
    }
    return candidate;
  }
}
