import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { RefreshTokenRepository } from './refresh-token-repository.js';
import { UserRepository } from './user-repository.js';

describe('RefreshTokenRepository', () => {
  let conn: Database.Database;
  let tokens: RefreshTokenRepository;
  let userId: number;
  const now = new Date('2026-10-11T10:00:00.000Z');
  const later = new Date('2026-11-10T10:00:00.000Z');

  const insert = (hash: string, expiresAt = later) =>
    tokens.insert({ userId, tokenHash: hash, view: 'admin', expiresAt });

  beforeEach(() => {
    conn = TestDatabase.create();
    tokens = new RefreshTokenRepository(conn);
    userId = new UserRepository(conn).create({
      username: 'boss',
      passwordHash: 'h',
      role: 'admin',
      playerId: null,
    }).id;
  });

  it('inserts a token and finds it by its hash', () => {
    insert('abc');
    expect(tokens.findByHash('abc')).toMatchObject({
      userId,
      tokenHash: 'abc',
      view: 'admin',
      expiresAt: later,
      revoked: false,
    });
    expect(tokens.findByHash('missing')).toBeUndefined();
  });

  it('revokes a live token once and reports it only the first time', () => {
    insert('abc');
    const id = tokens.findByHash('abc')!.id;
    expect(tokens.revokeIfLive(id)).toBe(true);
    expect(tokens.revokeIfLive(id)).toBe(false);
    expect(tokens.findByHash('abc')!.revoked).toBe(true);
  });

  it('revokes every live token of a user and counts them', () => {
    insert('a');
    insert('b');
    tokens.revokeIfLive(tokens.findByHash('a')!.id);
    expect(tokens.revokeAllFor(userId)).toBe(1);
    expect(tokens.findByHash('b')!.revoked).toBe(true);
  });

  it('changes the view of a token', () => {
    insert('abc');
    tokens.setView(tokens.findByHash('abc')!.id, 'regular');
    expect(tokens.findByHash('abc')!.view).toBe('regular');
  });

  it('purges expired tokens and old revoked ones and keeps live ones', () => {
    insert('live');
    insert('expired', new Date('2026-10-01T00:00:00.000Z'));
    insert('old-revoked');
    insert('fresh-revoked');
    conn
      .prepare(
        "UPDATE refresh_tokens SET revoked = 1, created_at = '2026-10-01 00:00:00' WHERE token_hash = 'old-revoked'"
      )
      .run();
    conn
      .prepare(
        "UPDATE refresh_tokens SET revoked = 1, created_at = '2026-10-11 09:00:00' WHERE token_hash = 'fresh-revoked'"
      )
      .run();

    expect(tokens.purge(now)).toBe(2);
    expect(tokens.findByHash('live')).toBeDefined();
    expect(tokens.findByHash('fresh-revoked')).toBeDefined();
    expect(tokens.findByHash('expired')).toBeUndefined();
    expect(tokens.findByHash('old-revoked')).toBeUndefined();
  });

  it('is removed with its user', () => {
    insert('abc');
    conn.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(tokens.findByHash('abc')).toBeUndefined();
  });

  it('refuses a view that is not admin or regular', () => {
    expect(() =>
      tokens.insert({
        userId,
        tokenHash: 'x',
        view: 'other' as never,
        expiresAt: later,
      })
    ).toThrow(/CHECK/);
  });
});
