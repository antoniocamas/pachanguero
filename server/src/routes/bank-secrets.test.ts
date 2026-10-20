import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EnableBankingConfig } from '../bank/enable-banking-config.js';
import { BankCatalogue } from '../bank/bank-catalogue.js';
import { FakeBankDialect } from '../bank/fake/fake-bank-dialect.js';
import { FakeEnableBankingServer } from '../bank/fake/fake-enable-banking-server.js';
import { FakeFixtures } from '../bank/fake/fake-fixtures.js';
import { ManualClock } from '../domain/clock-test-support.js';
import { PublicUrl } from '../domain/public-url.js';
import { AuthTestApp, type ApiReply } from './auth-test-support.js';

/**
 * The real connector against the fake bank over HTTP, through the real routes: nothing secret
 * may appear in any answer or in anything the server logs.
 */
describe('secrets never leave', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = pair.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const redirect = 'http://localhost:5174/api/bank/callback';
  const replies: ApiReply[] = [];
  const logged: string[] = [];
  let app: AuthTestApp;
  let fake: FakeEnableBankingServer;
  let admin: string;

  beforeAll(async () => {
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
    const fixtures = new FakeFixtures();
    fake = new FakeEnableBankingServer({
      appId: 'secrets-app',
      publicKeyPem: pair.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      registeredRedirects: [redirect],
      clock: new ManualClock(new Date('2026-10-11T10:00:00.000Z')),
      accounts: fixtures.accounts(),
      entries: fixtures.entries(),
    });
    const apiUrl = await fake.start();
    app = await AuthTestApp.start({
      bank: () => ({
        config: EnableBankingConfig.of({
          appId: 'secrets-app',
          privateKey: privatePem,
          apiUrl,
        }),
        publicUrl: PublicUrl.of('http://localhost:5174'),
        catalogue: new BankCatalogue([new FakeBankDialect()]),
      }),
    });
    const boss = await app.createUser('boss', 'admin', 'Antonio');
    admin = await app.tokenFor('admin', boss.id);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await fake.stop();
    await app.close();
  });

  const call = async (path: string, method = 'GET') => {
    const reply = await app.request(path, {
      token: admin,
      method,
      redirect: 'manual',
    });
    replies.push(reply);
    return reply;
  };

  it('goes through connect, callback, panel and disconnect with nothing secret on the way', async () => {
    const connect = await call('/api/bank/connect', 'POST');
    const url = (connect.body as unknown as { url: string }).url;
    const browser = await fake.approve(url);
    // The bank's redirect lands on the app's own callback.
    const callback = await app.request(
      `/api/bank/callback?state=${browser.state}&code=${browser.code}`,
      { redirect: 'manual' }
    );
    replies.push(callback);
    expect(callback.headers.get('location')).toBe('/?bank=connected');
    const panel = await call('/api/bank');
    expect(panel.body).toMatchObject({ connection: { state: 'connected' } });
    await call('/api/bank/banner');

    const stored = app.conn
      .prepare('SELECT session_id FROM bank_connection')
      .get() as { session_id: string };
    const disconnect = await call('/api/bank/disconnect', 'POST');
    expect(disconnect.status).toBe(200);

    const secrets = {
      'the private key': privatePem.split('\n').filter(l => l.length > 20),
      'the authorisation code': [browser.code!],
      'the state': [browser.state!],
      'the session id': [stored.session_id],
    };
    const everything = [
      ...replies.map(
        r => JSON.stringify(r.body) + JSON.stringify([...r.headers.entries()])
      ),
      ...logged,
    ].join('\n');
    for (const [what, fragments] of Object.entries(secrets)) {
      for (const fragment of fragments) {
        expect(
          everything,
          `${what} appears in an answer or the log`
        ).not.toContain(fragment);
      }
    }
    expect(everything, 'a signed token appears').not.toMatch(
      /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/
    );
    expect(replies).toHaveLength(5);
  });
});
