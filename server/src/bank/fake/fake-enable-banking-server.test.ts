import { generateKeyPairSync } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ManualClock } from '../../domain/clock-test-support.js';
import { EnableBankingConfig } from '../enable-banking-config.js';
import { EnableBankingConnector } from '../enable-banking-connector.js';
import { EnableBankingToken } from '../enable-banking-token.js';
import { FakeEnableBankingServer } from './fake-enable-banking-server.js';
import { FakeFixtures } from './fake-fixtures.js';

describe('FakeEnableBankingServer', () => {
  const clock = new ManualClock(new Date('2026-10-19T10:00:00.000Z'));
  const pem = (type: 'private' | 'public', key = pair) =>
    type === 'private'
      ? key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
      : key.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let server: FakeEnableBankingServer;
  let base: string;

  const signed = async (
    claims: {
      kid?: string;
      iss?: string;
      aud?: string;
      key?: string;
      exp?: number;
    } = {}
  ) =>
    new SignJWT({})
      .setProtectedHeader({
        alg: 'RS256',
        typ: 'JWT',
        kid: claims.kid ?? 'app',
      })
      .setIssuer(claims.iss ?? 'enablebanking.com')
      .setAudience(claims.aud ?? 'api.enablebanking.com')
      .setIssuedAt(Math.floor(clock.now().getTime() / 1000))
      .setExpirationTime(
        claims.exp ?? Math.floor(clock.now().getTime() / 1000) + 3600
      )
      .sign(await importPKCS8(claims.key ?? pem('private'), 'RS256'));
  const get = async (path: string, token?: string) =>
    fetch(`${base}${path}`, {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });

  beforeAll(async () => {
    const fixtures = new FakeFixtures();
    server = new FakeEnableBankingServer({
      appId: 'app',
      publicKeyPem: pem('public'),
      registeredRedirects: ['http://localhost:5174/api/bank/callback'],
      clock,
      accounts: fixtures.accounts(),
      entries: fixtures.entries(),
    });
    base = await server.start();
  });
  afterAll(async () => {
    await server.stop();
  });

  it('listens on the loopback address only', () => {
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  describe('the token', () => {
    it('accepts a well-formed one', async () => {
      expect((await get('/sessions/none', await signed())).status).toBe(404);
    });

    it.each([
      ['no token', undefined],
      ['a garbage token', 'abc.def.ghi'],
    ])('refuses %s with 401 UNAUTHORIZED', async (_name, token) => {
      const reply = await get('/sessions/none', token);
      expect(reply.status).toBe(401);
      expect(await reply.json()).toMatchObject({ error: 'UNAUTHORIZED' });
    });

    it('refuses a token signed by another key', async () => {
      const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const token = await signed({ key: pem('private', other) });
      expect((await get('/sessions/none', token)).status).toBe(401);
    });

    it.each([
      ['the wrong kid', { kid: 'other-app' }],
      ['the wrong issuer', { iss: 'someone.else' }],
      ['the wrong audience', { aud: 'elsewhere' }],
      [
        'an expired token',
        { exp: Math.floor(clock.now().getTime() / 1000) - 10 },
      ],
    ])('refuses a token with %s', async (_name, claims) => {
      expect((await get('/sessions/none', await signed(claims))).status).toBe(
        401
      );
    });
  });

  describe('paging', () => {
    it('gives 101 entries as 100, then 1', async () => {
      const fixtures = new FakeFixtures();
      const small = new FakeEnableBankingServer({
        appId: 'app',
        publicKeyPem: pem('public'),
        registeredRedirects: ['https://app.example.org/cb'],
        clock,
        accounts: fixtures.accounts(),
        entries: fixtures.entries().slice(0, 101),
      });
      const url = await small.start();
      try {
        const connector = new EnableBankingConnector(
          EnableBankingConfig.of({
            appId: 'app',
            privateKey: pem('private'),
            apiUrl: url,
          }),
          new EnableBankingToken('app', pem('private'), clock),
          clock
        );
        const consent = await connector.begin(
          'https://app.example.org/cb',
          's',
          new Date('2027-01-01T00:00:00Z'),
          { name: 'Revolut', country: 'ES' }
        );
        const session = await connector.complete(
          (await small.approve(consent)).code!
        );
        const uid = String(session.accounts[0].uid);
        const token = await signed();
        const first = await (
          await fetch(
            `${url}/accounts/${uid}/transactions?date_from=2026-01-01`,
            {
              headers: { authorization: `Bearer ${token}` },
            }
          )
        ).json();
        expect(first.transactions).toHaveLength(100);
        const second = await (
          await fetch(
            `${url}/accounts/${uid}/transactions?date_from=2026-01-01&continuation_key=${first.continuation_key}`,
            { headers: { authorization: `Bearer ${token}` } }
          )
        ).json();
        expect(second.transactions).toHaveLength(1);
        expect(second.continuation_key).toBeUndefined();
        const all = [...first.transactions, ...second.transactions];
        expect(
          all.map((e: { booking_date: string }) => e.booking_date)
        ).toEqual(
          [...all.map((e: { booking_date: string }) => e.booking_date)]
            .sort()
            .reverse()
        );
      } finally {
        await small.stop();
      }
    });
  });

  it('refuses a malformed continuation key and a malformed date as WRONG_REQUEST_PARAMETERS', async () => {
    const fixtures = new FakeFixtures();
    const token = await signed();
    const connector = new EnableBankingConnector(
      EnableBankingConfig.of({
        appId: 'app',
        privateKey: pem('private'),
        apiUrl: base,
      }),
      new EnableBankingToken('app', pem('private'), clock),
      clock
    );
    const consent = await connector.begin(
      'http://localhost:5174/api/bank/callback',
      's',
      new Date('2027-01-01T00:00:00Z'),
      { name: 'Revolut', country: 'ES' }
    );
    const session = await connector.complete(
      (await server.approve(consent)).code!
    );
    const uid = String(session.accounts[0].uid);
    expect(fixtures.entries().length).toBeGreaterThan(100);
    for (const query of [
      'date_from=2026-02-30',
      'date_from=x',
      'date_from=2026-01-01&continuation_key=zzz',
    ]) {
      const reply = await fetch(
        `${base}/accounts/${uid}/transactions?${query}`,
        {
          headers: { authorization: `Bearer ${token}` },
        }
      );
      expect(reply.status).toBe(422);
      expect(await reply.json()).toMatchObject({
        error: 'WRONG_REQUEST_PARAMETERS',
      });
    }
  });

  it('answers a consent with an unknown bank as WRONG_ASPSP_PROVIDED', async () => {
    const reply = await fetch(`${base}/auth`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await signed()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        access: { valid_until: '2026-12-01T00:00:00Z' },
        aspsp: { name: 'Nowhere Bank', country: 'ES' },
        state: 's',
        redirect_url: 'http://localhost:5174/api/bank/callback',
      }),
    });
    expect(reply.status).toBe(400);
    expect(await reply.json()).toMatchObject({ error: 'WRONG_ASPSP_PROVIDED' });
  });

  it('sends a denied consent back with an error and no code', async () => {
    const connector = new EnableBankingConnector(
      EnableBankingConfig.of({
        appId: 'app',
        privateKey: pem('private'),
        apiUrl: base,
      }),
      new EnableBankingToken('app', pem('private'), clock),
      clock
    );
    const url = await connector.begin(
      'http://localhost:5174/api/bank/callback',
      'state-x',
      new Date('2027-01-01T00:00:00Z'),
      { name: 'Revolut', country: 'ES' }
    );
    server.denyNext();

    expect(await server.approve(url)).toEqual({
      state: 'state-x',
      code: null,
      error: 'access_denied',
    });
  });

  it('keeps a session reading AUTHORIZED after it expired, as the Mock does', async () => {
    const connector = new EnableBankingConnector(
      EnableBankingConfig.of({
        appId: 'app',
        privateKey: pem('private'),
        apiUrl: base,
      }),
      new EnableBankingToken('app', pem('private'), clock),
      clock
    );
    const url = await connector.begin(
      'http://localhost:5174/api/bank/callback',
      's',
      new Date('2027-01-01T00:00:00Z'),
      { name: 'Revolut', country: 'ES' }
    );
    const { sessionId } = await connector.complete(
      (await server.approve(url)).code!
    );
    server.expire(sessionId);

    const reply = await get(`/sessions/${sessionId}`, await signed());
    expect(await reply.json()).toMatchObject({ status: 'AUTHORIZED' });
  });
});
