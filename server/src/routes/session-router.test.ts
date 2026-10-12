import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OwnDataService } from '../repo/own-data-service.js';
import { AuthTestApp, type ApiReply } from './auth-test-support.js';

type Repo = typeof import('../repo/index.js');

const NEW = 'Penalti-en-Mayo42';

describe('the routes of any signed-in user', () => {
  let app: AuthTestApp;
  let repo: Repo;
  let n = 0;
  const fresh = (prefix: string) => `${prefix}${++n}`;

  beforeAll(async () => {
    app = await AuthTestApp.start();
    repo = await import('../repo/index.js');
  });
  afterAll(async () => {
    await app.close();
  });

  const passwordHash = (username: string) =>
    (
      app.conn
        .prepare('SELECT password_hash AS h FROM users WHERE username = ?')
        .get(username) as { h: string }
    ).h;
  const changePassword = (
    token: string,
    body: { current?: string; next?: string; confirm?: string }
  ) => app.request('/api/me/password', { method: 'PUT', token, body });

  describe('password change', () => {
    const signedIn = async (role: 'admin' | 'regular', player?: string) => {
      const username = fresh('user');
      await app.createUser(username, role, player);
      const login = await app.login(username);
      return { username, login, token: login.body.accessToken! };
    };

    it('replaces the password, ends every session and lets the new one in', async () => {
      const { username, login, token } = await signedIn(
        'regular',
        'Carlos Uno'
      );
      const second = await app.login(username);

      const reply = await changePassword(token, {
        current: AuthTestApp.PASSWORD,
        next: NEW,
        confirm: NEW,
      });

      expect(reply.status).toBe(204);
      for (const session of [login, second]) {
        const refreshed = await app.request('/api/auth/refresh', {
          method: 'POST',
          cookie: app.refreshCookieOf(session),
        });
        expect(refreshed.status).toBe(401);
      }
      expect((await app.login(username)).status).toBe(401);
      expect((await app.login(username, NEW)).status).toBe(200);
    });

    it('refuses a wrong current password without changing anything or counting an attempt', async () => {
      const { username, token } = await signedIn('regular', 'Carlos Dos');
      const before = passwordHash(username);

      const reply = await changePassword(token, {
        current: 'Wrong-Password1!',
        next: NEW,
        confirm: NEW,
      });

      expect(reply.status).toBe(422);
      expect(reply.body.error).toBe('La contraseña actual no es correcta');
      expect(passwordHash(username)).toBe(before);
      expect(
        app.conn
          .prepare('SELECT failed_attempts AS n FROM users WHERE username = ?')
          .get(username)
      ).toEqual({ n: 0 });
      expect((await app.request('/api/me/contact', { token })).status).toBe(
        200
      );
    });

    it('never locks the account however often the current password is wrong', async () => {
      const { username, token } = await signedIn('regular', 'Carlos Tres');
      for (let i = 0; i < 8; i++) {
        await changePassword(token, {
          current: 'Wrong-Password1!',
          next: NEW,
          confirm: NEW,
        });
      }
      expect((await app.login(username)).status).toBe(200);
    });

    it('refuses a confirmation that differs', async () => {
      const { username, token } = await signedIn('regular', 'Carlos Cuatro');
      const before = passwordHash(username);
      const reply = await changePassword(token, {
        current: AuthTestApp.PASSWORD,
        next: NEW,
        confirm: `${NEW}x`,
      });
      expect(reply.status).toBe(422);
      expect(passwordHash(username)).toBe(before);
    });

    it.each([
      ['short1!A', 'al menos'],
      ['alllowercase1!x', 'mayúscula'],
      ['ALLUPPERCASE1!X', 'minúscula'],
      ['NoDigitsInHere!!', 'número'],
      ['NoSpecialChar123', 'especial'],
    ])('refuses %s and lists the failed rule', async (candidate, word) => {
      const { token } = await signedIn('regular', `Carlos ${fresh('Regla')}`);
      const reply = await changePassword(token, {
        current: AuthTestApp.PASSWORD,
        next: candidate,
        confirm: candidate,
      });
      expect(reply.status).toBe(422);
      const rules = (reply.body as unknown as { rules: string[] }).rules;
      expect(rules.join(' ')).toContain(word);
    });

    it('refuses the same password again', async () => {
      const { token } = await signedIn('regular', 'Carlos Cinco');
      const reply = await changePassword(token, {
        current: AuthTestApp.PASSWORD,
        next: AuthTestApp.PASSWORD,
        confirm: AuthTestApp.PASSWORD,
      });
      expect(reply.status).toBe(422);
      expect(reply.body.error).toContain('distinta');
    });

    it('lets an admin with no player change theirs', async () => {
      const { username, token } = await signedIn('admin');
      const reply = await changePassword(token, {
        current: AuthTestApp.PASSWORD,
        next: NEW,
        confirm: NEW,
      });
      expect(reply.status).toBe(204);
      expect((await app.login(username, NEW)).status).toBe(200);
    });

    it('lets an admin in the regular view change theirs', async () => {
      const username = fresh('both');
      const user = await app.createUser(username, 'admin', 'Antonio Doble');
      const token = await app.tokenFor(
        { role: 'admin', view: 'regular' },
        user.id
      );
      const reply = await changePassword(token, {
        current: AuthTestApp.PASSWORD,
        next: NEW,
        confirm: NEW,
      });
      expect(reply.status).toBe(204);
    });

    it('answers 400 when a field is missing and 401 without a token', async () => {
      const { token } = await signedIn('regular', 'Carlos Seis');
      expect((await changePassword(token, { current: 'x' })).status).toBe(400);
      expect(
        (await changePassword('', { current: 'a', next: 'b', confirm: 'b' }))
          .status
      ).toBe(401);
    });
  });

  describe('view switch', () => {
    const admin = async (withPlayer = true) => {
      const username = fresh('boss');
      const user = await app.createUser(
        username,
        'admin',
        withPlayer ? `Jefe ${username}` : undefined
      );
      const login = await app.login(username);
      return {
        username,
        user,
        login,
        cookie: app.refreshCookieOf(login),
        token: login.body.accessToken!,
      };
    };
    const switchTo = (view: unknown, token: string, cookie?: string) =>
      app.request('/api/auth/view', { token, cookie, body: { view } });
    const tableCounts = () =>
      (
        app.conn
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'refresh_tokens'"
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
    const status = async (path: string, reply: ApiReply) =>
      (await app.request(path, { token: reply.body.accessToken })).status;

    it('moves an admin with a player into the regular view: own routes open, organiser routes closed', async () => {
      const { token, cookie } = await admin();
      const before = tableCounts();

      const reply = await switchTo('regular', token, cookie);

      expect(reply.status).toBe(200);
      expect(reply.body.user).toMatchObject({ role: 'admin', mode: 'regular' });
      expect(reply.setCookies).toEqual([]);
      expect(await status('/api/debts', reply)).toBe(403);
      for (const path of ['debts', 'payments', 'report', 'contact']) {
        expect(await status(`/api/me/${path}`, reply)).toBe(200);
      }
      expect(tableCounts()).toEqual(before);
    });

    it('answers in the regular view exactly what the own data service gives the admin player', async () => {
      const { user, token, cookie } = await admin();
      const game = repo.games.create(
        repo.seasons.create({ name: `2027/${2028 + n}` }).id,
        `2027-10-${String(10 + n).padStart(2, '0')}`
      ).id;
      repo.games.setState(game, 'played');
      repo.debtRepository.insert(
        game,
        { playerId: user.playerId! },
        user.playerId!,
        500
      );
      const service = new OwnDataService(
        repo.debtRepository,
        repo.paymentRepository,
        repo.playerReport,
        app.clock
      );

      const reply = await switchTo('regular', token, cookie);
      const answer = async (path: string) =>
        (
          await app.request(`/api/me/${path}`, {
            token: reply.body.accessToken,
          })
        ).body;

      expect(await answer('debts')).toEqual(service.debts(user.playerId!));
      expect(await answer('payments')).toEqual(
        service.payments(user.playerId!)
      );
      expect(await answer('report')).toEqual(
        JSON.parse(JSON.stringify(service.report(user.playerId!)))
      );
      expect(await answer('contact')).toEqual({ email: null, phone: null });
      expect(await answer('debts')).toMatchObject({ owedCents: 500 });
    });

    it('moves back to the admin view: organiser routes answer again', async () => {
      const { token, cookie } = await admin();
      const regular = await switchTo('regular', token, cookie);

      const back = await switchTo('admin', regular.body.accessToken!, cookie);

      expect(back.body.user).toMatchObject({ mode: 'admin' });
      expect(await status('/api/debts', back)).toBe(200);
      expect(await status('/api/me/debts', back)).toBe(403);
    });

    it('keeps the view when the access token expires and is refreshed, and on a reload', async () => {
      const { token, cookie } = await admin();
      await switchTo('regular', token, cookie);

      app.advance(31);
      const refreshed = await app.request('/api/auth/refresh', {
        method: 'POST',
        cookie,
      });

      expect(refreshed.status).toBe(200);
      expect(refreshed.body.user?.mode).toBe('regular');
      const again = await app.request('/api/auth/refresh', {
        method: 'POST',
        cookie: app.refreshCookieOf(refreshed),
      });
      expect(again.body.user?.mode).toBe('regular');
    });

    it('starts the next login in the admin view', async () => {
      const { username, token, cookie } = await admin();
      await switchTo('regular', token, cookie);
      await app.request('/api/auth/logout', { method: 'POST', cookie });

      const login = await app.login(username);

      expect(login.body.user?.mode).toBe('admin');
    });

    it('offers no switch to an admin with no player, and refuses it', async () => {
      const { login, token, cookie } = await admin(false);

      expect(login.body.user?.canSwitchView).toBe(false);
      const reply = await switchTo('regular', token, cookie);
      expect(reply.status).toBe(403);
      expect(reply.body.error).toBe('No tienes un jugador asociado');
    });

    it.each(['admin', 'regular'])(
      'refuses a regular user asking for the %s view and leaves them regular',
      async view => {
        const username = fresh('player');
        await app.createUser(username, 'regular', `Jugador ${username}`);
        const login = await app.login(username);
        const cookie = app.refreshCookieOf(login);

        const reply = await switchTo(view, login.body.accessToken!, cookie);

        expect(reply.status).toBe(403);
        expect(login.body.user).toMatchObject({
          mode: 'regular',
          canSwitchView: false,
        });
        const refreshed = await app.request('/api/auth/refresh', {
          method: 'POST',
          cookie,
        });
        expect(refreshed.body.user?.mode).toBe('regular');
      }
    );

    it('answers 400 to an invalid view and 401 without the refresh cookie or a token', async () => {
      const { token, cookie } = await admin();
      const before = tableCounts();

      expect((await switchTo('owner', token, cookie)).status).toBe(400);
      expect((await switchTo(undefined, token, cookie)).status).toBe(400);
      expect((await switchTo('regular', token)).status).toBe(401);
      expect((await switchTo('regular', '', cookie)).status).toBe(401);
      expect(tableCounts()).toEqual(before);
    });

    it("refuses another user's refresh cookie", async () => {
      const first = await admin();
      const second = await admin();
      const reply = await switchTo('regular', first.token, second.cookie);
      expect(reply.status).toBe(401);
    });
  });
});
