import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_ADMIN } from './credentials';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Creates the end-to-end admin with the operator's own tool, against the same database the
 * server uses. The password goes in on standard input, twice, as a script would send it.
 */
export default function seedAdmin(): void {
  const result = spawnSync(
    'npm',
    [
      'run',
      'admin',
      '--workspace=server',
      '--',
      'create',
      '--username',
      E2E_ADMIN.username,
      '--role',
      'admin',
    ],
    {
      cwd: root,
      env: { ...process.env, PACHANGUERO_DB: process.env.E2E_DB },
      input: `${E2E_ADMIN.password}\n${E2E_ADMIN.password}\n`,
      encoding: 'utf8',
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not create the end-to-end admin (exit ${result.status}):\n${result.stdout}\n${result.stderr}`
    );
  }
}
