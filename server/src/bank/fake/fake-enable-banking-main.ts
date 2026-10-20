import { readFileSync } from 'node:fs';
import { SystemClock } from '../../domain/clock.js';
import { FakeEnableBankingServer } from './fake-enable-banking-server.js';
import { FakeFixtures } from './fake-fixtures.js';

/**
 * Runs the fake Enable Banking server as its own process, for the end-to-end tests. The
 * arguments are `<port> <public key file> <app id> <redirect url>`, never environment
 * variables, so the deployment settings scan has nothing to account for.
 */
const [port, publicKeyFile, appId, redirect] = process.argv.slice(2);
const fixtures = new FakeFixtures();
const server = new FakeEnableBankingServer({
  appId,
  publicKeyPem: readFileSync(publicKeyFile, 'utf8'),
  registeredRedirects: [redirect],
  clock: new SystemClock(),
  accounts: fixtures.accounts(),
  entries: fixtures.entries(),
});
await server.start(Number(port));
console.log(`fake Enable Banking listening on ${server.baseUrl()}`);
