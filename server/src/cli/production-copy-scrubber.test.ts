import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { PasswordHasher } from '../domain/password-hasher.js';
import { DevAccountSeeder } from './dev-account-seeder.js';
import { ProductionCopyGuard } from './production-copy-guard.js';
import { ProductionCopyScrubber } from './production-copy-scrubber.js';

describe('ProductionCopyScrubber', () => {
  let db: Database.Database;
  let hasher: PasswordHasher;
  let scrubber: ProductionCopyScrubber;

  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

  beforeEach(() => {
    db = TestDatabase.create();
    hasher = new PasswordHasher(2 ** 10);
    scrubber = new ProductionCopyScrubber(db, hasher);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, failed_attempts, locked_until)
       VALUES (1, 'antonio', 'real-hash', 'admin', 5, '2099-01-01T00:00:00.000Z')`
    ).run();
    db.prepare(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES (1, 'h', '2099-01-01T00:00:00.000Z')`
    ).run();
    db.prepare(
      `INSERT INTO bank_connection (id, bank_id, session_id, valid_until, state, connected_at, accounts_json)
       VALUES (1, 'b', 'live-session', '2099-01-01', 'connected', '2026-01-01', '[]')`
    ).run();
    db.prepare(
      `INSERT INTO bank_authorizations (state_hash, bank_id, purpose, created_at, expires_at)
       VALUES ('s', 'b', 'connect', '2026-01-01', '2099-01-01')`
    ).run();
  });

  it('ends every session and gives every account the development password, unlocked', async () => {
    const report = await scrubber.scrub({ keepBank: false });

    expect(report).toEqual({ users: 1, sessions: 1, bankConnection: true });
    expect(count('refresh_tokens')).toBe(0);
    const user = db
      .prepare('SELECT password_hash, failed_attempts, locked_until FROM users')
      .get() as {
      password_hash: string;
      failed_attempts: number;
      locked_until: string | null;
    };
    expect(
      await hasher.verify(DevAccountSeeder.PASSWORD, user.password_hash)
    ).toBe(true);
    expect(user).toMatchObject({ failed_attempts: 0, locked_until: null });
  });

  it('removes the bank connection and pending authorizations', async () => {
    await scrubber.scrub({ keepBank: false });
    expect(count('bank_connection')).toBe(0);
    expect(count('bank_authorizations')).toBe(0);
  });

  it('keeps the bank connection when asked to', async () => {
    const report = await scrubber.scrub({ keepBank: true });
    expect(report.bankConnection).toBe(false);
    expect(count('bank_connection')).toBe(1);
    expect(count('bank_authorizations')).toBe(1);
  });
});

describe('ProductionCopyGuard', () => {
  const guard = new ProductionCopyGuard('/repo/data/prod-copy');

  it('accepts a database inside the folder', () => {
    expect(() =>
      guard.check('/repo/data/prod-copy/pachanguero.db')
    ).not.toThrow();
  });

  it('refuses any other database', () => {
    expect(() => guard.check('/repo/data/pachanguero.db')).toThrow(
      /no se modifica/
    );
    expect(() => guard.check('/repo/data/prod-copy')).toThrow();
    expect(() => guard.check('/repo/data/prod-copy-2/x.db')).toThrow();
  });
});
