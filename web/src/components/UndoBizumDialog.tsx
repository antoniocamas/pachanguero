import type { PaymentDetail } from '../api';
import { undoSummary } from '../lib/paymentDetail';
import { ResolveDialog } from './ResolveDialog';

/** Asks before undoing the payments of a Bizum, which are undone together and put it back on the list. */
export function UndoBizumDialog({
  detail,
  busy,
  onConfirm,
  onCancel,
}: {
  detail: PaymentDetail | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ResolveDialog
      open={detail !== null}
      title="Deshacer pago"
      onClose={onCancel}
    >
      {detail !== null && (
        <UndoBody
          detail={detail}
          busy={busy}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}
    </ResolveDialog>
  );
}

function UndoBody({
  detail,
  busy,
  onConfirm,
  onCancel,
}: {
  detail: PaymentDetail;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const summary = undoSummary(detail);
  return (
    <div className="dialog-body" data-testid="undo-bizum">
      <p>{summary.intro}</p>
      <h3>Se deshacen</h3>
      {summary.lines.map(line => (
        <div className="row" key={line}>
          {line}
        </div>
      ))}
      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={onConfirm}>
          {summary.confirm}
        </button>
        <button className="btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
