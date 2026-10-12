import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { PasswordHasher } from '../domain/password-hasher.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import {
  PasswordChangeError,
  PasswordChangeService,
} from './password-change-service.js';
import { PlayerRepository } from './player-repository.js';
import { RefreshTokenRepository } from './refresh-token-repository.js';
import { UserRepository } from './user-repository.js';

const OLD = 'Gol-del-Miercoles7';
const NEW = 'Penalti-en-Mayo42';

describe('PasswordChangeService', () => {
  let conn: Database.Database;
  let users: UserRepository;
  let tokens: RefreshTokenRepository;
  let hasher: PasswordHasher;
  let service: PasswordChangeService;
  let userId: number;

  const refusal = async (...args: [string, string, string]) => {
    try {
      await service.change(userId, ...args);
    } catch (error) {
      expect(error).toBeInstanceOf(PasswordChangeError);
      return error as PasswordChangeError;
    }
    throw new Error('expected a refusal');
  };
  const hash = () => users.byId(userId)!.passwordHash;
  const liveTokens = () =>
    (
      conn
        .prepare('SELECT COUNT(*) AS n FROM refresh_tokens WHERE revoked = 0')
        .get() as { n: number }
    ).n;

  beforeEach(async () => {
    conn = TestDatabase.create();
    users = new UserRepository(conn);
    tokens = new RefreshTokenRepository(conn);
    hasher = new PasswordHasher(2 ** 10);
    service = new PasswordChangeService(
      users,
      tokens,
      hasher,
      new PasswordPolicy(),
      conn
    );
    const playerId = new PlayerRepository(conn).register('Carlos').id;
    userId = users.create({
      username: 'carlos',
      passwordHash: await hasher.hash(OLD),
      role: 'regular',
      playerId,
    }).id;
    for (const n of [1, 2]) {
      tokens.insert({
        userId,
        tokenHash: `hash-${n}`,
        view: 'admin',
        expiresAt: new Date('2027-01-01T00:00:00Z'),
      });
    }
  });

  it('replaces the password and revokes every session of the user', async () => {
    await service.change(userId, OLD, NEW, NEW);

    expect(await hasher.verify(NEW, hash())).toBe(true);
    expect(await hasher.verify(OLD, hash())).toBe(false);
    expect(liveTokens()).toBe(0);
  });

  it('refuses a wrong current password without touching anything or counting an attempt', async () => {
    const before = hash();

    const error = await refusal('Wrong-Password1!', NEW, NEW);

    expect(error.message).toBe('La contraseña actual no es correcta');
    expect(hash()).toBe(before);
    expect(liveTokens()).toBe(2);
    expect(users.byId(userId)!.failedAttempts).toBe(0);
  });

  it('refuses a confirmation that differs', async () => {
    const error = await refusal(OLD, NEW, `${NEW}x`);
    expect(error.message).toContain('no coinciden');
    expect(liveTokens()).toBe(2);
  });

  it.each([
    ['short1!A', 'length'],
    ['alllowercase1!x', 'uppercase'],
    ['ALLUPPERCASE1!X', 'lowercase'],
    ['NoDigitsInHere!!', 'digit'],
    ['NoSpecialChar123', 'special'],
  ])('refuses %s and lists the rule it breaks', async (candidate, rule) => {
    const error = await refusal(OLD, candidate, candidate);
    expect(error.rules).toContain(new PasswordPolicy().describe(rule as never));
    expect(liveTokens()).toBe(2);
  });

  it('refuses the same password again', async () => {
    const error = await refusal(OLD, OLD, OLD);
    expect(error.message).toContain('distinta');
    expect(liveTokens()).toBe(2);
  });
});
