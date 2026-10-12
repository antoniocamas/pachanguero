export interface SessionUser {
  username: string;
  role: 'admin' | 'regular';
  /** The effective role: which screen to show. */
  mode: 'admin' | 'regular';
  playerName: string | null;
  canSwitchView: boolean;
}

/** A non-2xx answer: the status, the server's own message and any extra fields it sent. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export interface SessionClient {
  /** Calls `/api<path>` with the access token; on a 401 refreshes once and repeats once. */
  request<T>(path: string, init?: RequestInit): Promise<T>;
  login(username: string, password: string): Promise<SessionUser>;
  /** Starts from the refresh cookie after a page load: the user, or null when there is no session. */
  restore(): Promise<SessionUser | null>;
  logout(): Promise<void>;
  /** Called once when a session ends because it could not be refreshed. */
  onExpired(listener: () => void): () => void;
}

interface SessionAnswer {
  accessToken: string;
  user: SessionUser;
}

/**
 * The session lives in a closure: the access token is never written anywhere the page can
 * read back, and the refresh token is an HttpOnly cookie this code cannot see. The fetch is
 * injected so the whole behaviour can be tested without a browser.
 */
export function createSessionClient(fetchImpl: typeof fetch): SessionClient {
  let token: string | null = null;
  let refreshing: Promise<SessionUser | null> | null = null;
  let expiredReported = false;
  const listeners = new Set<() => void>();

  const send = (path: string, init?: RequestInit) =>
    fetchImpl(`/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

  const failure = async (res: Response): Promise<ApiError> => {
    const body = (await res
      .json()
      .catch(() => ({ error: res.statusText }))) as Record<string, unknown>;
    return new ApiError(
      res.status,
      typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
      body
    );
  };

  const settle = async <T>(res: Response): Promise<T> => {
    if (!res.ok) throw await failure(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  };

  const begin = (answer: SessionAnswer): SessionUser => {
    token = answer.accessToken;
    expiredReported = false;
    return answer.user;
  };

  // One refresh at a time, shared: a second call would present a token the first rotated.
  const refresh = (): Promise<SessionUser | null> => {
    refreshing ??= (async () => {
      try {
        const res = await send('/auth/refresh', { method: 'POST' });
        if (!res.ok) {
          token = null;
          return null;
        }
        return begin((await res.json()) as SessionAnswer);
      } catch {
        token = null;
        return null;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  };

  const expire = () => {
    if (expiredReported) return;
    expiredReported = true;
    listeners.forEach(listener => listener());
  };

  return {
    async request<T>(path: string, init?: RequestInit): Promise<T> {
      const first = await send(path, init);
      if (first.status !== 401) return settle<T>(first);
      if (!(await refresh())) {
        expire();
        throw await failure(first);
      }
      return settle<T>(await send(path, init));
    },

    async login(username, password) {
      const res = await send('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      return begin(await settle<SessionAnswer>(res));
    },

    restore: refresh,

    async logout() {
      try {
        await send('/auth/logout', { method: 'POST' });
      } catch {
        // the server cannot be reached: the session ends here anyway
      } finally {
        token = null;
      }
    },

    onExpired(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
