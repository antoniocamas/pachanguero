import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { UserRepository } from './user-repository.js';

describe('UserRepository', () => {
  let conn: Database.Database;
  let users: UserRepository;
  let carlos: number;
  let ana: number;

  const regular = (username: string, playerId: number | null) =>
    users.create({ username, passwordHash: 'h', role: 'regular', playerId });
  const admin = (username: string, playerId: number | null = null) =>
    users.create({ username, passwordHash: 'h', role: 'admin', playerId });

  beforeEach(() => {
    conn = TestDatabase.create();
    users = new UserRepository(conn);
    carlos = Number(
      conn.prepare("INSERT INTO players (name) VALUES ('Carlos García')").run()
        .lastInsertRowid
    );
    ana = Number(
      conn.prepare("INSERT INTO players (name) VALUES ('Ana López')").run()
        .lastInsertRowid
    );
  });

  it('creates a user and reads it back by id, username and player', () => {
    const created = regular('carlos', carlos);
    expect(created).toMatchObject({
      username: 'carlos',
      role: 'regular',
      playerId: carlos,
      active: true,
      failedAttempts: 0,
      lockedUntil: null,
      lastLogin: null,
    });
    expect(users.byId(created.id)).toEqual(created);
    expect(users.byUsername('carlos')).toEqual(created);
    expect(users.byPlayer(carlos)).toEqual(created);
    expect(users.byUsername('nobody')).toBeUndefined();
  });

  it('refuses a duplicate username', () => {
    admin('boss');
    expect(() => admin('boss')).toThrow(/UNIQUE/);
  });

  it('refuses a second user for the same player', () => {
    regular('carlos', carlos);
    expect(() => regular('carlos2', carlos)).toThrow(/UNIQUE/);
  });

  it('refuses a regular user without a player and an unknown role', () => {
    expect(() => regular('nobody', null)).toThrow(/CHECK/);
    expect(() =>
      users.create({
        username: 'x1',
        passwordHash: 'h',
        role: 'owner' as never,
        playerId: null,
      })
    ).toThrow(/CHECK/);
  });

  it('allows an admin with or without a player', () => {
    expect(admin('boss').playerId).toBeNull();
    expect(admin('ana', ana).playerId).toBe(ana);
  });

  it('refuses to delete a player that has a user', () => {
    regular('carlos', carlos);
    expect(() =>
      conn.prepare('DELETE FROM players WHERE id = ?').run(carlos)
    ).toThrow(/FOREIGN KEY/);
  });

  describe('reserveAttempt', () => {
    const now = new Date('2026-10-11T10:00:00.000Z');

    it('counts up from zero, one call after another', () => {
      const user = admin('boss');
      expect(users.reserveAttempt(user.id, now, 4).failedAttempts).toBe(1);
      expect(users.reserveAttempt(user.id, now, 4).failedAttempts).toBe(2);
      expect(users.byId(user.id)!.failedAttempts).toBe(2);
    });

    it('keeps a lock that is still live', () => {
      const user = admin('boss');
      users.lockUntil(user.id, new Date('2026-10-11T10:10:00.000Z'));
      const result = users.reserveAttempt(user.id, now, 4);
      expect(result.failedAttempts).toBe(1);
      expect(result.lockedUntil).toEqual(new Date('2026-10-11T10:10:00.000Z'));
    });

    it('clears an expired lock and restarts the count at the given value', () => {
      const user = admin('boss');
      users.lockUntil(user.id, new Date('2026-10-11T09:59:00.000Z'));
      const result = users.reserveAttempt(user.id, now, 4);
      expect(result).toEqual({ failedAttempts: 5, lockedUntil: null });
    });
  });

  it('round-trips the lock as a date and clears it', () => {
    const user = admin('boss');
    const until = new Date('2026-10-11T10:15:00.000Z');
    users.lockUntil(user.id, until);
    expect(users.byId(user.id)!.lockedUntil).toEqual(until);
    users.clearLock(user.id);
    expect(users.byId(user.id)).toMatchObject({
      lockedUntil: null,
      failedAttempts: 0,
    });
  });

  it('treats a lock that cannot be read as locked for good', () => {
    const user = admin('boss');
    conn
      .prepare("UPDATE users SET locked_until = 'garbage' WHERE id = ?")
      .run(user.id);
    expect(users.byId(user.id)!.lockedUntil!.getTime()).toBeGreaterThan(
      Date.UTC(3000, 0, 1)
    );
  });

  it('records a success: count and lock cleared, last login set', () => {
    const user = admin('boss');
    users.reserveAttempt(user.id, new Date(), 4);
    users.lockUntil(user.id, new Date(Date.now() + 1000));
    const at = new Date('2026-10-11T11:00:00.000Z');
    users.recordSuccess(user.id, at);
    expect(users.byId(user.id)).toMatchObject({
      failedAttempts: 0,
      lockedUntil: null,
      lastLogin: at,
    });
  });

  it('changes the hash, the active flag and the role', () => {
    const user = regular('carlos', carlos);
    users.setPasswordHash(user.id, 'new');
    users.setActive(user.id, false);
    users.setRole(user.id, 'admin');
    expect(users.byId(user.id)).toMatchObject({
      passwordHash: 'new',
      active: false,
      role: 'admin',
    });
  });

  it('counts only active admins', () => {
    const one = admin('one');
    admin('two');
    regular('carlos', carlos);
    expect(users.activeAdminCount()).toBe(2);
    users.setActive(one.id, false);
    expect(users.activeAdminCount()).toBe(1);
  });

  it('lists users by username without exposing anything but records', () => {
    admin('zeta');
    admin('alfa');
    expect(users.list().map(u => u.username)).toEqual(['alfa', 'zeta']);
  });
});
