import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { ManualClock } from '../domain/clock-test-support.js';
import { PasswordHasher } from '../domain/password-hasher.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import { UsernamePolicy } from '../domain/username-policy.js';
import { PlayerRepository } from './player-repository.js';
import { RefreshTokenRepository } from './refresh-token-repository.js';
import { UserAdminError, UserAdminService } from './user-admin-service.js';
import { UserRepository } from './user-repository.js';

const GOOD = 'Gol-del-Miercoles7';
const OTHER = 'Penalti-en-Mayo42';

describe('UserAdminService', () => {
  let conn: Database.Database;
  let users: UserRepository;
  let tokens: RefreshTokenRepository;
  let players: PlayerRepository;
  let hasher: PasswordHasher;
  let clock: ManualClock;
  let admin: UserAdminService;
  let carlos: number;
  let antonio: number;

  const build = (h: PasswordHasher = hasher) =>
    new UserAdminService(
      users,
      tokens,
      players,
      h,
      new PasswordPolicy(),
      new UsernamePolicy(),
      clock,
      conn
    );
  const rowCounts = () =>
    ['users', 'refresh_tokens', 'players'].map(
      t =>
        (conn.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number })
          .n
    );
  const refused = async (work: () => Promise<unknown> | unknown) => {
    try {
      await work();
    } catch (error) {
      expect(error).toBeInstanceOf(UserAdminError);
      return (error as Error).message;
    }
    throw new Error('expected a refusal');
  };

  beforeEach(() => {
    conn = TestDatabase.create();
    users = new UserRepository(conn);
    tokens = new RefreshTokenRepository(conn);
    players = new PlayerRepository(conn);
    hasher = new PasswordHasher(2 ** 10);
    clock = new ManualClock(new Date('2026-10-11T10:00:00.000Z'));
    admin = build();
    players.register('Ana López');
    antonio = players.register('Antonio').id;
    carlos = players.register('Carlos García').id;
  });

  describe('create', () => {
    it('creates a regular user linked to a player by name, active, with a hash and not the text', async () => {
      const created = await admin.create({
        username: 'Carlos',
        password: GOOD,
        role: 'regular',
        player: 'carlos garcía',
      });
      expect(created).toMatchObject({
        username: 'carlos',
        role: 'regular',
        playerId: carlos,
      });
      const stored = users.byUsername('carlos')!;
      expect(stored.active).toBe(true);
      expect(stored.passwordHash).not.toContain(GOOD);
      expect(await hasher.verify(GOOD, stored.passwordHash)).toBe(true);
    });

    it('links the player by id as well', async () => {
      const created = await admin.create({
        username: 'carlos',
        password: GOOD,
        role: 'regular',
        player: String(carlos),
      });
      expect(created.playerId).toBe(carlos);
      await expect(
        admin.create({
          username: 'ghost',
          password: GOOD,
          role: 'regular',
          player: '999',
        })
      ).rejects.toThrow('999');
    });

    it('refuses a regular user without a player and creates nothing', async () => {
      const before = rowCounts();
      expect(
        await refused(() =>
          admin.create({ username: 'carlos', password: GOOD, role: 'regular' })
        )
      ).toContain('--player');
      expect(rowCounts()).toEqual(before);
    });

    it('refuses a second user for a player who has one, naming the first', async () => {
      await admin.create({
        username: 'carlos',
        password: GOOD,
        role: 'regular',
        player: 'Carlos García',
      });
      const message = await refused(() =>
        admin.create({
          username: 'carlos2',
          password: GOOD,
          role: 'regular',
          player: String(carlos),
        })
      );
      expect(message).toContain('carlos');
      expect(message).toContain('Carlos García');
    });

    it('refuses a username that exists, also in another case, and one that is not valid', async () => {
      await admin.create({ username: 'boss', password: GOOD, role: 'admin' });
      expect(
        await refused(() =>
          admin.create({ username: 'BOSS', password: GOOD, role: 'admin' })
        )
      ).toContain('ya existe');
      expect(
        await refused(() =>
          admin.create({ username: 'b', password: GOOD, role: 'admin' })
        )
      ).toContain('3 a 32');
    });

    it.each([
      ['Gol-7', 'al menos 12'],
      ['gol-del-miercoles7', 'mayúscula'],
      ['GOL-DEL-MIERCOLES7', 'minúscula'],
      ['Gol-del-miercoles', 'número'],
      ['Goldelmiercoles77', 'especial'],
    ])('refuses the password %s and says why', async (password, reason) => {
      const before = rowCounts();
      expect(
        await refused(() =>
          admin.create({ username: 'boss', password, role: 'admin' })
        )
      ).toContain(reason);
      expect(rowCounts()).toEqual(before);
    });

    it('lists every rule a password breaks', async () => {
      const message = await refused(() =>
        admin.create({ username: 'boss', password: 'abc', role: 'admin' })
      );
      expect(message).toContain('al menos 12');
      expect(message).toContain('mayúscula');
      expect(message).toContain('número');
    });

    it('creates an admin with no player and an admin with a player', async () => {
      expect(
        (
          await admin.create({
            username: 'boss',
            password: GOOD,
            role: 'admin',
          })
        ).playerId
      ).toBeNull();
      expect(
        (
          await admin.create({
            username: 'antonio',
            password: GOOD,
            role: 'admin',
            player: 'Antonio',
          })
        ).playerId
      ).toBe(antonio);
    });

    it('refuses an unknown player and two players with one name, naming both ids', async () => {
      expect(
        await refused(() =>
          admin.create({
            username: 'ghost1',
            password: GOOD,
            role: 'regular',
            player: 'Nadie',
          })
        )
      ).toContain('Nadie');
      players.register('CARLOS GARCÍA');
      const message = await refused(() =>
        admin.create({
          username: 'carlos',
          password: GOOD,
          role: 'regular',
          player: 'Carlos García',
        })
      );
      expect(message).toContain(String(carlos));
      expect(message).toContain('varios');
    });

    it('changes nothing when hashing fails halfway', async () => {
      class Failing extends PasswordHasher {
        override async hash(): Promise<string> {
          throw new Error('hash failed');
        }
      }
      const before = rowCounts();
      await expect(
        build(new Failing(2 ** 10)).create({
          username: 'boss',
          password: GOOD,
          role: 'admin',
        })
      ).rejects.toThrow('hash failed');
      expect(rowCounts()).toEqual(before);
    });
  });

  describe('accounts that exist', () => {
    let carlosUserId: number;

    beforeEach(async () => {
      await admin.create({
        username: 'boss',
        password: GOOD,
        role: 'admin',
        player: 'Antonio',
      });
      carlosUserId = (
        await admin.create({
          username: 'carlos',
          password: GOOD,
          role: 'regular',
          player: 'Carlos García',
        })
      ).id;
    });

    it('resets a password: new hash, tokens revoked, lock and count cleared; only the new one works', async () => {
      for (const hash of ['t1', 't2']) {
        tokens.insert({
          userId: carlosUserId,
          tokenHash: hash,
          view: 'admin',
          expiresAt: new Date('2027-01-01'),
        });
      }
      users.reserveAttempt(carlosUserId, clock.now(), 4);
      users.lockUntil(carlosUserId, new Date('2026-10-11T10:30:00.000Z'));

      await admin.resetPassword('carlos', OTHER);

      const user = users.byId(carlosUserId)!;
      expect(user).toMatchObject({ failedAttempts: 0, lockedUntil: null });
      expect(await hasher.verify(OTHER, user.passwordHash)).toBe(true);
      expect(await hasher.verify(GOOD, user.passwordHash)).toBe(false);
      expect(tokens.findByHash('t1')!.revoked).toBe(true);
      expect(tokens.findByHash('t2')!.revoked).toBe(true);
    });

    it('refuses a weak new password and an unknown user, changing nothing', async () => {
      const hash = users.byId(carlosUserId)!.passwordHash;
      expect(
        await refused(() => admin.resetPassword('carlos', 'weak'))
      ).toContain('al menos 12');
      expect(
        await refused(() => admin.resetPassword('nobody', OTHER))
      ).toContain('nobody');
      expect(users.byId(carlosUserId)!.passwordHash).toBe(hash);
    });

    it('unlocks an account', () => {
      users.lockUntil(carlosUserId, new Date('2026-10-11T10:30:00.000Z'));
      admin.unlock('carlos');
      expect(users.byId(carlosUserId)).toMatchObject({
        lockedUntil: null,
        failedAttempts: 0,
      });
    });

    it('deactivates, revoking tokens, and reactivates with the same password', async () => {
      tokens.insert({
        userId: carlosUserId,
        tokenHash: 't1',
        view: 'admin',
        expiresAt: new Date('2027-01-01'),
      });
      admin.deactivate('carlos');
      expect(users.byId(carlosUserId)!.active).toBe(false);
      expect(tokens.findByHash('t1')!.revoked).toBe(true);
      admin.activate('carlos');
      const user = users.byId(carlosUserId)!;
      expect(user.active).toBe(true);
      expect(await hasher.verify(GOOD, user.passwordHash)).toBe(true);
    });

    it('promotes keeping the player, and demotes only an admin who has a player', async () => {
      admin.promote('carlos');
      expect(users.byId(carlosUserId)).toMatchObject({
        role: 'admin',
        playerId: carlos,
      });
      admin.demote('carlos');
      expect(users.byId(carlosUserId)!.role).toBe('regular');

      await admin.create({ username: 'second', password: GOOD, role: 'admin' });
      expect(await refused(() => admin.demote('second'))).toContain(
        'no tiene jugador'
      );
    });

    it('links an account with no player to a player, by name or by id, ending its sessions', async () => {
      const second = (
        await admin.create({
          username: 'second',
          password: GOOD,
          role: 'admin',
        })
      ).id;
      await admin.create({ username: 'third', password: GOOD, role: 'admin' });
      tokens.insert({
        userId: second,
        tokenHash: 's1',
        view: 'admin',
        expiresAt: new Date('2027-01-01'),
      });

      admin.link('second', 'Ana López');
      admin.link('third', String(players.register('Beto Ruiz').id));

      expect(users.byId(second)!.playerId).toBe(
        players.findByName('Ana López')[0].id
      );
      expect(users.byUsername('third')!.playerId).toBe(
        players.findByName('Beto Ruiz')[0].id
      );
      expect(tokens.findByHash('s1')!.revoked).toBe(true);
    });

    it('refuses to link an account that has a player, a player who has an account or an unknown name, changing nothing', async () => {
      await admin.create({ username: 'second', password: GOOD, role: 'admin' });
      const before = rowCounts();

      expect(await refused(() => admin.link('carlos', 'Ana López'))).toContain(
        'ya tiene un jugador: Carlos García'
      );
      expect(
        await refused(() => admin.link('second', 'Carlos García'))
      ).toContain('ya tiene el usuario "carlos"');
      expect(await refused(() => admin.link('second', 'Nadie'))).toContain(
        'No existe el jugador'
      );
      expect(await refused(() => admin.link('nobody', 'Ana López'))).toContain(
        'No existe el usuario'
      );
      expect(users.byUsername('second')!.playerId).toBeNull();
      expect(rowCounts()).toEqual(before);
    });

    it('never deactivates or demotes the only active admin, and does once there are two', async () => {
      expect(await refused(() => admin.deactivate('boss'))).toContain(
        'administrador'
      );
      expect(await refused(() => admin.demote('boss'))).toContain(
        'administrador'
      );
      expect(users.byUsername('boss')).toMatchObject({
        active: true,
        role: 'admin',
      });

      admin.promote('carlos');
      admin.deactivate('boss');
      expect(users.byUsername('boss')!.active).toBe(false);
      expect(await refused(() => admin.demote('carlos'))).toContain(
        'administrador'
      );
    });

    it("lists the accounts with the player's name, activity and lock, and never a hash", () => {
      users.lockUntil(carlosUserId, new Date('2026-10-11T10:30:00.000Z'));
      admin.deactivate('carlos');
      const listed = admin.list();
      expect(listed).toEqual([
        {
          username: 'boss',
          role: 'admin',
          playerName: 'Antonio',
          active: true,
          locked: false,
        },
        {
          username: 'carlos',
          role: 'regular',
          playerName: 'Carlos García',
          active: false,
          locked: true,
        },
      ]);
      expect(JSON.stringify(listed)).not.toContain('scrypt');
    });
  });
});
