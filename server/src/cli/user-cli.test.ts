import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestDatabase } from '../db/test-support.js';
import { ManualClock } from '../domain/clock-test-support.js';
import { PasswordHasher } from '../domain/password-hasher.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import { UsernamePolicy } from '../domain/username-policy.js';
import { PlayerRepository } from '../repo/player-repository.js';
import { RefreshTokenRepository } from '../repo/refresh-token-repository.js';
import { UserAdminService } from '../repo/user-admin-service.js';
import { UserRepository } from '../repo/user-repository.js';
import type { PasswordPrompt } from './password-prompt.js';
import { UserCli, type CliIo } from './user-cli.js';

const GOOD = 'Gol-del-Miercoles7';

class ScriptedPrompt implements PasswordPrompt {
  asked: string[] = [];
  constructor(private answers: string[]) {}
  async read(question: string): Promise<string> {
    this.asked.push(question);
    return this.answers.shift() ?? '';
  }
}

describe('UserCli', () => {
  let conn: Database.Database;
  let users: UserRepository;
  let out: string[];
  let err: string[];
  let hasher: PasswordHasher;

  const io: CliIo = { out: t => out.push(t), err: t => err.push(t) };
  const cli = (answers: string[] = [GOOD, GOOD]) => {
    const prompt = new ScriptedPrompt(answers);
    const admin = new UserAdminService(
      users,
      new RefreshTokenRepository(conn),
      new PlayerRepository(conn),
      hasher,
      new PasswordPolicy(),
      new UsernamePolicy(),
      new ManualClock(new Date('2026-10-11T10:00:00.000Z')),
      conn
    );
    return {
      run: (...argv: string[]) => new UserCli(admin, prompt, io).run(argv),
      prompt,
    };
  };

  beforeEach(() => {
    conn = TestDatabase.create();
    users = new UserRepository(conn);
    hasher = new PasswordHasher(2 ** 10);
    out = [];
    err = [];
    new PlayerRepository(conn).register('Carlos García');
  });

  it('creates a regular user, asking for the password twice, and prints a confirmation', async () => {
    const { run, prompt } = cli();
    expect(
      await run(
        'create',
        '--username',
        'carlos',
        '--role',
        'regular',
        '--player',
        'Carlos García'
      )
    ).toBe(0);
    expect(out.join('\n')).toContain(
      '✓ Usuario "carlos" creado como regular (jugador: Carlos García)'
    );
    expect(prompt.asked).toHaveLength(2);
    expect(users.byUsername('carlos')).toBeDefined();
  });

  it('refuses when the two passwords differ, creating nothing', async () => {
    expect(
      await cli([GOOD, 'Penalti-en-Mayo42']).run(
        'create',
        '--username',
        'boss',
        '--role',
        'admin'
      )
    ).toBe(1);
    expect(err.join('\n')).toContain('✗ Las contraseñas no coinciden');
    expect(users.list()).toEqual([]);
  });

  it('exits 1 with a refusal and prints it, and never prints the password or a hash', async () => {
    expect(
      await cli(['weak', 'weak']).run(
        'create',
        '--username',
        'boss',
        '--role',
        'admin'
      )
    ).toBe(1);
    expect(err.join('\n')).toContain('✗ La contraseña no es válida');
    await cli().run('create', '--username', 'boss', '--role', 'admin');
    const everything = [...out, ...err].join('\n');
    expect(everything).not.toContain(GOOD);
    expect(everything).not.toContain('scrypt$');
  });

  it('exits 2 and shows the usage on a command or option it does not know', async () => {
    expect(await cli().run()).toBe(2);
    expect(await cli().run('explode')).toBe(2);
    expect(await cli().run('create', '--role', 'admin')).toBe(2);
    expect(
      await cli().run('create', '--username', 'boss', '--role', 'owner')
    ).toBe(2);
    expect(
      await cli().run(
        'create',
        '--username',
        'boss',
        '--role',
        'admin',
        '--password',
        GOOD
      )
    ).toBe(2);
    expect(err.join('\n')).toContain('Uso: pachanguero-admin');
  });

  it('never accepts a password as an argument', async () => {
    expect(
      await cli().run('reset-pwd', '--username', 'boss', '--password', GOOD)
    ).toBe(2);
    expect(users.list()).toEqual([]);
  });

  it('runs the account commands and lists the users without a hash', async () => {
    await cli().run('create', '--username', 'boss', '--role', 'admin');
    await cli().run(
      'create',
      '--username',
      'carlos',
      '--role',
      'regular',
      '--player',
      'Carlos García'
    );
    out.length = 0;

    expect(await cli().run('unlock', '--username', 'carlos')).toBe(0);
    expect(await cli().run('promote', '--username', 'carlos')).toBe(0);
    expect(await cli().run('demote', '--username', 'carlos')).toBe(0);
    expect(await cli().run('deactivate', '--username', 'carlos')).toBe(0);
    expect(await cli().run('activate', '--username', 'carlos')).toBe(0);
    expect(
      await cli(['Penalti-en-Mayo42', 'Penalti-en-Mayo42']).run(
        'reset-pwd',
        '--username',
        'carlos'
      )
    ).toBe(0);
    out.length = 0;

    expect(await cli().run('list')).toBe(0);
    const text = out.join('\n');
    expect(text).toMatch(/boss\s+admin\s+-\s+activo/);
    expect(text).toMatch(/carlos\s+regular\s+Carlos García\s+activo/);
    expect(text).not.toContain('scrypt');
  });

  it('says so when a command names a user that does not exist', async () => {
    expect(await cli().run('unlock', '--username', 'nobody')).toBe(1);
    expect(err.join('\n')).toContain('No existe el usuario "nobody"');
  });

  it('refuses to deactivate the only admin', async () => {
    await cli().run('create', '--username', 'boss', '--role', 'admin');
    expect(await cli().run('deactivate', '--username', 'boss')).toBe(1);
    expect(err.join('\n')).toContain('administrador');
  });
});
