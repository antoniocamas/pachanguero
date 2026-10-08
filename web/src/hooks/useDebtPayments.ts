import { useCallback } from 'react';
import { api, type MemberKey } from '../api';
import { useGuarded } from './useGuarded';

/** Settling shares of any game from the debts screen. */
export function useDebtPayments(
  reload: () => Promise<void>,
  report: (message: string | null) => void
) {
  const { busy, run } = useGuarded(report);

  const pay = useCallback(
    (
      gameId: number,
      shares: MemberKey[],
      payerPlayerId: number,
      amountCents?: number
    ) =>
      run(async () => {
        await api.pay(gameId, { shares, payerPlayerId, amountCents });
        await reload();
      }),
    [run, reload]
  );

  return { busy, pay };
}
