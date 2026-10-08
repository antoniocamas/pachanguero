import { useEffect, useState } from 'react';
import { api, type PlayerReport } from '../api';

/** The report of the chosen player; `null` until one is chosen and loaded. */
export function usePlayerReport(playerId: number | null) {
  const [loaded, setLoaded] = useState<PlayerReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (playerId === null) return;
    let live = true;
    api
      .playerReport(playerId)
      .then(r => {
        if (!live) return;
        setLoaded(r);
        setError(null);
      })
      .catch(e => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [playerId]);

  return {
    report: loaded && loaded.player.id === playerId ? loaded : null,
    error,
  };
}
