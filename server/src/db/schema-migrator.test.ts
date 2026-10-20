import Database from 'better-sqlite3';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../domain/clock.js';
import { LocalCalendar } from '../domain/local-calendar.js';
import { DatabaseBackup } from './database-backup.js';
import { PaymentBizumLinkMigration } from './payment-bizum-link-migration.js';
import { PaymentMethodMigration } from './payment-method-migration.js';
import { PlayerBizumNameMigration } from './player-bizum-name-migration.js';
import { PlayerBizumNamesMigration } from './player-bizum-names-migration.js';
import {
  LATEST_SCHEMA_VERSION,
  SchemaMigrator,
  type MigrationBackup,
  type MigrationStep,
} from './schema-migrator.js';

const here = dirname(fileURLToPath(import.meta.url));
const currentSchema = readFileSync(join(here, 'schema.sql'), 'utf8');
const schemaV2 = readFileSync(join(here, 'fixtures/schema-v2.sql'), 'utf8');
const schemaV3 = readFileSync(join(here, 'fixtures/schema-v3.sql'), 'utf8');
const schemaV4 = readFileSync(join(here, 'fixtures/schema-v4.sql'), 'utf8');
const schemaV5 = readFileSync(join(here, 'fixtures/schema-v5.sql'), 'utf8');
const legacySchema = readFileSync(join(here, 'fixtures/schema-v0.sql'), 'utf8');

class FixedClock implements Clock {
  now(): Date {
    return new Date(2026, 9, 11, 19, 30, 0);
  }
}

class FailingBackup implements MigrationBackup {
  create(): string {
    throw new Error('disk full');
  }
}

class AddsATable implements MigrationStep {
  constructor(
    readonly version: number,
    private readonly table: string,
    private readonly fails = false
  ) {}
  apply(conn: Database.Database): void {
    conn.exec(`CREATE TABLE ${this.table} (id INTEGER PRIMARY KEY)`);
    if (this.fails) throw new Error('step failed');
  }
}

