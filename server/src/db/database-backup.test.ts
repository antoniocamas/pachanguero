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
import { LocalCalendar } from '../domain/local-calendar.js';
import { DatabaseBackup } from './database-backup.js';

class FixedClock implements Clock {
  now(): Date {
    return new Date(2026, 9, 11, 19, 30, 0);
  }
}

describe('DatabaseBackup', () => {
  let root: string;
  let conn: Database.Database;
  let backupDir: string;

  const backup = (dir = backupDir) =>
    new DatabaseBackup(conn, dir, new FixedClock(), new LocalCalendar());

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

  it('names the copy after the moment and the label', () => {
    const path = backup().create('before-migration');
    expect(path).toBe(
      join(backupDir, 'pachanguero-20261011-193000-before-migration.db')
    );
    expect(backup().create()).toBe(
      join(backupDir, 'pachanguero-20261011-193000.db')
    );
  });

  it('writes into the directory it is given', () => {
    const elsewhere = join(root, 'another', 'place');
    expect(backup(elsewhere).create().startsWith(elsewhere)).toBe(true);
    expect(existsSync(backupDir)).toBe(false);
  });

  it('creates the directory readable by its owner only and the file the same', () => {
    const path = backup().create();
    expect(statSync(backupDir).mode & 0o777).toBe(0o700);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('holds rows that are still only in the write-ahead log', () => {
    conn.pragma('wal_autocheckpoint = 0');
    conn.exec('INSERT INTO t VALUES (4), (5)');
    expect(statSync(join(root, 'live.db-wal')).size).toBeGreaterThan(0);

    const copy = new Database(backup().create(), { readonly: true });
    expect(copy.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 5 });
    copy.close();
  });

  it('never overwrites a backup that exists', () => {
    mkdirSync(backupDir);
    const taken = join(backupDir, 'pachanguero-20261011-193000.db');
    writeFileSync(taken, 'precious');

    const path = backup().create();
    expect(path).toBe(join(backupDir, 'pachanguero-20261011-193000-2.db'));
    expect(backup().create()).toBe(
      join(backupDir, 'pachanguero-20261011-193000-3.db')
    );
    expect(statSync(taken).size).toBe('precious'.length);
  });

  it('throws and leaves no partial file when the directory cannot be written', () => {
    mkdirSync(backupDir);
    chmodSync(backupDir, 0o500);
    expect(() => backup().create()).toThrow();
    chmodSync(backupDir, 0o700);
    expect(readdirSync(backupDir)).toEqual([]);
  });

  it('replaces a stale partial file left by an earlier failure', () => {
    mkdirSync(backupDir);
    writeFileSync(
      join(backupDir, 'pachanguero-20261011-193000.db.part'),
      'half a copy'
    );

    const path = backup().create();
    expect(readdirSync(backupDir)).toEqual([path.split('/').pop()]);
    const copy = new Database(path, { readonly: true });
    expect(copy.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 3 });
    copy.close();
  });
});
