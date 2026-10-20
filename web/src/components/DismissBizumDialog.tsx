import type { WaitingBizum } from '../api';
import { amountText, senderText } from '../lib/waitingBizums';
import { ResolveDialog } from './ResolveDialog';

/** Asks before forgetting a Bizum for good. */
export function DismissBizumDialog({
  item,
  open,
  busy,
  onConfirm,
  onClose,
}: {
  item: WaitingBizum;
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ResolveDialog open={open} title="Descartar Bizum" onClose={onClose}>
      <div className="dialog-body">
        <p>
          Este Bizum de {amountText(item)} de {senderText(item.sender)}{' '}
          desaparecerá de la lista para siempre. Se borran el remitente, el
          asunto y el importe. No se podrá recuperar.
        </p>
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={onConfirm}>
            Descartar para siempre
          </button>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </ResolveDialog>
  );
}
