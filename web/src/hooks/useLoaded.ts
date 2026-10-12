import { useCallback, useEffect, useState } from 'react';

/** Reads one thing from the server when the screen opens, with a way to read it again. */
export function useLoaded<T>(read: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await read());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [read]);

  useEffect(() => {
    void (async () => {
      await reload();
    })();
  }, [reload]);

  return { data, error, reload };
}
