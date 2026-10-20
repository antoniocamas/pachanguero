import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthTestApp } from './auth-test-support.js';

describe('the Bizum routes', () => {
  let app: AuthTestApp;
  let admin: string;
  let player: string;
  let adminAsPlayer: string;
  let luis: number;
  let bizumId: number;

  const call = (
    method: string,
    path: string,
    body?: unknown,
    token: string = admin
  ) => app.request(`/api${path}`, { method, token, body });

  beforeAll(async () => {
    app = await AuthTestApp.start();
    const boss = await app.createUser('boss', 'admin', 'Antonio');
    const carlos = await app.createUser('carlos', 'regular', 'Carlos');
    luis = (await app.createUser('luis', 'regular', 'Luis Pérez')).playerId!;
    admin = await app.tokenFor('admin', boss.id);
    player = await app.tokenFor('regular', carlos.id);
    adminAsPlayer = await app.tokenFor(
      { role: 'admin', view: 'regular' },
      boss.id
    );
    bizumId = 1;
    app.conn
      .prepare(
        `INSERT INTO bizums (id, account, reference, direction, booked_on, amount_cents, currency,
                             sender_name, subject, kept_at)
         VALUES (1, 'h', 'r', 'incoming', '2026-10-12', 800, 'EUR', 'Luis P.R.', NULL, 'x')`
      )
      .run();
    app.conn
      .prepare(
        `INSERT INTO bizum_entries (account, reference, outcome, recorded_at)
         VALUES ('h', 'r', 'kept', 'x')`
      )
      .run();
    app.conn
      .prepare(
        `INSERT INTO bizum_handling (bizum_id, status, reason_json, updated_at)
         VALUES (1, 'waiting', ?, 'x')`
      )
      .run(
        JSON.stringify({
          reason: { code: 'sender_unknown' },
          sender: { kind: 'unknown', suggestions: [] },
        })
      );
  });
  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/bizums/waiting'],
    ['GET', '/bizums/pairings'],
    ['PUT', '/bizums/pairings/1'],
    ['DELETE', '/bizums/pairings/1'],
    ['GET', '/bizums/1/open-shares?playerId=1'],
    ['POST', '/bizums/1/pair'],
    ['POST', '/bizums/1/rule'],
    ['POST', '/bizums/1/dismiss'],
  ])(
    '%s %s is 401 to nobody and 403 to a player and to the admin viewing as one',
    async (method, path) => {
      const refused = async (token?: string) =>
        (
          await app.request(`/api${path}`, {
            method,
            token,
            body: method === 'GET' ? undefined : {},
          })
        ).status;

      expect(await refused()).toBe(401);
      expect(await refused(player)).toBe(403);
      expect(await refused(adminAsPlayer)).toBe(403);
    }
  );

  it('lists the waiting Bizums with the names of the players they mention', async () => {
    const reply = await call('GET', '/bizums/waiting');

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject([
      { id: bizumId, amountCents: 800, reason: { code: 'sender_unknown' } },
    ]);
  });

  it('answers the open shares of a player, and 400 for a bad id', async () => {
    const reply = await call(
      'GET',
      `/bizums/${bizumId}/open-shares?playerId=${luis}`
    );
    const bad = await call('GET', `/bizums/${bizumId}/open-shares?playerId=x`);
    const gone = await call('GET', `/bizums/99/open-shares?playerId=${luis}`);

    expect(reply).toMatchObject({ status: 200, body: [] });
    expect(bad.status).toBe(400);
    expect(gone).toMatchObject({
      status: 400,
      body: { error: 'No existe ese Bizum' },
    });
  });

  it('refuses a ruling with the reason in Spanish', async () => {
    const reply = await call('POST', `/bizums/${bizumId}/rule`, {
      playerId: luis,
      shares: 1,
    });

    expect(reply).toMatchObject({
      status: 400,
      body: { error: 'Solo tiene 0 cuotas abiertas en esa temporada' },
    });
  });

  it('sets, lists and clears a pairing by hand', async () => {
    const set = await call('PUT', `/bizums/pairings/${luis}`, {
      bizumName: 'Luis P.R.',
    });
    const wrong = await call('PUT', `/bizums/pairings/${luis}`, {
      bizumName: 3,
    });
    const cleared = await call('DELETE', `/bizums/pairings/${luis}`);

    expect(set.body).toEqual([
      { playerId: luis, playerName: 'Luis Pérez', bizumName: 'Luis P.R.' },
    ]);
    expect(wrong.status).toBe(400);
    expect(cleared.body).toEqual([]);
  });

  it('pairs a sender and answers what it replaced, who shares it and the new list', async () => {
    const reply = await call('POST', `/bizums/${bizumId}/pair`, {
      playerId: luis,
    });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      replaced: null,
      sharedWith: [],
      results: [{ bizumId, status: 'waiting' }],
      waiting: [{ id: bizumId, reason: { code: 'no_season' } }],
    });
  });

  it('dismisses a waiting Bizum and answers the new list', async () => {
    const reply = await call('POST', `/bizums/${bizumId}/dismiss`);

    expect(reply).toMatchObject({ status: 200, body: { waiting: [] } });
    expect(app.conn.prepare('SELECT outcome FROM bizum_entries').get()).toEqual(
      { outcome: 'dismissed' }
    );
  });
});
