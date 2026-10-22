import { useCallback } from 'react';
import { api, type PairResult, type RestOfBizum, type SharesFor } from '../api';
import { useGuarded } from './useGuarded';

/**
 * What the organiser does with a waiting Bizum. The list is read again by `refresh`, which the
 * caller runs when it is done looking at the result: a Bizum that settled leaves the list, and
 * with it the dialog that shows what happened.
 */
export function useWaitingActions(
  refresh: () => Promise<void>,
  report: (message: string | null) => void
) {
  const { busy, run } = useGuarded(report);

  const pair = useCallback(
    async (bizumId: number, playerId: number) => {
      const answer: { result: PairResult | null } = { result: null };
      await run(async () => {
        answer.result = await api.pairBizum(bizumId, playerId);
      });
      return answer.result;
    },
    [run]
  );
  const rule = useCallback(
    (
      bizumId: number,
      playerId: number,
      shares: number,
      rest: RestOfBizum,
      others: SharesFor[] = []
    ) =>
      run(async () => {
        await api.ruleBizum(bizumId, playerId, shares, rest, others);
        await refresh();
      }),
    [run, refresh]
  );
  const dismiss = useCallback(
    (bizumId: number) =>
      run(async () => {
        await api.dismissBizum(bizumId);
        await refresh();
      }),
    [run, refresh]
  );

  return { busy, pair, rule, dismiss };
}
