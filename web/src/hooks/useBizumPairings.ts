import { useCallback } from 'react';
import { api } from '../api';
import { useGuarded } from './useGuarded';
import { useLoaded } from './useLoaded';

/** The players' Bizum names, and giving or taking one away by hand. */
export function useBizumPairings(report: (message: string | null) => void) {
  const { data, error, reload } = useLoaded(api.pairings);
  const { busy, run } = useGuarded(report);

  const set = useCallback(
    (playerId: number, bizumName: string) =>
      run(async () => {
        await api.setBizumName(playerId, bizumName);
        await reload();
      }),
    [run, reload]
  );
  const clear = useCallback(
    (playerId: number, bizumName: string) =>
      run(async () => {
        await api.removeBizumName(playerId, bizumName);
        await reload();
      }),
    [run, reload]
  );

  return { pairings: data ?? [], error, busy, set, clear };
}
