import './load-env.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnableBankingConfig } from './bank/enable-banking-config.js';
import { PublicUrl } from './domain/public-url.js';
import { SystemClock } from './domain/clock.js';
import { PasswordHasher } from './domain/password-hasher.js';
import { DB_PATH, db } from './db/index.js';
import { AuthConfig } from './repo/auth-config.js';
import { ServerApp } from './server-app.js';

const here = dirname(fileURLToPath(import.meta.url));

let config: AuthConfig;
try {
  config = AuthConfig.fromEnv(process.env);
} catch (err) {
  console.error(`pachanguero cannot start: ${(err as Error).message}`);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

const bank = {
  config: EnableBankingConfig.fromEnv(process.env),
  publicUrl: PublicUrl.fromEnv(process.env),
};
const setupProblems = [...bank.config.problems(), ...bank.publicUrl.problems()];
if (setupProblems.length > 0) {
  // The server starts anyway: manual payments need no bank. Codes only, never a value.
  console.warn(
    `pachanguero bank access not set up: ${setupProblems.join(', ')}`
  );
}

db(); // open and migrate before accepting traffic
const serverApp = new ServerApp(
  config,
  new SystemClock(),
  new PasswordHasher(),
  join(here, '../../web/dist'),
  bank
);
const app = serverApp.build();
const server = app.listen(port, host, () => {
  console.log(`pachanguero listening on http://${host}:${port}`);
  console.log(`pachanguero database: ${DB_PATH}`);
  serverApp.poller.start();
});
// A second server must never sit silently beside the one holding the port:
// it would look started while the old one, maybe on another database, answers.
server.on('error', err => {
  console.error(`pachanguero cannot listen on ${host}:${port}: ${err.message}`);
  process.exit(1);
});
