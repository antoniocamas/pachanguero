import { useCallback } from 'react';
import { api, type MemberKey, type PaymentMethod } from '../api';
import { useGuarded } from './useGuarded';

/** Settling shares of any game from the debts screen, or moving them to whoever pays them. */
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
      method: PaymentMethod,
      amountCents?: number
    ) =>
      run(async () => {
        await api.pay(gameId, { shares, payerPlayerId, amountCents, method });
        await reload();
      }),
    [run, reload]
  );

  /** Someone else answers for the share from now on. */
  const reassign = useCallback(
    (gameId: number, debtId: number, holderPlayerId: number) =>
      run(async () => {
        await api.reassignDebt(gameId, debtId, holderPlayerId);
        await reload();
      }),
    [run, reload]
  );

  return { busy, pay, reassign };
}
