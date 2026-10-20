import type Database from 'better-sqlite3';

/** The schema version this application writes. Raise it with each new `MigrationStep`. */
export const LATEST_SCHEMA_VERSION = 6;

/** Something that can write a copy of the database before it is changed. */
export interface MigrationBackup {
  create(label?: string): string;
}

/** One change to an existing database, applied when its stored version is below `version`. */
export interface MigrationStep {
  readonly version: number;
  apply(conn: Database.Database): void;
}

/**
 * Brings an open database to the latest schema. A new file gets `schema.sql` and the version
 * stamp. A file written before versions existed (stamp 0) or by an older version is copied by
 * the backup first, then migrated in one transaction; if the copy fails nothing is changed.
 * `schema.sql` stays the full schema for new files and is idempotent, so it also creates any
 * table a migrated file lacks.
 */
export class SchemaMigrator {
  constructor(
    private readonly conn: Database.Database,
    private readonly schemaSql: string,
    private readonly latest: number,
    private readonly steps: readonly MigrationStep[],
    private readonly backup: MigrationBackup
  ) {}

  run(): void {
    const version = this.storedVersion();
    if (version > this.latest) {
      throw new Error(
        `La base de datos es de una versión más nueva (${version}) que esta aplicación (${this.latest})`
      );
    }
    if (!this.hasPlayersTable()) {
      this.conn.exec(this.schemaSql);
      this.stamp();
    } else if (version === this.latest) {
      this.conn.exec(this.schemaSql);
    } else {
      this.backup.create('before-migration');
      this.useWriteAheadLog();
      this.conn.transaction(() => this.migrate()).immediate();
    }
  }

  /**
   * `schema.sql` asks for WAL, and SQLite refuses to change the journal mode inside the
   * migration's transaction. A file that is not WAL yet (a restored backup) is switched here.
   */
  private useWriteAheadLog(): void {
    this.conn.pragma('journal_mode = WAL');
  }

  private migrate(): void {
    const version = this.storedVersion();
    if (version >= this.latest) return;
    this.conn.exec(this.schemaSql);
    for (const step of this.steps) {
      if (step.version > version) step.apply(this.conn);
    }
    this.stamp();
  }

  private storedVersion(): number {
    return this.conn.pragma('user_version', { simple: true }) as number;
  }

  private hasPlayersTable(): boolean {
    return (
      this.conn
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'players'"
        )
        .get() !== undefined
    );
  }

  private stamp(): void {
    this.conn.pragma(`user_version = ${this.latest}`);
  }
}
