import Database from 'better-sqlite3';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../domain/clock.js';
import { DatabaseBackup } from './database-backup.js';

class FixedClock implements Clock {
  now(): Date {
    return new Date('2026-10-11T17:30:00.000Z');
  }
}

// hard requirement UC-007-01: complete file, hidden name then rename, never deleted
describe('DatabaseBackup (hard requirement UC-007-01)', () => {
  let root: string;
  let conn: Database.Database;
  let backupDir: string;

  const backup = (dir = backupDir) =>
    new DatabaseBackup(conn, dir, new FixedClock(), '0.3.1');

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pachanguero-backup-'));
    backupDir = join(root, 'backups');
    conn = new Database(join(root, 'live.db'));
    conn.pragma('journal_mode = WAL');
    conn.exec(
      'CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1), (2), (3);'
    );
  });

  afterEach(() => {
    conn.close();
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  });

  it('names the copy after the kind, the UTC moment and the version', () => {
    expect(backup().create('periodic')).toBe(
      join(backupDir, 'periodic_20261011T173000Z_0.3.1.db')
    );
    expect(backup().create('release')).toBe(
      join(backupDir, 'release_20261011T173000Z_0.3.1.db')
    );
  });

  it('lets the version of the call win over the one it was made with', () => {
    expect(backup().create('release', '0.4.0')).toBe(
      join(backupDir, 'release_20261011T173000Z_0.4.0.db')
    );
  });

  it('says unreleased when no version is known', () => {
    expect(
      new DatabaseBackup(conn, backupDir, new FixedClock()).create('periodic')
    ).toBe(join(backupDir, 'periodic_20261011T173000Z_unreleased.db'));
  });

  it('refuses a version that would make a name the shipper ignores, and writes nothing', () => {
    expect(() => backup().create('periodic', '0.3_1')).toThrow();
    expect(readdirSync(backupDir)).toEqual([]);
  });

  it('writes into the directory it is given', () => {
    const elsewhere = join(root, 'another', 'place');
    expect(backup(elsewhere).create('periodic').startsWith(elsewhere)).toBe(
      true
    );
    expect(existsSync(backupDir)).toBe(false);
  });

  it('creates the directory readable by its owner only and the file the same', () => {
    const path = backup().create('periodic');
    expect(statSync(backupDir).mode & 0o777).toBe(0o700);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('holds rows that are still only in the write-ahead log', () => {
    conn.pragma('wal_autocheckpoint = 0');
    conn.exec('INSERT INTO t VALUES (4), (5)');
    expect(statSync(join(root, 'live.db-wal')).size).toBeGreaterThan(0);

    const copy = new Database(backup().create('periodic'), { readonly: true });
    expect(copy.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 5 });
    copy.close();
  });

  it('never overwrites a backup that exists, and counts inside the version part', () => {
    mkdirSync(backupDir);
    const taken = join(backupDir, 'periodic_20261011T173000Z_0.3.1.db');
    writeFileSync(taken, 'precious');

    expect(backup().create('periodic')).toBe(
      join(backupDir, 'periodic_20261011T173000Z_0.3.1-2.db')
    );
    expect(backup().create('periodic')).toBe(
      join(backupDir, 'periodic_20261011T173000Z_0.3.1-3.db')
    );
    expect(statSync(taken).size).toBe('precious'.length);
  });

  it('deletes nothing: the other files of the folder are untouched and the folder only grows', () => {
    mkdirSync(backupDir);
    const others = Array.from({ length: 20 }, (_, n) => `periodic_2026${n}.db`);
    for (const name of others) writeFileSync(join(backupDir, name), name);

    backup().create('periodic');

    const after = readdirSync(backupDir);
    expect(after).toHaveLength(21);
    for (const name of others) {
      expect(statSync(join(backupDir, name)).size).toBe(name.length);
    }
  });

  it('throws and leaves no partial file when the directory cannot be written', () => {
    mkdirSync(backupDir);
    chmodSync(backupDir, 0o500);
    expect(() => backup().create('periodic')).toThrow();
    chmodSync(backupDir, 0o700);
    expect(readdirSync(backupDir)).toEqual([]);
  });

  it('replaces a stale partial file left by an earlier failure', () => {
    mkdirSync(backupDir);
    writeFileSync(
      join(backupDir, '.periodic_20261011T173000Z_0.3.1.db.part'),
      'half a copy'
    );

    const path = backup().create('periodic');
    expect(readdirSync(backupDir)).toEqual([path.split('/').pop()]);
    const copy = new Database(path, { readonly: true });
    expect(copy.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 3 });
    copy.close();
  });
});
