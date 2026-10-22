import { useCallback, useEffect, useState } from 'react';
import { api, type Contact, type DirectoryRow, type SeasonRole } from '../api';

/**
 * Every player with all the organiser knows of them as of one season, and the actions that
 * correct them. Each action reads everyone again afterwards; it answers false when refused.
 */
export function usePlayerDirectory(seasonId: number, reloadKey: unknown) {
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(
    () =>
      api
        .playerTable(seasonId)
        .then(found => {
          setRows(found);
          setLoaded(true);
        })
        .catch(e => setError((e as Error).message)),
    [seasonId]
  );
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

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
    rows,
    loaded,
    error,
    rename: (id: number, name: string, keepOldAsAlias: boolean) =>
      act(() => api.editPlayer(id, { name, keepOldAsAlias })),
    introduce: (id: number, introducedBy: number | null) =>
      act(() => api.editPlayer(id, { introducedBy })),
    merge: (id: number, from: number) => act(() => api.mergePlayers(id, from)),
    remove: (id: number) => act(() => api.deletePlayer(id)),
    addAlias: (id: number, alias: string) => act(() => api.addAlias(id, alias)),
    removeAlias: (id: number, alias: string) =>
      act(() => api.removeAlias(id, alias)),
    setRole: (id: number, role: SeasonRole) =>
      act(() => api.setRole(seasonId, id, role)),
    setHosts: (id: number, hostIds: number[]) =>
      act(() => api.setHosts(id, hostIds)),
    addBizumName: (id: number, name: string) =>
      act(() => api.setBizumName(id, name)),
    removeBizumName: (id: number, name: string) =>
      act(() => api.removeBizumName(id, name)),
    /** Throws the refusal, so the contact form can put it next to its field. */
    saveContact: async (id: number, patch: Partial<Contact>) => {
      await api.savePlayerContact(id, patch);
      await load();
    },
  };
}
