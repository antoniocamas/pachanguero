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

  // Choosing another game while one is being read must not let the first answer replace the
  // second's: an answer for a game that is no longer chosen is dropped.
  useEffect(() => {
    if (!gameId) return;
    let chosen = true;
    void (async () => {
      try {
        const read = await api.game(gameId);
        if (!chosen) return;
        setDetail(read);
        setError(null);
      } catch (e) {
        if (chosen) setError((e as Error).message);
      }
    })();
    return () => {
      chosen = false;
    };
  }, [gameId]);

  const clear = useCallback(() => setDetail(null), []);

  return { detail, error, setError, reload, clear };
}
