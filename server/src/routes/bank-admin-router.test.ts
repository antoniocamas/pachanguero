import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthTestApp } from './auth-test-support.js';
import { BankRouteSettings } from './bank-routes-test-support.js';

describe('the bank routes of the organiser', () => {
  let app: AuthTestApp;
  let bank: BankRouteSettings;
  let admin: string;
  let adminId: number;
  let carlos: string;
  let adminAsPlayer: string;

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

  const routes: [string, string][] = [
    ['GET', '/api/bank'],
    ['PUT', '/api/bank/settings'],
    ['PUT', '/api/bank/words'],
    ['POST', '/api/bank/connect'],
    ['POST', '/api/bank/disconnect'],
    ['GET', '/api/bank/banner'],
  ];

  it.each(routes)('answers 401 to an anonymous %s %s', async (method, path) => {
    expect((await app.request(path, { method })).status).toBe(401);
  });

  it.each(routes)('answers 403 to a player on %s %s', async (method, path) => {
    expect((await app.request(path, { method, token: carlos })).status).toBe(
      403
    );
  });

  it.each(routes)(
    'answers 403 to an admin viewing as a player on %s %s',
    async (method, path) => {
      expect(
        (await app.request(path, { method, token: adminAsPlayer })).status
      ).toBe(403);
    }
  );

  it('shows the panel before any connection', async () => {
    const reply = await app.request('/api/bank', { token: admin });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      setup: [],
      bank: {
        chosenId: 'fake',
        options: [{ id: 'fake', displayName: 'Banco Ficticio' }],
        editable: true,
      },
      canConnect: true,
      connection: null,
      currency: 'EUR',
      startDate: null,
      words: {
        include: ['pachanga', 'futbol', 'fútbol', 'fubol'],
        exclude: [],
      },
      readiness: { ready: false },
    });
  });

  it("starts a connection and answers only the bank's address", async () => {
    const reply = await app.request('/api/bank/connect', {
      token: admin,
      method: 'POST',
    });

    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ url: 'https://bank.example/consent/1' });
  });

  it('shows the connection once the bank sent the browser back', async () => {
    await app.request('/api/bank/callback?state=state-1&code=c', {
      redirect: 'manual',
    });

    const reply = await app.request('/api/bank', { token: admin });

    expect(reply.body).toMatchObject({
      connection: { state: 'connected', daysLeft: 179, renewSuggested: false },
    });
  });

  it('answers the banner: nothing to say, and nothing to read yet', async () => {
    const reply = await app.request('/api/bank/banner', { token: admin });

    expect(reply.body).toEqual({
      show: false,
      state: 'connected',
      daysLeft: 179,
      canRead: false,
    });
  });

  it('warns in the banner when the end is near', async () => {
    app.advance(165 * 24 * 60);
    try {
      const token = await app.tokenFor('admin', adminId);

      const reply = await app.request('/api/bank/banner', { token });

      expect(reply.body).toMatchObject({ show: true, daysLeft: 14 });
    } finally {
      app.advance(-165 * 24 * 60);
    }
  });

  it('refuses in words when the setup is incomplete', async () => {
    const down = await AuthTestApp.start({});
    try {
      const boss = await down.createUser('boss2', 'admin');
      const token = await down.tokenFor('admin', boss.id);

      const reply = await down.request('/api/bank/connect', {
        token,
        method: 'POST',
      });

      expect(reply.status).toBe(400);
      expect(reply.body.error).toContain('Falta configurar');
      expect(reply.body.error).toContain('PACHANGUERO_PUBLIC_URL');
    } finally {
      await down.close();
    }
  });

  it('disconnects and shows the panel without a connection', async () => {
    const reply = await app.request('/api/bank/disconnect', {
      token: admin,
      method: 'POST',
    });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ connection: null });
    expect(bank.connector.closed).toEqual(['session-1']);
  });

  it('refuses to disconnect when nothing is connected', async () => {
    const reply = await app.request('/api/bank/disconnect', {
      token: admin,
      method: 'POST',
    });

    expect(reply.status).toBe(400);
  });

  describe('the settings', () => {
    const put = (path: string, body: unknown) =>
      app.request(path, { token: admin, method: 'PUT', body });

    it('changes the currency and the start date and answers the panel', async () => {
      const reply = await put('/api/bank/settings', {
        currency: 'usd',
        startDate: '2026-09-01',
      });

      expect(reply.status).toBe(200);
      expect(reply.body).toMatchObject({
        currency: 'USD',
        startDate: '2026-09-01',
      });
    });

    it.each([
      [{ currency: 'EURO' }, 'Moneda no válida'],
      [{ startDate: '2026-02-30' }, 'Fecha no válida'],
      [{ startDate: '2999-01-01' }, 'La fecha no puede ser futura'],
      [{ bankId: 'gone' }, 'Banco no disponible'],
      [
        { accountStableId: 'eur-1' },
        'Esa cuenta no está entre las de la conexión',
      ],
      [{ currency: 7 }, 'Datos no válidos'],
    ])('refuses %j with 400 and the message', async (body, message) => {
      const reply = await put('/api/bank/settings', body);

      expect(reply.status).toBe(400);
      expect(reply.body.error).toBe(message);
    });

    it('replaces the two word lists and answers the panel', async () => {
      const reply = await put('/api/bank/words', {
        include: ['pachanga', 'partido'],
        exclude: ['cena'],
      });

      expect(reply.status).toBe(200);
      expect(reply.body).toMatchObject({
        words: { include: ['pachanga', 'partido'], exclude: ['cena'] },
      });
    });

    it.each([
      [{ include: ['a', 'A'], exclude: [] }, 'Ya está en la lista'],
      [{ include: [''], exclude: [] }, 'Palabra no válida'],
      [{ include: ['a'] }, 'Palabra no válida'],
      [{ include: 'a', exclude: [] }, 'Palabra no válida'],
      [{ include: [1], exclude: [] }, 'Palabra no válida'],
    ])('refuses %j with 400 and the message', async (body, message) => {
      const reply = await put('/api/bank/words', body);

      expect(reply.status).toBe(400);
      expect(reply.body.error).toBe(message);
    });
  });
});
