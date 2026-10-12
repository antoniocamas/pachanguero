import { SignJWT } from 'jose';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthTestApp } from './auth-test-support.js';
import { RouteLister } from './route-lister-test-support.js';

describe('who may call what', () => {
  let app: AuthTestApp;
  let webDist: string;
  let bossId: number;
  let carlosId: number;
  let carlosPlayer: number;
  let admin: string;
  let carlos: string;

  beforeAll(async () => {
    webDist = mkdtempSync(join(tmpdir(), 'pachanguero-web-'));
    writeFileSync(
      join(webDist, 'index.html'),
      '<!doctype html><title>app</title>'
    );
    app = await AuthTestApp.start({ webDist });
    const boss = await app.createUser('boss', 'admin', 'Antonio');
    const player = await app.createUser('carlos', 'regular', 'Carlos García');
    carlosId = player.id;
    carlosPlayer = player.playerId!;
    bossId = boss.id;
  });
  beforeEach(async () => {
    admin = await app.tokenFor('admin', bossId);
    carlos = await app.tokenFor('regular', carlosId);
  });
  afterAll(async () => {
    await app.close();
    rmSync(webDist, { recursive: true, force: true });
  });

  const counts = () =>
    (
      app.conn
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )
        .all() as { name: string }[]
    ).map(t => [
      t.name,
      (
        app.conn.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get() as {
          n: number;
        }
      ).n,
    ]);

  const organiserCalls: [string, string][] = [
    ['GET', '/api/seasons/current'],
    ['GET', '/api/players/details'],
    ['GET', '/api/debts'],
    ['GET', '/api/players/3/report'],
    ['POST', '/api/games/12/state'],
    ['POST', '/api/games/12/payments'],
    ['PATCH', '/api/players/3'],
    ['DELETE', '/api/games/12'],
  ];

  it.each(organiserCalls)(
    'answers 401 to an anonymous %s %s and changes nothing',
    async (method, path) => {
      const before = counts();
      const reply = await app.request(path, {
        method,
        body: method === 'GET' ? undefined : {},
      });
      expect(reply.status).toBe(401);
      expect(reply.body).toEqual({ error: 'No autorizado' });
      expect(counts()).toEqual(before);
    }
  );

  it.each([...organiserCalls.slice(0, 7), ['GET', '/api/seasons/2/standings']])(
    'answers 403 to a regular user on %s %s and changes nothing',
    async (method, path) => {
      const before = counts();
      const reply = await app.request(path, {
        method,
        token: carlos,
        body: method === 'GET' ? undefined : {},
      });
      expect(reply.status).toBe(403);
      expect(reply.body).toEqual({ error: 'Prohibido' });
      expect(counts()).toEqual(before);
    }
  );

  it("refuses a regular user's own player id on the organiser report route", async () => {
    const reply = await app.request(`/api/players/${carlosPlayer}/report`, {
      token: carlos,
    });
    expect(reply.status).toBe(403);
  });

  it('decides every route of the admin router: 401 anonymous, 403 regular, neither for an admin', async () => {
    const routes = new RouteLister().list(app.routes.adminRouter);
    expect(routes.length).toBe(43);
    for (const route of routes) {
      const [method, template] = route.split(' ');
      const path = `/api${template.replace(/:[A-Za-z]+/g, '1')}`;
      const body = method === 'GET' ? undefined : {};
      expect(
        (await app.request(path, { method, body })).status,
        `anonymous ${route}`
      ).toBe(401);
      expect(
        (await app.request(path, { method, body, token: carlos })).status,
        `regular ${route}`
      ).toBe(403);
      const asAdmin = (await app.request(path, { method, body, token: admin }))
        .status;
      expect([401, 403], `admin ${route}`).not.toContain(asAdmin);
    }
  });

  describe('a token that is not valid', () => {
    const secret = new TextEncoder().encode(
      'a-different-secret-that-is-long-enough!!'
    );
    const seconds = () => Math.floor(app.clock.now().getTime() / 1000);
    const claims = { role: 'admin', view: 'admin', type: 'access' };
    const sign = (c: Record<string, unknown>, key: Uint8Array, exp: number) =>
      new SignJWT(c)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('pachanguero')
        .setSubject('1')
        .setIssuedAt(seconds() - 3600)
        .setExpirationTime(exp)
        .sign(key);
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');

    const tokens: [string, () => Promise<string>][] = [
      [
        'expired a minute ago',
        () =>
          sign(
            claims,
            new TextEncoder().encode(
              'test-secret-that-is-long-enough-0123456789'
            ),
            seconds() - 60
          ),
      ],
      [
        'signed with another secret',
        () => sign(claims, secret, seconds() + 600),
      ],
      [
        'with its payload edited after signing',
        async () => {
          const [header, , signature] = (
            await app.tokenFor('regular', 1)
          ).split('.');
          return `${header}.${encode({ ...claims, iss: 'pachanguero', sub: '1', iat: seconds(), exp: seconds() + 600 })}.${signature}`;
        },
      ],
      [
        'with the algorithm none',
        async () =>
          `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ ...claims, iss: 'pachanguero', sub: '1', iat: seconds(), exp: seconds() + 600 })}.`,
      ],
      [
        'a refresh token',
        async () =>
          (await app.server.tokens.issueRefresh(1, app.clock.now())).token,
      ],
    ];

    it.each(tokens)('is refused: %s', async (_label, make) => {
      const reply = await app.request('/api/seasons/current', {
        token: await make(),
      });
      expect(reply.status).toBe(401);
      expect(reply.body).toEqual({ error: 'No autorizado' });
    });

    it('is refused once the access token has outlived its thirty minutes', async () => {
      const token = await app.tokenFor('admin');
      expect(
        (await app.request('/api/seasons/current', { token })).status
      ).toBe(200);
      app.advance(31);
      expect(
        (await app.request('/api/seasons/current', { token })).status
      ).toBe(401);
    });

    it('is refused when the header is not a bearer token', async () => {
      const res = await fetch(`${app.base}/api/seasons/current`, {
        headers: { authorization: `Basic ${admin}` },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('classification', () => {
    it('holds exactly the public routes, and no session or own routes yet', () => {
      const lister = new RouteLister();
      expect(lister.list(app.routes.publicRouter)).toEqual([
        'POST /auth/login',
        'POST /auth/logout',
        'POST /auth/refresh',
      ]);
      expect(lister.list(app.routes.sessionRouter)).toEqual([]);
      expect(lister.list(app.routes.ownRouter)).toEqual([]);
    });

    it('mounts the existing organiser router itself, so a route added there is admin-only', async () => {
      const { api } = await import('./api.js');
      expect(app.routes.adminRouter).toBe(api);
    });

    it('denies a path nobody declared: 401 anonymous, 403 regular, 404 admin', async () => {
      expect((await app.request('/api/nothing/here')).status).toBe(401);
      expect(
        (await app.request('/api/nothing/here', { token: carlos })).status
      ).toBe(403);
      expect(
        (await app.request('/api/nothing/here', { token: admin })).status
      ).toBe(404);
    });
  });

  describe('an admin looking at the regular view', () => {
    it.each([
      ['GET', '/api/debts'],
      ['GET', '/api/seasons/2/standings'],
      ['POST', '/api/games/12/payments'],
      ['PATCH', '/api/players/1'],
    ])('is refused %s %s as a regular user would be', async (method, path) => {
      const token = await app.tokenFor({ role: 'admin', view: 'regular' });
      const reply = await app.request(path, {
        method,
        token,
        body: method === 'GET' ? undefined : {},
      });
      expect(reply.status).toBe(403);
    });
  });

  describe('the rest of the server', () => {
    it('serves the app without a token and never answers an API path with it', async () => {
      const home = await fetch(`${app.base}/`);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain('<title>app</title>');
      const elsewhere = await fetch(`${app.base}/some/page`);
      expect(await elsewhere.text()).toContain('<title>app</title>');
      const api = await fetch(`${app.base}/api/nothing`);
      expect(api.status).toBe(401);
      expect(await api.text()).not.toContain('<title>');
    });

    it('marks API answers as not cacheable and hides the framework', async () => {
      const reply = await app.request('/api/seasons/current', { token: admin });
      expect(reply.headers.get('cache-control')).toBe('no-store');
      expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
      expect(reply.headers.get('x-frame-options')).toBe('DENY');
      expect(reply.headers.get('x-powered-by')).toBeNull();
    });
  });
});
