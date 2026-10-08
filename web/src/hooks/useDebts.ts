import { useCallback, useEffect, useState } from 'react';
import { api, type OutstandingShare } from '../api';

/** Every share still owed, with a way to read it again. */
export function useDebts() {
  const [shares, setShares] = useState<OutstandingShare[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setShares(await api.debts());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await reload();
    })();
  }, [reload]);

  return { shares, error, reload };
}
