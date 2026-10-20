import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BankError } from '../bizum/ports.js';
import { AuthTestApp } from './auth-test-support.js';
import { BankRouteSettings } from './bank-routes-test-support.js';

describe('the bank callback', () => {
  let app: AuthTestApp;
  let bank: BankRouteSettings;
  let adminToken: string;

  beforeAll(async () => {
    app = await AuthTestApp.start({
      bank: clock => {
        bank = new BankRouteSettings(clock);
        return bank.settings;
      },
    });
    const boss = await app.createUser('boss', 'admin', 'Antonio');
    adminToken = await app.tokenFor('admin', boss.id);
  });
  afterAll(async () => {
    await app.close();
  });

  const callback = (query: string) =>
    app.request(`/api/bank/callback?${query}`, { redirect: 'manual' });
  const start = () =>
    app.request('/api/bank/connect', { token: adminToken, method: 'POST' });

  it('needs no sign-in, and sends the browser to the app with only a code', async () => {
    await start();

    const reply = await callback('state=state-1&code=the-code');

    expect(reply.status).toBe(302);
    expect(reply.headers.get('location')).toBe('/?bank=connected');
    expect(app.server.bank.panel().connection).toMatchObject({
      state: 'connected',
    });
  });

  it('answers the same way for a refusal: a relative address and a fixed code', async () => {
    const reply = await callback('state=nobody-issued-this&code=another-code');

    expect(reply.status).toBe(302);
    expect(reply.headers.get('location')).toBe('/?bank=unknown_state');
  });

  it('tells a replay from a state nobody issued', async () => {
    await start();
    await callback('state=state-2&code=c');

    const again = await callback('state=state-2&code=c');

    expect(again.headers.get('location')).toBe('/?bank=already_used');
  });

  it("turns the bank's refusal into a code", async () => {
    await start();
    const reply = await callback(
      'state=state-3&error=access_denied&error_description=No'
    );

    expect(reply.headers.get('location')).toBe('/?bank=denied');
  });

  it('puts none of what the bank sent in the answer', async () => {
    await start();
    bank.connector.failNext(new BankError('unavailable', 'NETWORK'));

    const reply = await callback('state=state-4&code=secret-code-abc');

    expect(reply.headers.get('location')).toBe('/?bank=failed');
    expect(JSON.stringify([...reply.headers.entries()])).not.toContain(
      'state-4'
    );
    expect(JSON.stringify([...reply.headers.entries()])).not.toContain(
      'secret-code-abc'
    );
    expect(reply.body).toEqual({});
  });

  it('is never cached and never passes on a referrer', async () => {
    const reply = await callback('state=x');

    expect(reply.headers.get('cache-control')).toBe('no-store');
    expect(reply.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it.each(['state', 'code', 'error'])('refuses an over-long %s', async name => {
    const reply = await callback(`${name}=${'a'.repeat(1025)}`);

    expect(reply.status).toBe(400);
    expect(reply.headers.get('location')).toBeNull();
  });

  it('accepts a parameter of exactly 1024 characters', async () => {
    const reply = await callback(`state=${'a'.repeat(1024)}`);

    expect(reply.headers.get('location')).toBe('/?bank=unknown_state');
  });

  it('refuses a parameter given twice', async () => {
    const reply = await callback('state=a&state=b');
    expect(reply.status).toBe(400);
  });
});
