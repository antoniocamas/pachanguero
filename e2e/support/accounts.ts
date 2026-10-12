import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

export interface Account {
  username: string;
  password: string;
  role: 'admin' | 'regular';
  /** The exact name of the player the account is, when it is one. */
  player?: string;
}

/**
 * Creates an account with the operator's own tool, against the database the server uses. The
 * password goes in on standard input, twice, as a script would send it.
 */
export function createAccount(account: Account): void {
  const result = spawnSync(
    'npm',
    [
      'run',
      'admin',
      '--workspace=server',
      '--',
      'create',
      '--username',
      account.username,
      '--role',
      account.role,
      ...(account.player ? ['--player', account.player] : []),
    ],
    {
      cwd: root,
      env: { ...process.env, PACHANGUERO_DB: process.env.E2E_DB },
      input: `${account.password}\n${account.password}\n`,
      encoding: 'utf8',
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not create the account ${account.username} (exit ${result.status}):\n${result.stdout}\n${result.stderr}`
    );
  }
}
