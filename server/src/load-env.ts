import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvFileLoader } from './env-file-loader.js';

/**
 * Imported first by every entry point (the server and the admin tool): modules are evaluated
 * in import order, and the database path is read when `db/index.ts` is loaded. The default
 * file is the repository's `.env`, two directories above `src/` and `dist/`.
 */
const here = dirname(fileURLToPath(import.meta.url));

/** The command-line arguments left once `--env-file` has been taken out. */
export const args = new EnvFileLoader(
  process.env,
  join(here, '../../.env')
).apply(process.argv.slice(2));
