import { useCallback, useEffect, useState } from 'react';
import { api, type GameDetail } from '../api';

/** The selected game's detail, kept fresh by `reload`. */
export function useGameDetail(gameId: number | null) {
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!gameId) return;
    try {
      setDetail(await api.game(gameId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [gameId]);

  useEffect(() => {
    void (async () => {
      await reload();
    })();
  }, [reload]);

  const clear = useCallback(() => setDetail(null), []);

  return { detail, error, setError, reload, clear };
}
