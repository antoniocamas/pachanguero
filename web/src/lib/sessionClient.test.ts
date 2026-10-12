import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createSessionClient,
  type SessionUser,
} from './sessionClient';

const user: SessionUser = {
  username: 'boss',
  role: 'admin',
  mode: 'admin',
  playerName: null,
  canSwitchView: false,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const session = (accessToken: string) =>
  json(200, { accessToken, expiresIn: 1800, user });

/** A fake server: answers by path, in order, and remembers what it was asked. */
function fakeFetch(answers: Record<string, Array<() => Response>>) {
  const calls: Array<{ path: string; auth: string | null }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/api', '');
    const headers = new Headers(init?.headers);
    calls.push({ path, auth: headers.get('Authorization') });
    const next = answers[path]?.shift();
    if (!next) throw new Error(`no answer left for ${path}`);
    return next();
  }) as unknown as typeof fetch;
  const count = (path: string) => calls.filter(c => c.path === path).length;
  return { impl, calls, count };
}

describe('the session client', () => {
  it('sends no token before login and the token after it', async () => {
    const f = fakeFetch({
      '/auth/login': [() => session('token-1')],
      '/seasons': [() => json(200, []), () => json(200, [])],
    });
    const client = createSessionClient(f.impl);

    await client.request('/seasons');
    await client.login('boss', 'pw');
    await client.request('/seasons');

    expect(f.calls.filter(c => c.path === '/seasons').map(c => c.auth)).toEqual(
      [null, 'Bearer token-1']
    );
  });

  it('refreshes once on a 401 and repeats the request once with the new token', async () => {
    const f = fakeFetch({
      '/auth/login': [() => session('old')],
      '/auth/refresh': [() => session('new')],
      '/seasons': [
        () => json(401, { error: 'No autorizado' }),
        () => json(200, [{ id: 1 }]),
      ],
    });
    const client = createSessionClient(f.impl);
    await client.login('boss', 'pw');

    expect(await client.request('/seasons')).toEqual([{ id: 1 }]);
    expect(f.count('/auth/refresh')).toBe(1);
    expect(f.calls.filter(c => c.path === '/seasons').map(c => c.auth)).toEqual(
      ['Bearer old', 'Bearer new']
    );
  });

  it('makes one refresh for three requests that fail together, and repeats all three', async () => {
    const f = fakeFetch({
      '/auth/login': [() => session('old')],
      '/auth/refresh': [() => session('new')],
      '/a': [() => json(401, {}), () => json(200, 'a')],
      '/b': [() => json(401, {}), () => json(200, 'b')],
      '/c': [() => json(401, {}), () => json(200, 'c')],
    });
    const client = createSessionClient(f.impl);
    await client.login('boss', 'pw');

    const results = await Promise.all([
      client.request('/a'),
      client.request('/b'),
      client.request('/c'),
    ]);

    expect(results).toEqual(['a', 'b', 'c']);
    expect(f.count('/auth/refresh')).toBe(1);
  });

  it('restores the user from the cookie, and gets null when there is no session', async () => {
    const restored = createSessionClient(
      fakeFetch({ '/auth/refresh': [() => session('t')] }).impl
    );
    expect(await restored.restore()).toEqual(user);

    const none = createSessionClient(
      fakeFetch({
        '/auth/refresh': [() => json(401, { error: 'No autorizado' })],
      }).impl
    );
    expect(await none.restore()).toBeNull();
  });

  it('makes one refresh call for two restores at once', async () => {
    const f = fakeFetch({ '/auth/refresh': [() => session('t')] });
    const client = createSessionClient(f.impl);
    const [a, b] = await Promise.all([client.restore(), client.restore()]);
    expect(a).toEqual(user);
    expect(b).toEqual(user);
    expect(f.count('/auth/refresh')).toBe(1);
  });

  it('drops the session when the refresh is refused: one notice, the request rejects, no loop', async () => {
    const f = fakeFetch({
      '/auth/login': [() => session('old')],
      '/auth/refresh': [() => json(401, {})],
      '/a': [() => json(401, { error: 'No autorizado' })],
      '/b': [() => json(401, { error: 'No autorizado' })],
    });
    const client = createSessionClient(f.impl);
    const expired = vi.fn();
    client.onExpired(expired);
    await client.login('boss', 'pw');

    await expect(client.request('/a')).rejects.toBeInstanceOf(ApiError);
    await expect(client.request('/b')).rejects.toThrow('No autorizado');

    expect(expired).toHaveBeenCalledTimes(1);
    expect(f.count('/auth/refresh')).toBe(2);
  });

  it('does not announce an expiry when a restore finds no session', async () => {
    const client = createSessionClient(
      fakeFetch({ '/auth/refresh': [() => json(401, {})] }).impl
    );
    const expired = vi.fn();
    client.onExpired(expired);
    await client.restore();
    expect(expired).not.toHaveBeenCalled();
  });

  it('rejects a second 401 after a successful refresh without refreshing again', async () => {
    const f = fakeFetch({
      '/auth/login': [() => session('old')],
      '/auth/refresh': [() => session('new')],
      '/seasons': [
        () => json(401, {}),
        () => json(401, { error: 'No autorizado' }),
      ],
    });
    const client = createSessionClient(f.impl);
    await client.login('boss', 'pw');

    await expect(client.request('/seasons')).rejects.toBeInstanceOf(ApiError);
    expect(f.count('/auth/refresh')).toBe(1);
  });

  it('rejects a wrong login and a locked account with the server message, without refreshing', async () => {
    const f = fakeFetch({
      '/auth/login': [
        () => json(401, { error: 'Usuario o contraseña incorrectos.' }),
        () => json(423, { error: 'Cuenta bloqueada.', lockedMinutes: 15 }),
      ],
    });
    const client = createSessionClient(f.impl);

    await expect(client.login('boss', 'x')).rejects.toMatchObject({
      status: 401,
      message: 'Usuario o contraseña incorrectos.',
    });
    await expect(client.login('boss', 'x')).rejects.toMatchObject({
      status: 423,
      extra: { lockedMinutes: 15 },
    });
    expect(f.count('/auth/refresh')).toBe(0);
  });

  it('rejects a 422 with its message and does not refresh', async () => {
    const f = fakeFetch({
      '/auth/login': [() => session('t')],
      '/me/password': [
        () => json(422, { error: 'La contraseña actual no es correcta.' }),
      ],
    });
    const client = createSessionClient(f.impl);
    await client.login('boss', 'pw');

    await expect(
      client.request('/me/password', { method: 'PUT' })
    ).rejects.toMatchObject({
      status: 422,
      message: 'La contraseña actual no es correcta.',
    });
    expect(f.count('/auth/refresh')).toBe(0);
  });

  it('clears the token on logout even when the call fails', async () => {
    const f = fakeFetch({
      '/auth/login': [() => session('t')],
      '/auth/logout': [
        () => {
          throw new Error('offline');
        },
      ],
      '/seasons': [() => json(200, [])],
    });
    const client = createSessionClient(f.impl);
    await client.login('boss', 'pw');

    await client.logout();
    await client.request('/seasons');

    expect(f.calls.find(c => c.path === '/seasons')?.auth).toBeNull();
  });

  it('answers a 204 with nothing', async () => {
    const f = fakeFetch({ '/x': [() => new Response(null, { status: 204 })] });
    expect(await createSessionClient(f.impl).request('/x')).toBeUndefined();
  });

  describe('switching view', () => {
    const player: SessionUser = {
      ...user,
      mode: 'regular',
      playerName: 'Antonio',
      canSwitchView: true,
    };

    it('stores the new token, sends it from then on, and answers the updated user', async () => {
      const f = fakeFetch({
        '/auth/login': [() => session('old')],
        '/auth/view': [
          () =>
            json(200, {
              accessToken: 'regular',
              expiresIn: 1800,
              user: player,
            }),
        ],
        '/me/debts': [() => json(200, {})],
      });
      const client = createSessionClient(f.impl);
      await client.login('boss', 'pw');

      expect(await client.switchView('regular')).toEqual(player);
      await client.request('/me/debts');

      expect(f.calls.map(c => [c.path, c.auth])).toEqual([
        ['/auth/login', null],
        ['/auth/view', 'Bearer old'],
        ['/me/debts', 'Bearer regular'],
      ]);
    });

    it('goes through the normal refresh when the token has expired', async () => {
      const f = fakeFetch({
        '/auth/login': [() => session('old')],
        '/auth/refresh': [() => session('fresh')],
        '/auth/view': [
          () => json(401, { error: 'No autorizado' }),
          () =>
            json(200, {
              accessToken: 'regular',
              expiresIn: 1800,
              user: player,
            }),
        ],
      });
      const client = createSessionClient(f.impl);
      await client.login('boss', 'pw');

      expect(await client.switchView('regular')).toEqual(player);
      expect(f.count('/auth/refresh')).toBe(1);
      expect(
        f.calls.filter(c => c.path === '/auth/view').map(c => c.auth)
      ).toEqual(['Bearer old', 'Bearer fresh']);
    });

    it('rejects with the server message and keeps the current token when the switch is refused', async () => {
      const f = fakeFetch({
        '/auth/login': [() => session('old')],
        '/auth/view': [
          () => json(403, { error: 'No tienes un jugador asociado' }),
        ],
        '/seasons': [() => json(200, [])],
      });
      const client = createSessionClient(f.impl);
      await client.login('boss', 'pw');

      await expect(client.switchView('regular')).rejects.toThrow(
        'No tienes un jugador asociado'
      );
      await client.request('/seasons');

      expect(f.calls.at(-1)?.auth).toBe('Bearer old');
    });
  });
});
