import { useState } from 'react';
import type { BankPanel } from '../api';
import type { ReadNowState } from '../hooks/useReadNow';
import { missingText, reasonText, setupProblemText } from '../lib/bankMessages';
import {
  accountLabel,
  bankName,
  connectionButtons,
  expiryText,
  lastReadText,
  stateLabel,
} from '../lib/bankPanel';
import { ReadNowButton } from './ReadNowButton';
import { ResolveDialog } from './ResolveDialog';

/** The connection: its state and end, what is read and when, and the buttons that change it. */
export function BankConnectionCard({
  panel,
  busy,
  read,
  onRead,
  onConnect,
  onDisconnect,
}: {
  panel: BankPanel;
  busy: boolean;
  read: ReadNowState;
  onRead: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const bank = bankName(panel) ?? 'el banco';
  const { connection } = panel;
  const buttons = connectionButtons(panel);
  const account = panel.accounts.find(a => a.chosen);
  const reason =
    connection?.state === 'reconnect_needed'
      ? reasonText(connection.reason, bank)
      : null;

  return (
    <div className="card" data-testid="bank-connection">
      <h2>
        Banco<span className="right">{stateLabel(panel)}</span>
      </h2>
      <div className="bank-body">
        {connection === null ? (
          <p>
            Pachanguero leerá los Bizums que entran en tu cuenta de {bank} y los
            asignará a las deudas de cada jugador. Solo lectura: nunca mueve ni
            paga dinero. La conexión dura hasta 180 días y se renueva aquí.
          </p>
        ) : connection.state === 'connected' ? (
          <>
            <div className="row">
              <span className="name">Caduca</span>
              <span>
                {expiryText(connection.validUntil, connection.daysLeft)}
              </span>
            </div>
            {account && (
              <div className="row">
                <span className="name">Cuenta</span>
                <span>{accountLabel(account)}</span>
              </div>
            )}
          </>
        ) : (
          <p>
            La conexión con el banco ya no es válida
            {reason === null ? '' : `: ${reason}`}. Los pagos a mano siguen
            funcionando.
          </p>
        )}
        {panel.lastRead !== null && (
          <div className="row">
            <span className="name">Última lectura</span>
            <span data-testid="last-read">
              {lastReadText(panel.lastRead, new Date())}
            </span>
          </div>
        )}
        {panel.setup.map(problem => (
          <p className="err" key={`${problem.code}-${problem.setting}`}>
            {setupProblemText(problem)}
          </p>
        ))}
        {connection?.state === 'connected' &&
          panel.readiness.missing.length > 0 && (
            <p className="muted">
              {missingText(panel.readiness.missing).join(' ')}
            </p>
          )}
        <div className="actions">
          {buttons.connect && (
            <button
              className="btn primary"
              disabled={busy || buttons.connect.disabled}
              onClick={onConnect}
            >
              {buttons.connect.label}
            </button>
          )}
          {buttons.renew && (
            <button
              className={`btn${buttons.renew.primary ? ' primary' : ''}`}
              disabled={busy}
              onClick={onConnect}
            >
              Renovar
            </button>
          )}
          {panel.readiness.ready && (
            <ReadNowButton state={read} onRead={onRead} />
          )}
          {buttons.disconnect && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Desconectar
            </button>
          )}
        </div>
        {connection === null && (
          <p className="muted">
            Hazlo desde un ordenador y ten a mano la app del banco para aprobar.
          </p>
        )}
      </div>
      <ResolveDialog
        open={confirming}
        title="Desconectar el banco"
        onClose={() => setConfirming(false)}
      >
        <div className="dialog-body">
          <p>
            Se cerrará la conexión con {bank} y se dejarán de leer los Bizums.
            Los pagos y Bizums ya guardados no cambian.
          </p>
          <div className="actions">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onDisconnect();
              }}
            >
              Sí, desconectar
            </button>
            <button className="btn" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </div>
      </ResolveDialog>
    </div>
  );
}
