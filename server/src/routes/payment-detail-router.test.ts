import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthTestApp } from './auth-test-support.js';

describe('the payment routes that know about Bizums', () => {
  let app: AuthTestApp;
  let admin: string;
  let player: string;
  let adminAsPlayer: string;
  let gameId: number;
  let manualPaymentId: number;
  let bizumPaymentIds: number[];

  const call = (
    method: string,
    path: string,
    token: string | undefined = admin
  ) => app.request(`/api${path}`, { method, token });

  beforeAll(async () => {
    app = await AuthTestApp.start();
    const repo = await import('../repo/index.js');
    const boss = await app.createUser('boss', 'admin', 'Antonio');
    const carlos = await app.createUser('carlos', 'regular', 'Carlos García');
    admin = await app.tokenFor('admin', boss.id);
    player = await app.tokenFor('regular', carlos.id);
    adminAsPlayer = await app.tokenFor(
      { role: 'admin', view: 'regular' },
      boss.id
    );
    const season = repo.seasons.create({ name: '2026/2027' }).id;
    const luis = repo.players.add(season, 'Luis Pérez', 1).id;
    app.conn
      .prepare(
        `INSERT INTO bizums (id, account, reference, direction, booked_on, amount_cents, currency,
                             sender_name, subject, kept_at)
         VALUES (1, 'h', 'ref-1', 'incoming', '2026-10-12', 800, 'EUR', 'Luis P.R.', NULL, 'x')`
      )
      .run();
    app.conn
      .prepare(
        `INSERT INTO bizum_entries (account, reference, outcome, recorded_at)
         VALUES ('h', 'ref-1', 'kept', 'x')`
      )
      .run();
    app.conn
      .prepare(
        `INSERT INTO bizum_handling (bizum_id, status, unallocated_cents, settled_how, updated_at)
         VALUES (1, 'settled', 0, 'automatic', 'x')`
      )
      .run();
    const play = (date: string) => {
      const id = repo.games.create(season, date).id;
      repo.games.setState(id, 'played');
      repo.participations.set(id, luis, { signed_up: true, played: true });
      return id;
    };
    const first = play('2026-10-07');
    const second = play('2026-10-05');
    const pay = (
      game: number,
      method: 'bizum' | 'efectivo',
      bizumId?: number
    ) =>
      repo.paymentRepository.append({
        gameId: game,
        member: { playerId: luis },
        holderId: luis,
        payerId: luis,
        amountCents: 400,
        paidOn: '2026-10-12',
        method,
        bizumId,
      }).id;
    bizumPaymentIds = [pay(first, 'bizum', 1), pay(second, 'bizum', 1)];
    gameId = first;
    const third = play('2026-10-01');
    manualPaymentId = pay(third, 'bizum');
  });
  afterAll(async () => {
    await app.close();
  });

  it('is 401 to nobody and 403 to a player and to the admin viewing as one', async () => {
    const path = `/payments/${bizumPaymentIds[0]}/bizum`;

    expect((await call('GET', path, '')).status).toBe(401);
    expect((await call('GET', path, player)).status).toBe(403);
    expect((await call('GET', path, adminAsPlayer)).status).toBe(403);
  });

  it('answers the detail of a payment a Bizum made, with both of its payments', async () => {
    const reply = await call('GET', `/payments/${bizumPaymentIds[1]}/bizum`);

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      resolved: 'automatic',
      bizum: {
        reference: 'ref-1',
        sender: { name: 'Luis P.R.', phone: null },
        payments: [{ id: bizumPaymentIds[0] }, { id: bizumPaymentIds[1] }],
      },
    });
  });

  it('answers manual and no Bizum for a payment recorded by hand, and 400 for one that is not there', async () => {
    const manual = await call('GET', `/payments/${manualPaymentId}/bizum`);
    const missing = await call('GET', '/payments/999/bizum');

    expect(manual.body).toMatchObject({ resolved: 'manual', bizum: null });
    expect(missing.status).toBe(400);
  });

  it('undoes a payment by hand as before', async () => {
    const reply = await app.request(
      `/api/games/${gameId + 2}/payments/${manualPaymentId}`,
      {
        method: 'DELETE',
        token: admin,
      }
    );

    expect(reply.status).toBe(200);
    expect(
      app.conn
        .prepare('SELECT 1 FROM payments WHERE id = ?')
        .get(manualPaymentId)
    ).toBeUndefined();
  });

  it('undoes every payment of the Bizum from either of them, and lists the Bizum again', async () => {
    const reply = await app.request(
      `/api/games/${gameId}/payments/${bizumPaymentIds[0]}`,
      { method: 'DELETE', token: admin }
    );

    expect(reply.status).toBe(200);
    expect(
      app.conn
        .prepare('SELECT COUNT(*) AS n FROM payments WHERE bizum_id = 1')
        .get()
    ).toEqual({ n: 0 });
    const waiting = await call('GET', '/bizums/waiting');
    expect(waiting.body).toMatchObject([{ id: 1, reason: { code: 'undone' } }]);
  });
});
