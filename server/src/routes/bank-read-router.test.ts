import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BankError } from '../bizum/ports.js';
import { AuthTestApp } from './auth-test-support.js';
import { BankRouteSettings } from './bank-routes-test-support.js';

describe('POST /api/bank/read', () => {
  let app: AuthTestApp;
  let bank: BankRouteSettings;
  let admin: string;
  let adminId: number;
  let carlos: string;
  let adminAsPlayer: string;

  const post = (token?: string) =>
    app.request('/api/bank/read', { method: 'POST', token });

  beforeAll(async () => {
    app = await AuthTestApp.start({
      bank: clock => {
        bank = new BankRouteSettings(clock);
        return bank.settings;
      },
    });
    const boss = await app.createUser('boss', 'admin', 'Antonio');
    const player = await app.createUser('carlos', 'regular', 'Carlos García');
    adminId = boss.id;
    admin = await app.tokenFor('admin', boss.id);
    carlos = await app.tokenFor('regular', player.id);
    adminAsPlayer = await app.tokenFor(
      { role: 'admin', view: 'regular' },
      boss.id
    );
  });
  afterAll(async () => {
    await app.close();
  });

  it('answers 401 to nobody, 403 to a player and 403 to an admin viewing as a player', async () => {
    expect((await post()).status).toBe(401);
    expect((await post(carlos)).status).toBe(403);
    expect((await post(adminAsPlayer)).status).toBe(403);
  });

  it('answers 409 not_ready while the setup is incomplete', async () => {
    const reply = await post(admin);

    expect(reply.status).toBe(409);
    expect(reply.body).toEqual({ refusal: 'not_ready' });
  });

  it('answers 200 with the counts once connected, an account is chosen and the date is set', async () => {
    await app.request('/api/bank/connect', { token: admin, method: 'POST' });
    await app.request('/api/bank/callback?state=state-1&code=c', {
      redirect: 'manual',
    });
    await app.request('/api/bank/settings', {
      token: admin,
      method: 'PUT',
      body: { accountStableId: 'hash-eur-principal', startDate: '2020-01-01' },
    });

    const reply = await post(admin);

    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({
      entries: 0,
      kept: 0,
      discarded: 0,
      notBizum: 0,
      pending: 0,
      unidentified: 0,
      known: 0,
    });
  });

  it('shows the last read in the panel, and that reading is offered', async () => {
    const panel = await app.request('/api/bank', { token: admin });
    const banner = await app.request('/api/bank/banner', { token: admin });

    expect(panel.body).toMatchObject({
      lastRead: { result: 'ok', code: null, counts: { entries: 0 } },
      readiness: { ready: true },
    });
    expect(banner.body).toMatchObject({ canRead: true });
  });

  it('answers 409 too_soon with until when pressed again at once', async () => {
    const reply = await post(admin);

    expect(reply.status).toBe(409);
    expect(reply.body.refusal).toBe('too_soon');
    expect(typeof reply.body.until).toBe('string');
  });

  it('answers 502 with the failure and its code when the bank fails', async () => {
    app.advance(10);
    bank.connector.failNext(new BankError('unavailable', 'TIMEOUT'), 'entries');
    const token = await app.tokenFor('admin', adminId);

    const reply = await post(token);

    expect(reply.status).toBe(502);
    expect(reply.body).toEqual({ failure: 'unavailable', code: 'TIMEOUT' });
  });
});
