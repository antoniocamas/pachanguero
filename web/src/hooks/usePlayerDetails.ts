import { useCallback, useEffect, useState } from 'react';
import { api, type PlayerDetail } from '../api';

/** Every player with their aliases, and the actions that correct them. */
export function usePlayerDetails(reloadKey: unknown) {
  const [details, setDetails] = useState<PlayerDetail[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .playerDetails()
        .then(setDetails)
        .catch(e => setError((e as Error).message)),
    []
  );
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  /** Runs one correction, then reads everyone again; false when it was refused. */
  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        setError(null);
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [load]
  );

  return {
    details,
    error,
    rename: (id: number, name: string, keepOldAsAlias: boolean) =>
      act(() => api.editPlayer(id, { name, keepOldAsAlias })),
    introduce: (id: number, introducedBy: number | null) =>
      act(() => api.editPlayer(id, { introducedBy })),
    merge: (id: number, from: number) => act(() => api.mergePlayers(id, from)),
    addAlias: (id: number, alias: string) => act(() => api.addAlias(id, alias)),
    removeAlias: (id: number, alias: string) =>
      act(() => api.removeAlias(id, alias)),
  };
}
