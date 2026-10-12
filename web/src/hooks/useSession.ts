import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { SessionUser, SwitchView } from '../lib/sessionClient';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: SessionUser };

/** Who is using the app: found from the refresh cookie on load, then by login and logout. */
export function useSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    void api.restore().then(user => {
      if (live)
        setState(
          user ? { status: 'authenticated', user } : { status: 'anonymous' }
        );
    });
    const stop = api.onExpired(() => setState({ status: 'anonymous' }));
    return () => {
      live = false;
      stop();
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const user = await api.login(username, password);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setState({ status: 'anonymous' });
  }, []);

  const switchView = useCallback<SwitchView>(async (view, playerId) => {
    const user = await api.switchView(view, playerId);
    setState({ status: 'authenticated', user });
  }, []);

  return { state, login, logout, switchView };
}
