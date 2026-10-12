import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { ManualClock } from '../domain/clock-test-support.js';
import { PasswordHasher } from '../domain/password-hasher.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import { UsernamePolicy } from '../domain/username-policy.js';
import { DebtRepository } from '../repo/debt-repository.js';
import { GameRepository } from '../repo/game-repository.js';
import { PlayerRepository } from '../repo/player-repository.js';
import { RefreshTokenRepository } from '../repo/refresh-token-repository.js';
import { SeasonRepository } from '../repo/season-repository.js';
import { UserAdminService } from '../repo/user-admin-service.js';
import { UserRepository } from '../repo/user-repository.js';
import { DevAccountSeeder } from './dev-account-seeder.js';

describe('DevAccountSeeder', () => {
  let users: UserRepository;
  let seeder: DevAccountSeeder;
  let hasher: PasswordHasher;
  let beto: number;
  let carlos: number;

  beforeEach(() => {
    const db = TestDatabase.create();
    const players = new PlayerRepository(db);
    const debts = new DebtRepository(db);
    users = new UserRepository(db);
    hasher = new PasswordHasher(2 ** 10);
    seeder = new DevAccountSeeder(
      new UserAdminService(
        users,
        new RefreshTokenRepository(db),
        players,
        hasher,
        new PasswordPolicy(),
        new UsernamePolicy(),
        new ManualClock(new Date('2026-10-11T10:00:00.000Z')),
        db
      ),
      debts,
      players
    );
    players.register('Ana López');
    beto = players.register('Beto Ruiz').id;
    carlos = players.register('Carlos García').id;
    const season = new SeasonRepository(db).create({ name: '2025/2026' }).id;
    const game = new GameRepository(db).create(season, '2025-09-10').id;
    debts.insert(game, { playerId: beto }, beto, 800);
    debts.insert(game, { playerId: carlos }, carlos, 400);
  });

  it('creates an admin, an admin who is a player and a regular user, with the two players owing most', async () => {
    const created = await seeder.seed();

    expect(created.map(a => [a.username, a.role, a.playerName])).toEqual([
      ['admin', 'admin', null],
      ['jefe', 'admin', 'Carlos García'],
      ['jugador', 'regular', 'Beto Ruiz'],
    ]);
    expect(users.byUsername('jugador')?.playerId).toBe(beto);
    expect(users.byUsername('jefe')?.playerId).toBe(carlos);
  });

  it('gives them all the documented password', async () => {
    await seeder.seed();
    const hash = users.byUsername('jugador')!.passwordHash;
    expect(await hasher.verify(DevAccountSeeder.PASSWORD, hash)).toBe(true);
  });

  it('leaves existing accounts alone, so running it twice creates nothing more', async () => {
    await seeder.seed();
    expect(await seeder.seed()).toEqual([]);
    expect(users.list()).toHaveLength(3);
  });
});
