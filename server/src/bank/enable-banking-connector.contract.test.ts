import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BankError } from '../bizum/ports.js';
import { ManualClock } from '../domain/clock-test-support.js';
import {
  BankConnectorContract,
  type ContractTarget,
} from './bank-connector-contract.js';
import { EnableBankingConfig } from './enable-banking-config.js';
import { EnableBankingConnector } from './enable-banking-connector.js';
import { EnableBankingToken } from './enable-banking-token.js';
import { FakeFixtures } from './fake/fake-fixtures.js';
import { FakeEnableBankingServer } from './fake/fake-enable-banking-server.js';

const REDIRECT = 'https://pachanguero.example.org/api/bank/callback';

class KeyPair {
  readonly privatePem: string;
  readonly publicPem: string;

  constructor() {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.privatePem = pair.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    this.publicPem = pair.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
  }
}

describe('EnableBankingConnector against the fake bank', () => {
  const clock = new ManualClock(new Date('2026-10-19T10:00:00.000Z'));
  const keys = new KeyPair();
  const fixtures = new FakeFixtures();
  let server: FakeEnableBankingServer;
  let target: ContractTarget;

  const connectorTo = (
    apiUrl: string,
    privatePem = keys.privatePem,
    timeoutMs?: number
  ) =>
    new EnableBankingConnector(
      EnableBankingConfig.of({
        appId: 'test-app',
        privateKey: privatePem,
        apiUrl,
      }),
      new EnableBankingToken('test-app', privatePem, clock),
      clock,
      timeoutMs
    );

  beforeAll(async () => {
    server = new FakeEnableBankingServer({
      appId: 'test-app',
      publicKeyPem: keys.publicPem,
      registeredRedirects: [REDIRECT],
      clock,
      accounts: fixtures.accounts(),
      entries: fixtures.entries(),
    });
    const baseUrl = await server.start();
    const connector = connectorTo(baseUrl);
    const consent = {
      bank: { name: 'Revolut', country: 'ES' },
      registeredRedirect: REDIRECT,
      unregisteredRedirect: 'https://elsewhere.example.org/callback',
    };
    const url = await connector.begin(
      REDIRECT,
      'standing',
      new Date('2027-04-01T00:00:00Z'),
      consent.bank
    );
    const { code } = await server.approve(url);
    const session = await connector.complete(code!);
    target = {
      connector,
      account: {
        stableId: String(session.accounts[0].identification_hash),
        sessionId: String(session.accounts[0].uid),
      },
      dateFrom: '2026-01-01',
      expectedCount: fixtures.entries().length,
      futureDate: '2026-10-20',
      control: server,
      consent,
    };
  });
  afterAll(async () => {
    await server.stop();
  });

  const contract = new BankConnectorContract(async () => target);
  contract.declareReadOnlyCases();
  contract.declareSessionCases();

  describe('what the fake itself must keep true', () => {
    it("reads the standing session's details: four accounts, EUR first", async () => {
      const url = await target.connector.begin(
        REDIRECT,
        'details',
        new Date('2027-04-01T00:00:00Z'),
        target.consent!.bank
      );
      const { code } = await server.approve(url);

      const session = await target.connector.complete(code!);

      expect(
        session.accounts.map(a => (a.details as { currency: string }).currency)
      ).toEqual(['EUR', 'USD', 'GBP', 'EUR']);
      expect(session.validUntil).toEqual(new Date('2027-04-01T00:00:00Z'));
    });

    it('closes a session, and closing it twice is not an error', async () => {
      const url = await target.connector.begin(
        REDIRECT,
        'close',
        new Date('2027-04-01T00:00:00Z'),
        target.consent!.bank
      );
      const { code } = await server.approve(url);
      const { sessionId } = await target.connector.complete(code!);

      await target.connector.close(sessionId);
      await expect(target.connector.close(sessionId)).resolves.toBeUndefined();
    });

    it('asks for the deep read with the longest strategy', async () => {
      const seen: string[] = [];
      const probe = createServer((req, res) => {
        seen.push(req.url ?? '');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ transactions: [] }));
      });
      await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
      try {
        const { port } = probe.address() as { port: number };
        const connector = connectorTo(`http://127.0.0.1:${port}`);
        for await (const entry of connector.entries(
          target.account,
          '2026-01-01',
          { deep: true }
        )) {
          expect(entry).toBeUndefined();
        }
        for await (const entry of connector.entries(
          target.account,
          '2026-01-01',
          { deep: false }
        )) {
          expect(entry).toBeUndefined();
        }
      } finally {
        probe.closeAllConnections();
        await new Promise(resolve => probe.close(resolve));
      }
      expect(seen[0]).toContain('strategy=longest');
      expect(seen[1]).not.toContain('strategy');
    });
  });

  describe('the error mapping', () => {
    let canned: Server;
    let answer: (res: import('node:http').ServerResponse) => void;
    let cannedUrl: string;

    beforeAll(async () => {
      canned = createServer((_req, res) => answer(res));
      await new Promise<void>(resolve =>
        canned.listen(0, '127.0.0.1', resolve)
      );
      cannedUrl = `http://127.0.0.1:${(canned.address() as { port: number }).port}`;
    });
    afterAll(async () => {
      canned.closeAllConnections();
      await new Promise(resolve => canned.close(resolve));
    });

    const failureWhen = async (
      respond: (res: import('node:http').ServerResponse) => void,
      connector = connectorTo(cannedUrl)
    ) => {
      answer = respond;
      try {
        await connector.close('s');
        for await (const entry of connector.entries(
          target.account,
          '2026-01-01',
          { deep: false }
        )) {
          expect(entry).toBeUndefined();
        }
      } catch (error) {
        return error as BankError;
      }
      throw new Error('Expected a failure');
    };
    const json =
      (status: number, body: unknown) =>
      (res: import('node:http').ServerResponse) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(body));
      };

    it.each([
      [500, 'HTTP_500'],
      [503, 'HTTP_503'],
    ])('a %s answer is unavailable as %s', async (status, code) => {
      const error = await failureWhen(json(status, { error: 'WHATEVER' }));
      expect(error).toMatchObject({ failure: 'unavailable', code });
    });

    it('a body that is not JSON is unavailable', async () => {
      const error = await failureWhen(res => {
        res.statusCode = 502;
        res.end('<html>bad gateway</html>');
      });
      expect(error).toMatchObject({ failure: 'unavailable', code: 'HTTP_502' });
    });

    it('a successful answer that is not JSON is unavailable', async () => {
      answer = res => {
        res.statusCode = 200;
        res.end('not json');
      };
      const error = await connectorTo(cannedUrl)
        .complete('c')
        .catch(e => e as BankError);
      expect(error).toMatchObject({ failure: 'unavailable', code: 'HTTP_200' });
    });

    it('an unknown 4xx is rejected with the bank code, or HTTP_<status>', async () => {
      expect(
        await failureWhen(json(422, { error: 'WRONG_DATE_INTERVAL' }))
      ).toMatchObject({ failure: 'rejected', code: 'WRONG_DATE_INTERVAL' });
      expect(await failureWhen(json(404, { message: 'x' }))).toMatchObject({
        failure: 'rejected',
        code: 'HTTP_404',
      });
    });

    it('a 401 with another code is misconfigured', async () => {
      expect(
        await failureWhen(json(401, { error: 'UNAUTHORIZED' }))
      ).toMatchObject({ failure: 'misconfigured', code: 'UNAUTHORIZED' });
    });

    it('a token the bank refuses is misconfigured', async () => {
      const other = new KeyPair();
      const error = await connectorTo(server.baseUrl(), other.privatePem)
        .complete('c')
        .catch(e => e as BankError);
      expect(error).toMatchObject({
        failure: 'misconfigured',
        code: 'UNAUTHORIZED',
      });
    });

    it('a rate limit says to wait six hours', async () => {
      const error = await failureWhen(
        json(429, { error: 'ASPSP_RATE_LIMIT_EXCEEDED' })
      );
      expect(error.failure).toBe('rate_limited');
      expect(error.retryAfter).toEqual(new Date('2026-10-19T16:00:00.000Z'));
    });

    it('a connection that cannot be made is unavailable as NETWORK', async () => {
      const error = await connectorTo('http://127.0.0.1:1')
        .complete('c')
        .catch(e => e as BankError);
      expect(error).toMatchObject({ failure: 'unavailable', code: 'NETWORK' });
    });

    it('an answer that never comes is unavailable as TIMEOUT', async () => {
      answer = () => undefined;
      const error = await connectorTo(cannedUrl, keys.privatePem, 50)
        .complete('c')
        .catch(e => e as BankError);
      expect(error).toMatchObject({ failure: 'unavailable', code: 'TIMEOUT' });
    });

    it('says nothing of the call in its message', async () => {
      const error = await failureWhen(
        json(401, { error: 'UNAUTHORIZED', message: 'secret-code-123' })
      );
      expect(error.message).toBe('misconfigured: UNAUTHORIZED');
    });
  });
});
