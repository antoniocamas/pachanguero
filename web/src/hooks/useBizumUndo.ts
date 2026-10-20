import { useCallback, useState } from 'react';
import { api, type PaymentDetail } from '../api';

/**
 * Undoing a payment made with Bizum method. One a bank Bizum made asks first, listing everything
 * the Bizum paid, because undoing it undoes them all; one recorded by hand, with no Bizum behind
 * it, is undone straight away as any manual payment is.
 */
export function useBizumUndo(
  undo: (paymentId: number) => void,
  report: (message: string | null) => void
) {
  const [asking, setAsking] = useState<{
    paymentId: number;
    detail: PaymentDetail;
  } | null>(null);

  const request = useCallback(
    async (paymentId: number) => {
      try {
        const detail = await api.paymentDetail(paymentId);
        if (detail.bizum === null) undo(paymentId);
        else setAsking({ paymentId, detail });
      } catch (e) {
        report((e as Error).message);
      }
    },
    [undo, report]
  );
  const confirm = useCallback(() => {
    if (asking !== null) undo(asking.paymentId);
    setAsking(null);
  }, [asking, undo]);
  const cancel = useCallback(() => setAsking(null), []);

  return { asking: asking?.detail ?? null, request, confirm, cancel };
}
