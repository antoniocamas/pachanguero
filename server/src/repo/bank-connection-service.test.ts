import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BankError } from '../bizum/ports.js';
import { BankRefusal } from './bank-connection-service.js';
import { BankConnectionRig } from './bank-connection-test-support.js';

const MINUTE = 60_000;
const DAY = 86_400_000;

describe('BankConnectionService', () => {
  let rig: BankConnectionRig;

  beforeEach(() => {
    rig = new BankConnectionRig();
  });

  describe('connecting', () => {
    it("stores a pending authorisation and answers the bank's address", async () => {
      const { url } = await rig.service.connect();

      expect(url).toBe('https://bank.example/consent/1');
      expect(rig.connector.begun).toEqual([
        {
          redirectUrl: 'https://pachanguero.example.org/api/bank/callback',
          state: 'state-1',
          validUntil: new Date('2027-04-16T10:00:00.000Z'),
          bank: { name: 'Banco Ficticio', country: 'ES' },
        },
      ]);
      expect(
        rig.authorizations.findByHash(
          createHash('sha256').update('state-1').digest('hex')
        )
      ).toMatchObject({
        bankId: 'fake',
        purpose: 'connect',
        createdAt: new Date('2026-10-19T10:00:00.000Z'),
        expiresAt: new Date('2026-10-19T10:15:00.000Z'),
        usedAt: null,
      });
    });

    it('stores the state only hashed', async () => {
      await rig.service.connect();

      const rows = rig.conn
        .prepare('SELECT * FROM bank_authorizations')
        .all() as Record<string, unknown>[];
      expect(JSON.stringify(rows)).not.toContain('state-1');
      expect(rows[0].state_hash).toBe(
        createHash('sha256').update('state-1').digest('hex')
      );
    });

    it('names the settings that are missing, by name', async () => {
      rig.setup.missing = [
        { code: 'app_id_missing', setting: 'ENABLE_BANKING_APP_ID' },
        { code: 'public_url_invalid', setting: 'PACHANGUERO_PUBLIC_URL' },
      ];

      await expect(rig.service.connect()).rejects.toThrow(
        'Falta configurar: ENABLE_BANKING_APP_ID, PACHANGUERO_PUBLIC_URL'
      );
      expect(rig.connector.begun).toEqual([]);
    });

    it('refuses when no supported bank is chosen', async () => {
      rig.choice.dialect = null;
      await expect(rig.service.connect()).rejects.toThrow(
        'No hay ningún banco compatible'
      );
    });

    it('tells an unregistered redirect address in words', async () => {
      rig.connector.failNext(
        new BankError('misconfigured', 'REDIRECT_URI_NOT_ALLOWED')
      );
      await expect(rig.service.connect()).rejects.toThrow(
        'La dirección de vuelta no está registrada en el banco'
      );
    });

    it('tells any other misconfiguration, and an unreachable bank, in words', async () => {
      rig.connector.failNext(new BankError('misconfigured', 'UNAUTHORIZED'));
      await expect(rig.service.connect()).rejects.toThrow('mal configurada');
      rig.connector.failNext(new BankError('unavailable', 'NETWORK'));
      await expect(rig.service.connect()).rejects.toBeInstanceOf(BankRefusal);
    });

    it('refuses a bank address that is not https', async () => {
      rig.connector.begin = async () => 'http://bank.example/consent/1';
      await expect(rig.service.connect()).rejects.toThrow('no es segura');
    });

    it('forgets what expired more than a day ago', async () => {
      await rig.service.connect();
      rig.clock.advance(DAY + 16 * MINUTE);

      await rig.service.connect();

      const rows = rig.conn
        .prepare('SELECT COUNT(*) AS n FROM bank_authorizations')
        .get() as { n: number };
      expect(rows.n).toBe(1);
    });
  });

  describe('the bank sends the browser back', () => {
    beforeEach(async () => {
      await rig.service.connect();
    });

    const callback = (
      query: Partial<{ state: string; code: string; error: string }>
    ) =>
      rig.service.complete({
        state: query.state ?? null,
        code: query.code ?? null,
        error: query.error ?? null,
      });

    it('connected: stores the session, its end and the accounts as a summary', async () => {
      expect(await callback({ state: 'state-1', code: 'code-1' })).toBe(
        'connected'
      );

      expect(rig.connector.completed).toEqual(['code-1']);
      expect(rig.connections.get()).toMatchObject({
        bankId: 'fake',
        sessionId: 'session-1',
        validUntil: new Date('2027-04-16T10:00:00.000Z'),
        state: 'connected',
        reason: null,
        deepReadDone: false,
      });
      expect(rig.connections.get()!.accounts).toEqual([
        {
          stableId: 'hash-eur-principal',
          sessionId: 'uid-1-hash-eur-principal',
          currency: 'EUR',
          kind: 'CACC',
          last4: '1111',
        },
        {
          stableId: 'hash-usd',
          sessionId: 'uid-1-hash-usd',
          currency: 'USD',
          kind: 'CACC',
          last4: '2222',
        },
        {
          stableId: 'hash-gbp',
          sessionId: 'uid-1-hash-gbp',
          currency: 'GBP',
          kind: 'CACC',
          last4: '3333',
        },
        {
          stableId: 'hash-eur-segunda',
          sessionId: 'uid-1-hash-eur-segunda',
          currency: 'EUR',
          kind: 'CACC',
          last4: '4444',
        },
      ]);
    });

    it('stores no holder name, no usage and no raw account', async () => {
      await callback({ state: 'state-1', code: 'code-1' });

      const row = rig.conn.prepare('SELECT * FROM bank_connection').get() as {
        accounts_json: string;
      };
      expect(Object.keys(JSON.parse(row.accounts_json)[0]).sort()).toEqual([
        'currency',
        'kind',
        'last4',
        'sessionId',
        'stableId',
      ]);
      expect(row.accounts_json).not.toContain('PRIV');
      expect(row.accounts_json).not.toContain('ES0000');
    });

    it.each([
      ['no state', {}],
      ['an empty state', { state: '' }],
      ['a state nobody issued', { state: 'other', code: 'code-1' }],
      ['a state that is not base64url', { state: 'a b/c', code: 'code-1' }],
      ['a state that is too long', { state: 'x'.repeat(129), code: 'c' }],
    ])('unknown_state for %s, and nothing is stored', async (_name, query) => {
      expect(await callback(query)).toBe('unknown_state');
      expect(rig.connections.get()).toBeNull();
      expect(rig.connector.completed).toEqual([]);
    });

    it('already_used the second time, with no second exchange', async () => {
      await callback({ state: 'state-1', code: 'code-1' });

      expect(await callback({ state: 'state-1', code: 'code-1' })).toBe(
        'already_used'
      );
      expect(rig.connector.completed).toEqual(['code-1']);
    });

    it('already_used for a replay while the first is still in flight', async () => {
      const first = callback({ state: 'state-1', code: 'code-1' });
      const second = callback({ state: 'state-1', code: 'code-1' });

      expect(await second).toBe('already_used');
      expect(await first).toBe('connected');
      expect(rig.connector.completed).toEqual(['code-1']);
    });

    it('expired after fifteen minutes, and on the minute itself', async () => {
      rig.clock.advance(15 * MINUTE);
      expect(await callback({ state: 'state-1', code: 'code-1' })).toBe(
        'expired'
      );
      expect(rig.connections.get()).toBeNull();
    });

    it('is still good a minute before', async () => {
      rig.clock.advance(14 * MINUTE + 59_000);
      expect(await callback({ state: 'state-1', code: 'code-1' })).toBe(
        'connected'
      );
    });

    it('denied when the owner did not approve, with no session', async () => {
      expect(await callback({ state: 'state-1', error: 'access_denied' })).toBe(
        'denied'
      );
      expect(rig.connector.completed).toEqual([]);
      expect(rig.connections.get()).toBeNull();
    });

    it('bank_error for any other error', async () => {
      expect(await callback({ state: 'state-1', error: 'server_error' })).toBe(
        'bank_error'
      );
    });

    it('failed when the bank sent neither a code nor an error', async () => {
      expect(await callback({ state: 'state-1' })).toBe('failed');
    });

    it('code_rejected when the bank refuses the code', async () => {
      rig.connector.failNext(
        new BankError('authorization_failed', 'WRONG_AUTHORIZATION_CODE')
      );
      expect(await callback({ state: 'state-1', code: 'code-1' })).toBe(
        'code_rejected'
      );
      expect(rig.connections.get()).toBeNull();
    });

    it('failed when the exchange fails otherwise', async () => {
      rig.connector.failNext(new BankError('unavailable', 'NETWORK'));
      expect(await callback({ state: 'state-1', code: 'code-1' })).toBe(
        'failed'
      );
      expect(rig.connections.get()).toBeNull();
    });

    it('failed when the chosen bank changed meanwhile', async () => {
      rig.choice.dialect = null;
      expect(await callback({ state: 'state-1', code: 'code-1' })).toBe(
        'failed'
      );
    });

    it('a failed attempt is used up: the organiser starts again', async () => {
      rig.connector.failNext(new BankError('unavailable', 'NETWORK'));
      await callback({ state: 'state-1', code: 'code-1' });

      expect(await callback({ state: 'state-1', code: 'code-1' })).toBe(
        'already_used'
      );
    });
  });

  describe('renewing', () => {
    beforeEach(async () => {
      expect(await rig.connectAndApprove('state-1')).toBe('connected');
    });

    it('marks the second authorisation as a renewal', async () => {
      await rig.service.connect();
      expect(
        rig.authorizations.findByHash(
          createHash('sha256').update('state-2').digest('hex')
        )?.purpose
      ).toBe('renew');
    });

    it('replaces the session and closes the old one only after the new row exists', async () => {
      const seen: (string | undefined)[] = [];
      const close = rig.connector.close.bind(rig.connector);
      rig.connector.close = async id => {
        seen.push(rig.connections.get()?.sessionId);
        await close(id);
      };
      rig.clock.advance(DAY);

      expect(await rig.connectAndApprove('state-2', 'code-2')).toBe(
        'connected'
      );

      expect(rig.connector.closed).toEqual(['session-1']);
      expect(seen).toEqual(['session-2']);
      expect(rig.connections.get()).toMatchObject({
        sessionId: 'session-2',
        validUntil: new Date('2027-04-17T10:00:00.000Z'),
      });
    });

    it('survives a failing close of the old session', async () => {
      await rig.service.connect();
      rig.connector.failNext(new BankError('unavailable', 'NETWORK'), 'close');

      expect(
        await rig.service.complete({
          state: 'state-2',
          code: 'code-2',
          error: null,
        })
      ).toBe('connected');
      expect(rig.connections.get()?.sessionId).toBe('session-2');
    });

    it('keeps the old session when the renewal fails', async () => {
      await rig.service.connect();
      rig.connector.failNext(new BankError('unavailable', 'NETWORK'));

      expect(
        await rig.service.complete({
          state: 'state-2',
          code: 'code-2',
          error: null,
        })
      ).toBe('failed');
      expect(rig.connections.get()?.sessionId).toBe('session-1');
      expect(rig.connector.closed).toEqual([]);
    });

    it('a new session starts with its deep read still to do', async () => {
      rig.connections.markDeepReadDone();
      expect(rig.connections.get()?.deepReadDone).toBe(true);

      await rig.connectAndApprove('state-2', 'code-2');

      expect(rig.connections.get()?.deepReadDone).toBe(false);
    });
  });

  describe('disconnecting', () => {
    it('closes the session at the bank and forgets it', async () => {
      await rig.connectAndApprove('state-1');

      expect(await rig.service.disconnect()).toEqual({ closedAtBank: true });

      expect(rig.connector.closed).toEqual(['session-1']);
      expect(rig.connections.get()).toBeNull();
      expect(rig.service.panel().connection).toBeNull();
    });

    it('forgets it anyway when the bank cannot be reached, and says so', async () => {
      await rig.connectAndApprove('state-1');
      rig.connector.failNext(new BankError('unavailable', 'NETWORK'), 'close');

      expect(await rig.service.disconnect()).toEqual({ closedAtBank: false });

      expect(rig.connections.get()).toBeNull();
    });

    it('refuses when nothing is stored', async () => {
      await expect(rig.service.disconnect()).rejects.toThrow(
        'No hay una conexión con el banco'
      );
    });
  });

  describe('the access ends', () => {
    beforeEach(async () => {
      await rig.connectAndApprove('state-1');
    });

    it.each(['CLOSED_SESSION', 'EXPIRED_SESSION', 'REVOKED_SESSION'])(
      'a read that finds %s needs a reconnection, with that reason',
      code => {
        rig.service.markEnded(new BankError('session_ended', code));

        expect(rig.service.panel().connection).toMatchObject({
          state: 'reconnect_needed',
          reason: code,
        });
        expect(rig.service.banner()).toMatchObject({
          show: true,
          state: 'reconnect_needed',
        });
      }
    );

    it('any other failure leaves the connection as it is', () => {
      rig.service.markEnded(
        new BankError('rate_limited', 'ASPSP_RATE_LIMIT_EXCEEDED')
      );
      expect(rig.service.panel().connection?.state).toBe('connected');
    });

    it('a date that has passed reads as reconnect_needed, reason EXPIRED, without a failed read', () => {
      rig.clock.advance(179 * DAY);
      expect(rig.service.panel().connection).toMatchObject({
        state: 'reconnect_needed',
        reason: 'EXPIRED',
        daysLeft: 0,
      });
      expect(rig.service.banner()).toMatchObject({
        show: true,
        state: 'reconnect_needed',
      });
    });

    it('a new connection clears the reason', async () => {
      rig.service.markEnded(new BankError('session_ended', 'CLOSED_SESSION'));
      await rig.connectAndApprove('state-2', 'code-2');
      expect(rig.service.panel().connection).toMatchObject({
        state: 'connected',
        reason: null,
      });
    });
  });

  describe('the panel and the banner', () => {
    it('before any connection: the bank, nothing connected, connectable', () => {
      expect(rig.service.panel()).toEqual({
        setup: [],
        bank: { id: 'fake', displayName: 'Banco Ficticio' },
        canConnect: true,
        connection: null,
      });
      expect(rig.service.banner()).toEqual({
        show: false,
        state: 'none',
        daysLeft: null,
      });
    });

    it('cannot connect while the setup is incomplete', () => {
      rig.setup.missing = [
        { code: 'private_key_missing', setting: 'ENABLE_BANKING_PRIVATE_KEY' },
      ];
      expect(rig.service.panel()).toMatchObject({
        canConnect: false,
        setup: [
          {
            code: 'private_key_missing',
            setting: 'ENABLE_BANKING_PRIVATE_KEY',
          },
        ],
      });
    });

    it('has no bank when none is supported', () => {
      rig.choice.dialect = null;
      expect(rig.service.panel()).toMatchObject({
        bank: null,
        canConnect: false,
      });
    });

    it('connected: the end, the days left and the accounts as a summary', async () => {
      await rig.connectAndApprove('state-1');
      rig.clock.advance(20 * DAY);

      const { connection } = rig.service.panel();

      expect(connection).toMatchObject({
        state: 'connected',
        validUntil: '2027-04-16T10:00:00.000Z',
        daysLeft: 159,
        renewSuggested: false,
        reason: null,
      });
      expect(connection!.accounts[0]).toEqual({
        stableId: 'hash-eur-principal',
        currency: 'EUR',
        kind: 'CACC',
        last4: '1111',
      });
    });

    it('warns from fourteen days before the end, not before', async () => {
      await rig.connectAndApprove('state-1');

      rig.clock.advance(164 * DAY);
      expect(rig.service.banner()).toEqual({
        show: false,
        state: 'connected',
        daysLeft: 15,
      });
      rig.clock.advance(DAY);
      expect(rig.service.banner()).toEqual({
        show: true,
        state: 'connected',
        daysLeft: 14,
      });
    });

    it('treats a row that does not read back as no connection', async () => {
      await rig.connectAndApprove('state-1');
      rig.conn
        .prepare(
          'UPDATE bank_connection SET accounts_json = \'[{"currency":1}]\''
        )
        .run();

      expect(rig.service.panel().connection).toBeNull();
      expect(rig.service.banner().show).toBe(false);
    });
  });
});