describe('SchemaMigrator', () => {
  let root: string;
  let dbPath: string;
  let backupDir: string;
  const open: Database.Database[] = [];

  const connect = () => {
    const conn = new Database(dbPath);
    conn.pragma('foreign_keys = ON');
    open.push(conn);
    return conn;
  };
  const backupFor = (conn: Database.Database) =>
    new DatabaseBackup(conn, backupDir, new FixedClock(), new LocalCalendar());
  const migrator = (
    conn: Database.Database,
    steps: MigrationStep[] = [],
    latest = LATEST_SCHEMA_VERSION,
    backup: MigrationBackup = backupFor(conn)
  ) => new SchemaMigrator(conn, currentSchema, latest, steps, backup);
  const version = (conn: Database.Database) =>
    conn.pragma('user_version', { simple: true });
  const tables = (conn: Database.Database) =>
    conn
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all();

  /** A database as an older release left it: schema without a version stamp, with live rows. */
  const legacyDatabase = () => {
    const conn = connect();
    conn.exec(legacySchema);
    conn.exec(`
      INSERT INTO seasons (id, name, starts_on, ends_on, price_cents) VALUES (1, '2025/2026', '2025-09-01', '2026-08-31', 5600);
      INSERT INTO players (id, name) VALUES (1, 'Ana López'), (2, 'Beto Ruiz'), (3, 'Carlos García');
      INSERT INTO games (id, season_id, played_on, status) VALUES (1, 1, '2025-09-10', 'played'), (2, 1, '2025-09-17', 'open');
      INSERT INTO participations (game_id, player_id, signed_up, played, paid_cents, paid_on)
        VALUES (1, 1, 1, 1, 800, '2025-09-12'), (1, 2, 1, 1, 0, NULL);
      INSERT INTO convocatorias (id, game_id, rules_json, confirmed_at, source)
        VALUES (1, 1, '{}', '2025-09-09', 'history');
      INSERT INTO share_debts (game_id, holder_player_id, beneficiary_player_id, amount_cents) VALUES (1, 2, 2, 800);
      INSERT INTO payments (game_id, holder_player_id, beneficiary_player_id, payer_player_id, amount_cents, paid_on)
        VALUES (1, 1, 1, 1, 800, '2025-09-12');
    `);
    return conn;
  };
  const counts = (conn: Database.Database) => {
    const names = [
      'seasons',
      'players',
      'games',
      'participations',
      'convocatorias',
      'share_debts',
      'payments',
    ];
    return Object.fromEntries(
      names.map(n => [
        n,
        (conn.prepare(`SELECT COUNT(*) AS c FROM ${n}`).get() as { c: number })
          .c,
      ])
    );
  };
  const content = (conn: Database.Database) =>
    conn
      .prepare(
        `SELECT g.id, g.played_on, g.status, p.player_id, p.paid_cents, p.paid_on,
                (SELECT SUM(amount_cents) FROM payments) AS paid_total,
                (SELECT holder_player_id FROM share_debts) AS debt_holder
           FROM games g LEFT JOIN participations p ON p.game_id = g.id ORDER BY g.id, p.player_id`
      )
      .all();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pachanguero-migrator-'));
    dbPath = join(root, 'live.db');
    backupDir = join(root, 'backups');
  });

  afterEach(() => {
    for (const conn of open.splice(0)) conn.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('gives a new file the whole schema and the latest version, with no backup', () => {
    const conn = connect();
    migrator(conn).run();
    expect(version(conn)).toBe(LATEST_SCHEMA_VERSION);
    expect(tables(conn).length).toBeGreaterThan(10);
    expect(existsSync(backupDir)).toBe(false);
  });

  it('keeps every row of a file written before versions existed', () => {
    const conn = legacyDatabase();
    const before = { counts: counts(conn), content: content(conn) };
    expect(version(conn)).toBe(0);

    migrator(conn).run();

    expect(counts(conn)).toEqual(before.counts);
    expect(content(conn)).toEqual(before.content);
    expect(version(conn)).toBe(LATEST_SCHEMA_VERSION);
  });

  it('migrates a legacy file to the same schema as a new one', () => {
    const fresh = new Database(':memory:');
    open.push(fresh);
    migrator(fresh).run();

    const legacy = legacyDatabase();
    migrator(legacy, [
      new PaymentMethodMigration(),
      new PlayerBizumNameMigration(),
      new PaymentBizumLinkMigration(),
      new PlayerBizumNamesMigration(),
    ]).run();

    // ALTER TABLE words an added column's definition differently from schema.sql, so the tables
    // a step alters are compared by their columns, the rest by definition.
    const altered = ['payments', 'players'];
    const apartFromAltered = (conn: Database.Database) =>
      tables(conn).filter(t => !altered.includes((t as { name: string }).name));
    expect(apartFromAltered(legacy)).toEqual(apartFromAltered(fresh));
    for (const table of altered) {
      expect(legacy.pragma(`table_info(${table})`)).toEqual(
        fresh.pragma(`table_info(${table})`)
      );
    }
  });

  it('adds the account tables, empty, to a file written before they existed', () => {
    const conn = legacyDatabase();
    migrator(conn).run();
    for (const table of ['users', 'refresh_tokens']) {
      expect(conn.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()).toEqual({
        c: 0,
      });
    }
  });

  it('adds the contact table, empty, to a migrated file and to one already at the latest version', () => {
    const conn = legacyDatabase();
    migrator(conn).run();
    const contacts = () =>
      conn.prepare('SELECT COUNT(*) AS c FROM player_contacts').get();
    expect(contacts()).toEqual({ c: 0 });

    conn.exec('DROP TABLE player_contacts');
    migrator(conn).run();
    expect(contacts()).toEqual({ c: 0 });
  });

  it('starting the same file twice makes one backup and no more', () => {
    const first = legacyDatabase();
    migrator(first).run();
    expect(readdirSync(backupDir)).toEqual([
      'pachanguero-20261011-193000-before-migration.db',
    ]);

    const again = connect();
    migrator(again).run();
    expect(readdirSync(backupDir)).toEqual([
      'pachanguero-20261011-193000-before-migration.db',
    ]);
    expect(version(again)).toBe(LATEST_SCHEMA_VERSION);
  });

  it('writes a backup that holds the rows the file had before it was migrated', () => {
    const conn = legacyDatabase();
    const before = counts(conn);
    migrator(conn).run();

    const copy = new Database(join(backupDir, readdirSync(backupDir)[0]), {
      readonly: true,
    });
    open.push(copy);
    expect(counts(copy)).toEqual(before);
    expect(version(copy)).toBe(0);
  });

  it('does not migrate, and reports the failure, when the backup cannot be written', () => {
    const conn = legacyDatabase();
    const run = () =>
      migrator(
        conn,
        [new AddsATable(1, 'extra')],
        1,
        new FailingBackup()
      ).run();

    expect(run).toThrow('disk full');
    expect(version(conn)).toBe(0);
    expect(tables(conn).map(t => (t as { name: string }).name)).not.toContain(
      'extra'
    );
  });

  it('applies the steps above the stored version, in order, and stamps the latest', () => {
    const conn = legacyDatabase();
    migrator(
      conn,
      [new AddsATable(1, 'one'), new AddsATable(2, 'two')],
      2
    ).run();
    const names = tables(conn).map(t => (t as { name: string }).name);
    expect(names).toContain('one');
    expect(names).toContain('two');
    expect(version(conn)).toBe(2);

    conn.pragma('user_version = 1');
    conn.exec('DROP TABLE two');
    migrator(
      conn,
      [new AddsATable(1, 'one'), new AddsATable(2, 'two')],
      2
    ).run();
    expect(tables(conn).map(t => (t as { name: string }).name)).toContain(
      'two'
    );
  });

  it('leaves the file at its old version when a step fails halfway', () => {
    const conn = legacyDatabase();
    const run = () =>
      migrator(conn, [new AddsATable(1, 'half', true)], 1).run();

    expect(run).toThrow('step failed');
    expect(version(conn)).toBe(0);
    expect(tables(conn).map(t => (t as { name: string }).name)).not.toContain(
      'half'
    );
  });

  it('migrates a version 2 file that is not in WAL mode, as a backup is', () => {
    const conn = connect();
    conn.exec(schemaV2.replace('PRAGMA journal_mode = WAL;', ''));
    conn.pragma('user_version = 2');
    expect(conn.pragma('journal_mode', { simple: true })).toBe('delete');

    migrator(conn, [
      new PaymentMethodMigration(),
      new PlayerBizumNameMigration(),
      new PaymentBizumLinkMigration(),
    ]).run();

    expect(version(conn)).toBe(LATEST_SCHEMA_VERSION);
    expect(conn.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('migrates a version 2 file with payments: backup, latest version, rows unchanged and read "otro", same columns as a new file', () => {
    const conn = connect();
    conn.exec(schemaV2);
    conn.pragma('user_version = 2');
    conn.exec(`
      INSERT INTO seasons (id, name, starts_on, ends_on, price_cents) VALUES (1, '2026/2027', '2026-09-01', '2027-08-31', 5600);
      INSERT INTO players (id, name) VALUES (1, 'Ana López'), (2, 'Beto Ruiz'), (3, 'Carlos García');
      INSERT INTO games (id, season_id, played_on, status) VALUES (1, 1, '2026-10-07', 'played');
      INSERT INTO payments (game_id, holder_player_id, beneficiary_player_id, payer_player_id, amount_cents, paid_on)
        VALUES (1, 1, 1, 1, 400, '2026-10-07'), (1, 2, 2, 2, 400, '2026-10-08'), (1, 3, 3, 3, 400, '2026-10-09');
    `);
    const before = conn
      .prepare('SELECT * FROM payments ORDER BY id')
      .all() as Record<string, unknown>[];

    migrator(conn, [
      new PaymentMethodMigration(),
      new PlayerBizumNameMigration(),
      new PaymentBizumLinkMigration(),
      new PlayerBizumNamesMigration(),
    ]).run();

    expect(readdirSync(backupDir)).toHaveLength(1);
    expect(version(conn)).toBe(LATEST_SCHEMA_VERSION);
    expect(conn.prepare('SELECT * FROM payments ORDER BY id').all()).toEqual(
      before.map(row => ({ ...row, method: 'otro', bizum_id: null }))
    );

    const fresh = new Database(':memory:');
    open.push(fresh);
    migrator(fresh).run();
    const columns = (c: Database.Database) => c.pragma('table_info(payments)');
    expect(columns(conn)).toEqual(columns(fresh));
  });

  it('migrates a version 3 file with players: backup, latest version, rows unchanged, same columns as a new file', () => {
    const conn = connect();
    conn.exec(schemaV3);
    conn.pragma('user_version = 3');
    conn.exec(`
      INSERT INTO players (id, name) VALUES (1, 'Ana López'), (2, 'Beto Ruiz');
    `);
    const before = conn
      .prepare('SELECT * FROM players ORDER BY id')
      .all() as Record<string, unknown>[];

    migrator(conn, [
      new PlayerBizumNameMigration(),
      new PaymentBizumLinkMigration(),
      new PlayerBizumNamesMigration(),
    ]).run();

    expect(readdirSync(backupDir)).toHaveLength(1);
    expect(version(conn)).toBe(LATEST_SCHEMA_VERSION);
    expect(conn.prepare('SELECT * FROM players ORDER BY id').all()).toEqual(
      before
    );

    const fresh = new Database(':memory:');
    open.push(fresh);
    migrator(fresh).run();
    const columns = (c: Database.Database) => c.pragma('table_info(players)');
    expect(columns(conn)).toEqual(columns(fresh));
  });

  it('migrates a version 4 file with payments: backup, version 5, rows unchanged and linked to no Bizum, same columns as a new file', () => {
    const conn = connect();
    conn.exec(schemaV4);
    conn.pragma('user_version = 4');
    conn.exec(`
      INSERT INTO seasons (id, name, starts_on, ends_on, price_cents) VALUES (1, '2026/2027', '2026-09-01', '2027-08-31', 5600);
      INSERT INTO players (id, name) VALUES (1, 'Ana López'), (2, 'Beto Ruiz');
      INSERT INTO games (id, season_id, played_on, status) VALUES (1, 1, '2026-10-07', 'played');
      INSERT INTO payments (game_id, holder_player_id, beneficiary_player_id, payer_player_id, amount_cents, paid_on, method)
        VALUES (1, 1, 1, 1, 400, '2026-10-07', 'efectivo'), (1, 2, 2, 2, 400, '2026-10-08', 'bizum');
    `);
    const before = conn
      .prepare('SELECT * FROM payments ORDER BY id')
      .all() as Record<string, unknown>[];

    migrator(conn, [
      new PaymentBizumLinkMigration(),
      new PlayerBizumNamesMigration(),
    ]).run();

    expect(readdirSync(backupDir)).toHaveLength(1);
    expect(version(conn)).toBe(LATEST_SCHEMA_VERSION);
    expect(conn.prepare('SELECT * FROM payments ORDER BY id').all()).toEqual(
      before.map(row => ({ ...row, bizum_id: null }))
    );

    const fresh = new Database(':memory:');
    open.push(fresh);
    migrator(fresh).run();
    const columns = (c: Database.Database) => c.pragma('table_info(payments)');
    expect(columns(conn)).toEqual(columns(fresh));
    for (const table of ['bizums', 'bizum_entries', 'bizum_handling']) {
      expect(tables(conn).map(t => (t as { name: string }).name)).toContain(
        table
      );
    }
  });

  it('migrates a version 5 file: each Bizum name goes to its own table, the column goes, nothing else changes, same columns as a new file', () => {
    const conn = connect();
    conn.exec(schemaV5);
    conn.pragma('user_version = 5');
    conn.exec(`
      INSERT INTO players (id, name, bizum_name) VALUES (1, 'Ana López', 'Ana L.'), (2, 'Beto Ruiz', NULL), (3, 'Carlos García', 'Ana L.');
    `);

    migrator(conn, [new PlayerBizumNamesMigration()]).run();

    expect(readdirSync(backupDir)).toHaveLength(1);
    expect(version(conn)).toBe(LATEST_SCHEMA_VERSION);
    expect(
      conn
        .prepare(
          'SELECT player_id, bizum_name FROM player_bizum_names ORDER BY player_id'
        )
        .all()
    ).toEqual([
      { player_id: 1, bizum_name: 'Ana L.' },
      { player_id: 3, bizum_name: 'Ana L.' },
    ]);
    expect(
      conn.prepare('SELECT id, name FROM players ORDER BY id').all()
    ).toEqual([
      { id: 1, name: 'Ana López' },
      { id: 2, name: 'Beto Ruiz' },
      { id: 3, name: 'Carlos García' },
    ]);

    const fresh = new Database(':memory:');
    open.push(fresh);
    migrator(fresh).run();
    const columns = (c: Database.Database) => c.pragma('table_info(players)');
    expect(columns(conn)).toEqual(columns(fresh));
    // Dropping a column rewrites the table's definition, so `players` is compared by its columns.
    const apartFromPlayers = (c: Database.Database) =>
      tables(c).filter(t => (t as { name: string }).name !== 'players');
    expect(apartFromPlayers(conn)).toEqual(apartFromPlayers(fresh));
  });

  it('refuses a file made by a newer application and touches nothing', () => {
    const conn = legacyDatabase();
    conn.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`);

    expect(() => migrator(conn).run()).toThrow('más nueva');
    expect(existsSync(backupDir)).toBe(false);
    expect(version(conn)).toBe(LATEST_SCHEMA_VERSION + 1);
  });
});
