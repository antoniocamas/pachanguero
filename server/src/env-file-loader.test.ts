import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EnvFileLoader } from './env-file-loader.js';

describe('EnvFileLoader', () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;
  const file = (name: string, text: string) => {
    writeFileSync(join(dir, name), text);
    return join(dir, name);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-file-'));
    env = {};
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the default file when no option names another', () => {
    const loader = new EnvFileLoader(
      env,
      file('.env', '# comment\nJWT_SECRET=abc\nPORT="9000"\n')
    );
    expect(loader.apply(['create', '--username', 'ana'])).toEqual([
      'create',
      '--username',
      'ana',
    ]);
    expect(env).toEqual({ JWT_SECRET: 'abc', PORT: '9000' });
  });

  it('does not mind a missing default file', () => {
    const loader = new EnvFileLoader(env, join(dir, '.env'));
    expect(loader.apply(['list'])).toEqual(['list']);
    expect(env).toEqual({});
  });

  it('reads the file named with --env-file instead of the default, and takes the option out', () => {
    const loader = new EnvFileLoader(env, file('.env', 'PORT=1\n'));
    const other = file('other.env', 'PORT=2\n');
    expect(loader.apply(['--env-file', other, 'list'])).toEqual(['list']);
    expect(env.PORT).toBe('2');
    const again: NodeJS.ProcessEnv = {};
    expect(
      new EnvFileLoader(again, join(dir, '.env')).apply([
        'list',
        `--env-file=${other}`,
      ])
    ).toEqual(['list']);
    expect(again.PORT).toBe('2');
  });

  it('never overrides a variable that is already set', () => {
    env.PACHANGUERO_DB = '/data/real.db';
    new EnvFileLoader(env, file('.env', 'PACHANGUERO_DB=/tmp/x.db\n')).apply(
      []
    );
    expect(env.PACHANGUERO_DB).toBe('/data/real.db');
  });

  it('refuses a file named on purpose that does not exist, or an option with no path', () => {
    const loader = new EnvFileLoader(env, join(dir, '.env'));
    expect(() => loader.apply(['--env-file', join(dir, 'nope.env')])).toThrow(
      'No existe'
    );
    expect(() => loader.apply(['--env-file'])).toThrow('ruta');
  });
});
