import { useCallback } from 'react';
import { api, type MemberKey } from '../api';
import { useGuarded } from './useGuarded';

/** Recording and undoing payments of the shares of a played game. */
export function usePayments(
  gameId: number,
  reload: () => Promise<void>,
  report: (message: string | null) => void
) {
  const { busy, run } = useGuarded(report);

  const pay = useCallback(
    (shares: MemberKey[], payerPlayerId: number, amountCents?: number) =>
      run(async () => {
        await api.pay(gameId, { shares, payerPlayerId, amountCents });
        await reload();
      }),
    [gameId, run, reload]
  );

  const undo = useCallback(
    (paymentId: number) =>
      run(async () => {
        await api.undoPayment(gameId, paymentId);
        await reload();
      }),
    [gameId, run, reload]
  );

  return { busy, pay, undo };
}
