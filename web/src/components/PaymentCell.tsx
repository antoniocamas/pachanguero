import { useState } from 'react';
import type { MemberKey } from '../api';
import { parseEuros } from '../lib/money';
import type { PaymentPart } from '../lib/paymentCell';

/** The settled and owed shares of a row, with the buttons to settle or undo them. */
export function PaymentCell({
  parts,
  busy,
  onPay,
  onUndo,
}: {
  parts: PaymentPart[];
  busy: boolean;
  onPay: (shares: MemberKey[], payerId: number, amountCents?: number) => void;
  onUndo: (paymentId: number) => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [amount, setAmount] = useState('');
  const cents = parseEuros(amount);

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
                {part.label}
                <button
                  className="btn mini"
                  disabled={busy}
                  onClick={() => onUndo(part.paymentId)}
                >
                  Deshacer
                </button>
              </span>
            );
          case 'pay':
            return (
              <button
                key={part.label}
                className="btn"
                disabled={busy}
                onClick={() => onPay(part.shares, part.payerId)}
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
                    onPay([part.share], part.payerId, cents);
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
                className="btn"
                disabled={busy}
                onClick={() => setAdjusting(true)}
              >
                Otro importe…
              </button>
            );
        }
      })}
    </div>
  );
}
