/**
 * Makes the local copy of the production database safe to use: see ProductionCopyScrubber.
 * Run by `scripts/prod-copy.sh`, which passes the copy's own `--env-file`; it refuses any
 * database outside `data/prod-copy/` (ProductionCopyGuard).
 *
 * Usage: npm run scrub-prod-copy --workspace=server -- --env-file <file> [--keep-bank]
 */
import { args } from '../src/load-env.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_PATH, db } from '../src/db/index.js';
import { PasswordHasher } from '../src/domain/password-hasher.js';
import { ProductionCopyGuard } from '../src/cli/production-copy-guard.js';
import { ProductionCopyScrubber } from '../src/cli/production-copy-scrubber.js';

const here = dirname(fileURLToPath(import.meta.url));

// Checked before db() opens (and possibly migrates) anything.
new ProductionCopyGuard(join(here, '../../data/prod-copy')).check(DB_PATH);

const report = await new ProductionCopyScrubber(
  db(),
  new PasswordHasher()
).scrub({ keepBank: args.includes('--keep-bank') });
db().close();

console.log(
  `✓ ${DB_PATH}: ${report.users} cuentas con la contraseña de desarrollo, ` +
    `${report.sessions} sesiones cerradas, ` +
    (args.includes('--keep-bank')
      ? 'conexión con el banco conservada'
      : report.bankConnection
        ? 'conexión con el banco eliminada'
        : 'sin conexión con el banco')
);
