import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseBackup } from '../db/database-backup.js';
import { TestDatabase } from '../db/test-support.js';
import { ManualClock } from '../domain/clock-test-support.js';
import { LocalCalendar } from '../domain/local-calendar.js';
import { PasswordHasher } from '../domain/password-hasher.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import { UsernamePolicy } from '../domain/username-policy.js';
import { PlayerRepository } from '../repo/player-repository.js';
import { RefreshTokenRepository } from '../repo/refresh-token-repository.js';
import { UserAdminService } from '../repo/user-admin-service.js';
import { UserRepository } from '../repo/user-repository.js';
import type { PasswordPrompt } from './password-prompt.js';
import { UserCli, type BackupWriter, type CliIo } from './user-cli.js';

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
  const cli = (
    answers: string[] = [GOOD, GOOD],
    backups: BackupWriter = new DatabaseBackup(
      conn,
      mkdtempSync(join(tmpdir(), 'cli-backups-')),
      new ManualClock(new Date('2026-10-11T10:00:00.000Z')),
      new LocalCalendar()
    )
  ) => {
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
      run: (...argv: string[]) =>
        new UserCli(admin, prompt, io, backups).run(argv),
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

  it('links an account that has no player to one, and says so', async () => {
    await cli().run('create', '--username', 'boss', '--role', 'admin');

    expect(
      await cli().run('link', '--username', 'boss', '--player', 'Carlos García')
    ).toBe(0);
    expect(out.join('\n')).toContain(
      '✓ "boss" asociado al jugador Carlos García'
    );
    expect(users.byUsername('boss')!.playerId).not.toBeNull();

    expect(
      await cli().run('link', '--username', 'boss', '--player', 'Carlos García')
    ).toBe(1);
    expect(err.join('\n')).toContain('ya tiene un jugador');
    expect(await cli().run('link', '--username', 'boss')).toBe(2);
  });

  describe('backup', () => {
    let dir: string;
    const clock = new ManualClock(new Date('2026-10-11T10:00:00.000Z'));
    const writer = (source: Database.Database, into = dir) =>
      new DatabaseBackup(source, into, clock, new LocalCalendar());

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'cli-backup-'));
      return () => {
        rmSync(dir, { recursive: true, force: true });
      };
    });

    const tableCounts = (source: Database.Database) =>
      (
        source
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
          )
          .all() as { name: string }[]
      ).map(t => [
        t.name,
        (
          source.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as {
            n: number;
          }
        ).n,
      ]);

    it('prints the path of a timestamped copy that holds every table with the same row counts', async () => {
      expect(await cli(undefined, writer(conn)).run('backup')).toBe(0);

      const files = readdirSync(dir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^pachanguero-\d{8}-\d{6}\.db$/);
      expect(out.join('\n')).toBe(`✓ ${join(dir, files[0])}`);
      const copy = new Database(join(dir, files[0]), { readonly: true });
      expect(tableCounts(copy)).toEqual(tableCounts(conn));
      expect(tableCounts(copy).length).toBeGreaterThan(5);
      copy.close();
    });

    it('works with no users at all, since it needs no account and no password', async () => {
      const { run, prompt } = cli(undefined, writer(conn));
      expect(users.list()).toEqual([]);
      expect(await run('backup')).toBe(0);
      expect(prompt.asked).toEqual([]);
    });

    it('includes rows that are still only in the write-ahead log', async () => {
      const live = join(dir, 'live.db');
      const source = new Database(live);
      source.pragma('journal_mode = WAL');
      source.pragma('wal_autocheckpoint = 0');
      source.exec('CREATE TABLE note (id INTEGER PRIMARY KEY, body TEXT)');
      for (let n = 1; n <= 12; n++) {
        source.prepare('INSERT INTO note (body) VALUES (?)').run(`n${n}`);
      }
      const backups = join(dir, 'copies');

      expect(await cli(undefined, writer(source, backups)).run('backup')).toBe(
        0
      );

      const copy = new Database(join(backups, readdirSync(backups)[0]), {
        readonly: true,
      });
      expect(copy.prepare('SELECT COUNT(*) AS n FROM note').get()).toEqual({
        n: 12,
      });
      copy.close();
      source.close();
    });

    it('reports a failure, leaves no file behind and changes nothing in the live database', async () => {
      const notADirectory = join(dir, 'taken');
      writeFileSync(notADirectory, 'a file where the copies should go');
      const before = tableCounts(conn);

      expect(
        await cli(undefined, writer(conn, notADirectory)).run('backup')
      ).toBe(1);

      expect(err.join('\n')).toContain('✗ No se pudo crear la copia:');
      expect(out).toEqual([]);
      expect(readdirSync(dir)).toEqual(['taken']);
      expect(tableCounts(conn)).toEqual(before);
    });
  });
});
