import { bizumPaymentLines, detailRows } from '../lib/paymentDetail';
import { usePaymentDetail } from '../hooks/usePaymentDetail';

/**
 * How a payment was made and, when a Bizum made it, that Bizum: the booking date, the sender as
 * the bank shows it, what is left over, and every payment it made. Undoing a Bizum's payment
 * undoes them all, and the dialog says so.
 */
export function PaymentDetail({
  paymentId,
  busy,
  onUndo,
}: {
  paymentId: number;
  busy: boolean;
  onUndo: () => void;
}) {
  const { data, error } = usePaymentDetail(paymentId);

  if (error !== null) return <p className="error">{error}</p>;
  if (data === null) return <p className="muted">Cargando…</p>;

  const lines = bizumPaymentLines(data);
  return (
    <div data-testid="payment-detail">
      {detailRows(data).map(row => (
        <div className="row" key={row.label}>
          <span className="name">{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
      {lines.length > 1 && (
        <>
          <h3>Pagos de este Bizum</h3>
          {lines.map(line => (
            <div className="row" key={line}>
              {line}
            </div>
          ))}
          <p className="muted">Al deshacer uno se deshacen todos.</p>
        </>
      )}
      <button className="btn" disabled={busy} onClick={onUndo}>
        Deshacer pago
      </button>
    </div>
  );
}
