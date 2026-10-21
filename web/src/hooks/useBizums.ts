import { useCallback, useState } from 'react';
import { api } from '../api';
import { useKnownPlayers } from './useKnownPlayers';
import { useLoaded } from './useLoaded';
import { useReadNow } from './useReadNow';
import { useSettledBizums } from './useSettledBizums';
import { useWaitingActions } from './useWaitingActions';
import { useWaitingBizums } from './useWaitingBizums';

/**
 * Everything the Bizum views of Deudas share: the Bizums that wait, the ones settled, who
 * their senders may be, what the organiser can do with a waiting one and reading the bank.
 * `onSettled` reads the debts again, which a Bizum may have paid.
 */
export function useBizums(onSettled: () => Promise<void>) {
  const waiting = useWaitingBizums();
  const settled = useSettledBizums();
  const pairings = useLoaded(api.pairings);
  const players = useKnownPlayers(null);
  const [problem, setProblem] = useState<string | null>(null);

  const { reload: reloadWaiting } = waiting;
  const { reload: reloadSettled } = settled;
  const { reload: reloadPairings } = pairings;
  const refresh = useCallback(async () => {
    await Promise.all([
      reloadWaiting(),
      reloadSettled(),
      reloadPairings(),
      onSettled(),
    ]);
  }, [reloadWaiting, reloadSettled, reloadPairings, onSettled]);

  return {
    waiting: waiting.data ?? [],
    settled: settled.data ?? [],
    pairings: pairings.data ?? [],
    players,
    error: problem ?? waiting.error,
    refresh,
    actions: useWaitingActions(refresh, setProblem),
    read: useReadNow(refresh),
  };
}
