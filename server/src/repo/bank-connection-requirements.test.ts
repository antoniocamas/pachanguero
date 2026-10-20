import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BankError } from '../bizum/ports.js';
import { BankConnectionRig } from './bank-connection-test-support.js';

const DAY = 86_400_000;
const MINUTE = 60_000;

/**
 * The requirements of the bank access the organiser connects, checks and renews, as
 * Given/When/Then, run through the real service on a real database with a scripted bank. What
 * only a live bank or a browser can show is checked elsewhere.
 */
describe('the bank access requirements', () => {
  let rig: BankConnectionRig;

  beforeEach(() => {
    rig = new BankConnectionRig();
  });

  const callback = (
    state: string,
    extra: { code?: string; error?: string } = {}
  ) =>
    rig.service.complete({
      state,
      code: extra.code ?? null,
      error: extra.error ?? null,
    });

  describe('UC-006-01-S1 — The panel before any connection', () => {
    it('shows no connection, the chosen bank and a button that can be pressed', () => {
      const panel = rig.service.panel();

      expect(panel.connection).toBeNull();
      expect(panel.bank).toEqual({ id: 'fake', displayName: 'Banco Ficticio' });
      expect(panel.setup).toEqual([]);
      expect(panel.canConnect).toBe(true);
    });
  });

  describe('UC-006-01-S2 — The panel when the setup is incomplete', () => {
    it.each([
      [
        'the application id',
        { code: 'app_id_missing', setting: 'ENABLE_BANKING_APP_ID' },
      ],
      [
        'the private key',
        { code: 'private_key_missing', setting: 'ENABLE_BANKING_PRIVATE_KEY' },
      ],
      [
        'the public URL',
        { code: 'public_url_invalid', setting: 'PACHANGUERO_PUBLIC_URL' },
      ],
    ])(
      'missing %s: the button is off and the setting is named',
      async (_what, problem) => {
        rig.setup.missing = [problem];

        const panel = rig.service.panel();

        expect(panel.canConnect).toBe(false);
        expect(panel.setup).toEqual([problem]);
        await expect(rig.service.connect()).rejects.toThrow(problem.setting);
      }
    );
  });

  describe('UC-006-01-S3 — Connecting starts', () => {
    it('stores a pending authorisation and sends the browser to the bank, redirecting to the callback', async () => {
      const { url } = await rig.service.connect();

      expect(url).toBe('https://bank.example/consent/1');
      expect(rig.connector.begun[0].redirectUrl).toBe(
        'https://pachanguero.example.org/api/bank/callback'
      );
      const pending = rig.authorizations.findByHash(
        createHash('sha256').update(rig.connector.begun[0].state).digest('hex')
      );
      expect(pending).toMatchObject({ usedAt: null });
      expect(pending!.expiresAt.getTime() - rig.clock.now().getTime()).toBe(
        15 * MINUTE
      );
    });
  });

  describe('UC-006-01-S4 — The bank redirects back and the connection completes', () => {
    it('exchanges the code, stores the session, its end and the accounts, and the panel shows when it ends', async () => {
      await rig.service.connect();

      expect(await callback('state-1', { code: 'c-1' })).toBe('connected');

      expect(rig.connector.completed).toEqual(['c-1']);
      expect(rig.service.panel().connection).toMatchObject({
        state: 'connected',
        validUntil: '2027-04-16T10:00:00.000Z',
        daysLeft: 179,
      });
      expect(
        rig.authorizations.findByHash(
          createHash('sha256').update('state-1').digest('hex')
        )!.usedAt
      ).not.toBeNull();
    });
  });

  describe('UC-006-01-S5 — Refusals at the callback', () => {
    beforeEach(async () => {
      await rig.service.connect();
      rig.clock.advance(5 * MINUTE);
    });

    it.each([
      [
        'state=other&code=c-1',
        'unknown_state',
        { state: 'other', code: 'c-1' },
      ],
      [
        'state=s-1&error=access_denied',
        'denied',
        { state: 'state-1', error: 'access_denied' },
      ],
    ])('%s is %s, with no session stored', async (_query, outcome, query) => {
      expect(await callback(query.state, query)).toBe(outcome);
      expect(rig.connections.get()).toBeNull();
    });

    it('the same state requested a second time is already_used', async () => {
      await callback('state-1', { code: 'c-1' });
      expect(await callback('state-1', { code: 'c-1' })).toBe('already_used');
    });

    it('a state after the pending authorisation expired is expired', async () => {
      rig.clock.advance(11 * MINUTE);
      expect(await callback('state-1', { code: 'c-1' })).toBe('expired');
      expect(rig.connections.get()).toBeNull();
    });

    it('offers to connect again after a refusal', async () => {
      await callback('state-1', { error: 'access_denied' });
      expect(rig.service.panel().canConnect).toBe(true);
      await expect(rig.service.connect()).resolves.toMatchObject({
        url: expect.any(String),
      });
    });
  });

  describe('UC-006-01-S8 — The panel while connected', () => {
    it('shows the end, the days left and the account only as currency, type and last four', async () => {
      await rig.connectAndApprove('state-1');
      rig.clock.advance(159 * DAY);

      const { connection } = rig.service.panel();

      expect(connection).toMatchObject({
        state: 'connected',
        validUntil: '2027-04-16T10:00:00.000Z',
        daysLeft: 20,
      });
      expect(connection!.accounts[0]).toEqual({
        stableId: 'hash-eur-principal',
        currency: 'EUR',
        kind: 'CACC',
        last4: '1111',
      });
    });
  });

  describe('UC-006-01-S9 — Renewal while the access is valid', () => {
    it('stores the new session, closes the old one only after the new works, and shows the new end', async () => {
      await rig.connectAndApprove('state-1');
      rig.clock.advance(100 * DAY);

      expect(await rig.connectAndApprove('state-2', 'c-2')).toBe('connected');

      expect(rig.connections.get()).toMatchObject({
        sessionId: 'session-2',
        validUntil: new Date(rig.clock.now().getTime() + 179 * DAY),
      });
      expect(rig.connector.closed).toEqual(['session-1']);
      expect(rig.connections.get()!.accounts.map(a => a.stableId)).toEqual([
        'hash-eur-principal',
        'hash-usd',
        'hash-gbp',
        'hash-eur-segunda',
      ]);
    });
  });

  describe('UC-006-01-S10 — The organiser is warned before it ends (server data)', () => {
    it.each([
      { daysAhead: 164, show: false, daysLeft: 15 },
      { daysAhead: 169, show: true, daysLeft: 10 },
      { daysAhead: 178, show: true, daysLeft: 1 },
    ])(
      '$daysLeft days left: show $show',
      async ({ daysAhead, show, daysLeft }) => {
        await rig.connectAndApprove('state-1');
        rig.clock.advance(daysAhead * DAY);

        expect(rig.service.banner()).toEqual({
          show,
          state: 'connected',
          daysLeft,
        });
      }
    );

    it('carries the state and the days only: no account and no bank detail', async () => {
      await rig.connectAndApprove('state-1');
      expect(Object.keys(rig.service.banner()).sort()).toEqual([
        'daysLeft',
        'show',
        'state',
      ]);
    });
  });

  describe('UC-006-01-S11 — The access ends early', () => {
    it.each(['CLOSED_SESSION', 'EXPIRED_SESSION', 'REVOKED_SESSION'])(
      '%s: reconnection needed with that reason, and the banner stays',
      async code => {
        await rig.connectAndApprove('state-1');

        rig.service.markEnded(new BankError('session_ended', code));

        expect(rig.service.panel().connection).toMatchObject({
          state: 'reconnect_needed',
          reason: code,
        });
        expect(rig.service.panel().canConnect).toBe(true);
        expect(rig.service.banner()).toMatchObject({
          show: true,
          state: 'reconnect_needed',
        });
      }
    );
  });

  describe('UC-006-01-S12 — Secrets never leave', () => {
    it('the panel and banner carry no session id, account uid, state or code', async () => {
      await rig.service.connect();
      await callback('state-1', { code: 'the-secret-code' });

      const shown = JSON.stringify([rig.service.panel(), rig.service.banner()]);

      expect(shown).not.toContain('session-1');
      expect(shown).not.toContain('uid-1');
      expect(shown).not.toContain('state-1');
      expect(shown).not.toContain('the-secret-code');
    });

    it('the state is stored only as its hash', async () => {
      await rig.service.connect();
      const rows = JSON.stringify(
        rig.conn.prepare('SELECT * FROM bank_authorizations').all()
      );
      expect(rows).not.toContain('state-1');
    });

    it('an error from the bank says its class and code, nothing of the call', () => {
      expect(new BankError('unavailable', 'HTTP_500').message).toBe(
        'unavailable: HTTP_500'
      );
    });
  });

  describe('UC-006-01-S13 — The organiser disconnects', () => {
    it('closes the session at the bank, deletes the stored one, and leaves what was recorded as it was', async () => {
      await rig.connectAndApprove('state-1');
      rig.conn.exec(
        "INSERT INTO players (id, name) VALUES (1, 'Ana'); INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (1, '2026/2027', '2026-09-01', '2027-08-31')"
      );
      const before = rig.conn
        .prepare('SELECT COUNT(*) AS n FROM players')
        .get();

      await rig.service.disconnect();

      expect(rig.connector.closed).toEqual(['session-1']);
      expect(rig.connections.get()).toBeNull();
      expect(rig.service.panel().connection).toBeNull();
      expect(
        rig.conn.prepare('SELECT COUNT(*) AS n FROM players').get()
      ).toEqual(before);
    });
  });
});
