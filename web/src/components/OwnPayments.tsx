import type { OwnPaymentRow } from '../api';
import { paymentLines } from '../lib/ownDebts';

/** What was paid by the player or for them, newest first. */
export function OwnPayments({ payments }: { payments: OwnPaymentRow[] }) {
  if (payments.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <span className="big" aria-hidden>
            🧾
          </span>
          Todavía no hay pagos.
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="card" data-testid="own-payments">
        <h2>Pagos</h2>
        {paymentLines(payments).map(l => (
          <div className="row wrap" key={l.key}>
            <span className="name">
              {l.date}
              {l.label && <small>{l.label}</small>}
            </span>
            {l.tag && <span className="tag">{l.tag}</span>}
            <span className="amount">{l.amount}</span>
          </div>
        ))}
      </div>
      <p className="muted note-below">
        Los pagos importados de la hoja antigua muestran la fecha del partido
        como fecha de pago.
      </p>
    </>
  );
}
