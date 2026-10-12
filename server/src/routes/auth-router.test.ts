import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthTestApp } from './auth-test-support.js';

describe('login, refresh and logout', () => {
  let app: AuthTestApp;
  let n = 0;
  const fresh = (prefix: string) => `${prefix}${++n}`;

  beforeAll(async () => {
    app = await AuthTestApp.start();
  });
  afterAll(async () => {
    await app.close();
  });

  const row = (username: string) =>
    app.conn
      .prepare(
        'SELECT failed_attempts AS n, locked_until AS until FROM users WHERE username = ?'
      )
      .get(username) as { n: number; until: string | null };
  const wrong = (username: string) => app.login(username, 'Not-the-Password1');

  describe('login', () => {
    it('logs an admin in: token, cookie and the session user', async () => {
      const name = fresh('boss');
      await app.createUser(name, 'admin', 'Antonio');
      const reply = await app.login(name);

      expect(reply.status).toBe(200);
      expect(reply.body.expiresIn).toBe(1800);
      expect(reply.body.user).toEqual({
        username: name,
        role: 'admin',
        mode: 'admin',
        playerName: 'Antonio',
        canSwitchView: true,
      });
      const claims = await app.server.tokens.verifyAccess(
        reply.body.accessToken,
        app.clock.now()
      );
      expect(claims).toMatchObject({ role: 'admin', view: 'admin' });
      const cookie = reply.setCookies.find(c =>
        c.startsWith('pachanguero_refresh=')
      )!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/api/auth');
      expect(cookie).not.toContain('Secure');
      expect(reply.headers.get('cache-control')).toBe('no-store');
    });

    it('logs a regular user in as a regular user', async () => {
      const name = fresh('carlos');
      await app.createUser(name, 'regular', 'Carlos García');
      const reply = await app.login(name);
      expect(reply.status).toBe(200);
      expect(reply.body.user).toMatchObject({
        role: 'regular',
        mode: 'regular',
        playerName: 'Carlos García',
        canSwitchView: false,
      });
    });

    it('treats the username without regard to case and surrounding spaces', async () => {
      const name = fresh('boss');
      await app.createUser(name, 'admin');
      expect((await app.login(`  ${name.toUpperCase()} `)).status).toBe(200);
    });

    it('answers a wrong password, an unknown user and a deactivated user identically', async () => {
      const name = fresh('ana');
      const user = await app.createUser(name, 'regular', 'Ana López');
      const gone = fresh('gone');
      const off = await app.createUser(gone, 'admin');
      app.conn.prepare('UPDATE users SET active = 0 WHERE id = ?').run(off.id);

      const badPassword = await wrong(name);
      const unknown = await wrong(fresh('nobody'));
      const deactivated = await app.login(gone);

      for (const reply of [badPassword, unknown, deactivated]) {
        expect(reply.status).toBe(401);
        expect(reply.body).toEqual(badPassword.body);
        expect(reply.setCookies).toEqual([]);
      }
      expect(row(name).n).toBe(1);
      expect(user.id).toBeGreaterThan(0);
    });

    it('locks the account on the fifth wrong password for fifteen minutes', async () => {
      const name = fresh('lock');
      await app.createUser(name, 'admin');
      for (let i = 0; i < 4; i++) expect((await wrong(name)).status).toBe(401);
      const fifth = await wrong(name);
      expect(fifth.status).toBe(423);
      expect(fifth.body.lockedMinutes).toBe(15);
      expect(new Date(row(name).until!).getTime()).toBe(
        app.clock.now().getTime() + 15 * 60_000
      );
    });

    it('refuses the correct password while locked and leaves the count alone', async () => {
      const name = fresh('lock');
      await app.createUser(name, 'admin');
      for (let i = 0; i < 5; i++) await wrong(name);
      app.advance(5);
      const reply = await app.login(name);
      expect(reply.status).toBe(423);
      expect(reply.body.lockedMinutes).toBe(10);
      expect(reply.body.accessToken).toBeUndefined();
      expect(row(name).n).toBe(5);
    });

    it('clears the count on a successful login', async () => {
      const name = fresh('ok');
      await app.createUser(name, 'admin');
      for (let i = 0; i < 3; i++) await wrong(name);
      expect((await app.login(name)).status).toBe(200);
      expect(row(name)).toEqual({ n: 0, until: null });
    });

    it('locks again on one wrong password after the lock has expired', async () => {
      const name = fresh('lock');
      await app.createUser(name, 'admin');
      for (let i = 0; i < 5; i++) await wrong(name);
      app.advance(16);
      expect((await wrong(name)).status).toBe(423);
    });

    it('lets the correct password in after the lock has expired', async () => {
      const name = fresh('lock');
      await app.createUser(name, 'admin');
      for (let i = 0; i < 5; i++) await wrong(name);
      app.advance(16);
      expect((await app.login(name)).status).toBe(200);
      expect(row(name)).toEqual({ n: 0, until: null });
    });

    it('lets at most five of twenty parallel guesses reach the password check', async () => {
      const name = fresh('race');
      await app.createUser(name, 'admin');
      const before = app.hasher.verifyCalls;
      const replies = await Promise.all(
        Array.from({ length: 20 }, () => wrong(name))
      );
      expect(app.hasher.verifyCalls - before).toBeLessThanOrEqual(5);
      expect(
        replies.filter(r => r.status === 423).length
      ).toBeGreaterThanOrEqual(15);
      expect(row(name).until).not.toBeNull();
    });

    it('refuses a missing or oversized field with 400', async () => {
      expect(
        (await app.request('/api/auth/login', { body: { username: 'x' } }))
          .status
      ).toBe(400);
      expect((await app.request('/api/auth/login', { body: {} })).status).toBe(
        400
      );
      const huge = await app.request('/api/auth/login', {
        body: { username: 'x', password: 'p'.repeat(1025) },
      });
      expect(huge.status).toBe(400);
    });

    it('never puts a password or a hash in an answer or in the logs', async () => {
      const spies = [
        vi.spyOn(console, 'log'),
        vi.spyOn(console, 'error'),
        vi.spyOn(console, 'warn'),
      ];
      const name = fresh('quiet');
      await app.createUser(name, 'admin');
      const replies = [
        await app.login(name),
        await wrong(name),
        await wrong(fresh('nobody')),
      ];
      const everything =
        JSON.stringify(replies.map(r => r.body)) +
        JSON.stringify(spies.map(s => s.mock.calls));
      expect(everything).not.toContain('scrypt$');
      expect(everything).not.toContain(AuthTestApp.PASSWORD);
      expect(everything).not.toContain('Not-the-Password1');
      spies.forEach(s => s.mockRestore());
    });
  });

  describe('session', () => {
    it('rejects an expired access token and issues a working one on refresh', async () => {
      const name = fresh('sess');
      await app.createUser(name, 'admin');
      const login = await app.login(name);
      const cookie = app.refreshCookieOf(login);

      app.advance(31);
      expect(
        (
          await app.request('/api/seasons/current', {
            token: login.body.accessToken,
          })
        ).status
      ).toBe(401);

      const refreshed = await app.request('/api/auth/refresh', {
        method: 'POST',
        cookie,
      });
      expect(refreshed.status).toBe(200);
      expect(
        (
          await app.request('/api/seasons/current', {
            token: refreshed.body.accessToken,
          })
        ).status
      ).toBe(200);
    });

    it('rotates the refresh token: the old one dies, the new one is stored hashed and works', async () => {
      const name = fresh('rot');
      await app.createUser(name, 'admin');
      const login = await app.login(name);
      const a = app.refreshCookieOf(login);

      const second = await app.request('/api/auth/refresh', {
        method: 'POST',
        cookie: a,
      });
      expect(second.status).toBe(200);
      const b = app.refreshCookieOf(second);
      expect(b).not.toBe(a);

      const reused = await app.request('/api/auth/refresh', {
        method: 'POST',
        cookie: a,
      });
      expect(reused.status).toBe(401);
      expect(reused.setCookies.join(';')).toContain('Max-Age=0');
      expect(
        (await app.request('/api/auth/refresh', { method: 'POST', cookie: b }))
          .status
      ).toBe(200);

      const stored = app.conn
        .prepare('SELECT token_hash FROM refresh_tokens')
        .all() as { token_hash: string }[];
      for (const { token_hash } of stored) {
        expect(token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(a + b).not.toContain(token_hash);
      }
    });

    it('refuses a refresh with no cookie, with garbage, and with an access token', async () => {
      const name = fresh('bad');
      await app.createUser(name, 'admin');
      const login = await app.login(name);
      expect(
        (await app.request('/api/auth/refresh', { method: 'POST' })).status
      ).toBe(401);
      expect(
        (
          await app.request('/api/auth/refresh', {
            method: 'POST',
            cookie: 'pachanguero_refresh=nonsense',
          })
        ).status
      ).toBe(401);
      expect(
        (
          await app.request('/api/auth/refresh', {
            method: 'POST',
            cookie: `pachanguero_refresh=${login.body.accessToken}`,
          })
        ).status
      ).toBe(401);
    });

    it('refuses a refresh after thirty days', async () => {
      const name = fresh('old');
      await app.createUser(name, 'admin');
      const cookie = app.refreshCookieOf(await app.login(name));
      app.advance(31 * 24 * 60);
      expect(
        (await app.request('/api/auth/refresh', { method: 'POST', cookie }))
          .status
      ).toBe(401);
    });

    it('refuses a refresh once the user is deactivated', async () => {
      const name = fresh('off');
      const user = await app.createUser(name, 'admin');
      const cookie = app.refreshCookieOf(await app.login(name));
      app.conn.prepare('UPDATE users SET active = 0 WHERE id = ?').run(user.id);
      expect(
        (await app.request('/api/auth/refresh', { method: 'POST', cookie }))
          .status
      ).toBe(401);
    });

    it('logs out: the cookie is cleared and the token no longer refreshes', async () => {
      const name = fresh('out');
      await app.createUser(name, 'admin');
      const cookie = app.refreshCookieOf(await app.login(name));
      const out = await app.request('/api/auth/logout', {
        method: 'POST',
        cookie,
      });
      expect(out.status).toBe(204);
      expect(out.setCookies.join(';')).toContain('Max-Age=0');
      expect(
        (await app.request('/api/auth/refresh', { method: 'POST', cookie }))
          .status
      ).toBe(401);
    });

    it('logs out with no cookie, twice, without complaint', async () => {
      expect(
        (await app.request('/api/auth/logout', { method: 'POST' })).status
      ).toBe(204);
      expect(
        (
          await app.request('/api/auth/logout', {
            method: 'POST',
            cookie: 'pachanguero_refresh=junk',
          })
        ).status
      ).toBe(204);
    });
  });
});
