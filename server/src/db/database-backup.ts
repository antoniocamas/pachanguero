import type Database from 'better-sqlite3';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BackupName, type BackupKind } from '../domain/backup-name.js';
import type { Clock } from '../domain/clock.js';
import type { MigrationBackup } from './schema-migrator.js';

/**
 * Writes one consistent copy of the open database into a directory, with `VACUUM INTO`
 * (so rows still only in the write-ahead log are included). A copy is written under a
 * hidden name and renamed, takes a name nobody has, and is readable by its owner only
 * because it holds password hashes. Nothing here ever deletes or overwrites a backup.
 * Names are made by `BackupName`; `version` is the version of the code that runs.
 */
export class DatabaseBackup implements MigrationBackup {
  constructor(
    private readonly conn: Database.Database,
    private readonly dir: string,
    private readonly clock: Clock,
    private readonly version?: string
  ) {}

  /** Returns the path of the file written. `version` here wins over the one the class was made with. */
  create(kind: BackupKind, version?: string): string {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const name = new BackupName(
      kind,
      version ?? this.version,
      this.clock.now()
    );
    const counter = this.freeCounter(name);
    const target = join(this.dir, name.fileName(counter));
    const partial = join(this.dir, name.hiddenName(counter));
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

  private freeCounter(name: BackupName): number {
    let counter = 1;
    while (existsSync(join(this.dir, name.fileName(counter)))) counter++;
    return counter;
  }
}
