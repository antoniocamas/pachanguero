import { useState } from 'react';
import type { MemberKey, PaymentMethod } from '../api';
import { useBizumUndo } from '../hooks/useBizumUndo';
import { parseEuros } from '../lib/money';
import { opensDetail, type PaymentPart } from '../lib/paymentCell';
import { PaymentDetail } from './PaymentDetail';
import { ResolveDialog } from './ResolveDialog';
import { UndoBizumDialog } from './UndoBizumDialog';

/** The settled and owed shares of a row, with the buttons to settle or undo them. */
export function PaymentCell({
  parts,
  method,
  busy,
  onPay,
  onUndo,
  report,
}: {
  parts: PaymentPart[];
  /** How the money is handed over, chosen once for the whole table. */
  method: PaymentMethod;
  busy: boolean;
  onPay: (
    shares: MemberKey[],
    payerId: number,
    method: PaymentMethod,
    amountCents?: number
  ) => void;
  onUndo: (paymentId: number) => void;
  /** Where a failure to look a payment up is told. */
  report: (message: string | null) => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [detailOf, setDetailOf] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const cents = parseEuros(amount);
  const bizumUndo = useBizumUndo(onUndo, report);

  if (parts.length === 0) return <>–</>;

  return (
    <div className="pay-cell">
      {parts.map(part => {
        switch (part.kind) {
          case 'tag':
            return (
              <span key={part.label} className="tag holder">
                {part.label}
              </span>
            );
          case 'paid':
            return (
              <span key={part.paymentId} className="chip paid">
                {opensDetail(part) ? (
                  <button
                    className="btn link"
                    onClick={() => setDetailOf(part.paymentId)}
                  >
                    {part.label}
                  </button>
                ) : (
                  part.label
                )}
                <button
                  className="btn mini"
                  disabled={busy}
                  onClick={() =>
                    part.method === 'bizum'
                      ? void bizumUndo.request(part.paymentId)
                      : onUndo(part.paymentId)
                  }
                >
                  Deshacer
                </button>
              </span>
            );
          case 'pay':
            return (
              <button
                key={part.label}
                className="btn pay"
                disabled={busy}
                onClick={() => onPay(part.shares, part.payerId, method)}
              >
                {part.label}
              </button>
            );
          case 'adjust':
            return adjusting ? (
              <span key="adjust" className="adjust">
                <input
                  aria-label="Importe"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
                <button
                  className="btn"
                  disabled={busy || cents === null}
                  onClick={() => {
                    if (cents === null) return;
                    onPay([part.share], part.payerId, method, cents);
                    setAdjusting(false);
                    setAmount('');
                  }}
                >
                  Pagar este importe
                </button>
              </span>
            ) : (
              <button
                key="adjust"
                className="btn mini"
                aria-label="Otro importe…"
                title="Otro importe…"
                disabled={busy}
                onClick={() => setAdjusting(true)}
              >
                ⋯
              </button>
            );
        }
      })}
      <ResolveDialog
        open={detailOf !== null}
        title="Detalle del pago"
        onClose={() => setDetailOf(null)}
      >
        {detailOf !== null && (
          <PaymentDetail
            paymentId={detailOf}
            busy={busy}
            onUndo={() => {
              void bizumUndo.request(detailOf);
              setDetailOf(null);
            }}
          />
        )}
      </ResolveDialog>
      <UndoBizumDialog
        detail={bizumUndo.asking}
        busy={busy}
        onConfirm={bizumUndo.confirm}
        onCancel={bizumUndo.cancel}
      />
    </div>
  );
}
