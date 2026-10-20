import type { BankPanel } from '../api';
import { accountLabel, accountsToChoose } from '../lib/bankPanel';

/** Which account is read: the ones in the chosen currency, or why there is none to choose. */
export function BankAccountChoice({
  panel,
  busy,
  onChoose,
}: {
  panel: BankPanel;
  busy: boolean;
  onChoose: (stableId: string) => void;
}) {
  if (panel.connection === null) return null;
  const options = accountsToChoose(panel);

  if (panel.selection.kind === 'none_in_currency') {
    return (
      <div className="card" data-testid="bank-accounts">
        <h2>Cuenta</h2>
        <div className="bank-body">
          <p>
            No hay ninguna cuenta en {panel.currency}. Cambia la moneda a leer.
          </p>
        </div>
      </div>
    );
  }
  if (options.length < 2) return null;
  return (
    <div className="card" data-testid="bank-accounts">
      <h2>Cuenta</h2>
      <div className="bank-body">
        <p>
          {panel.selection.kind === 'choose'
            ? `Moneda a leer: ${panel.currency}. Hay dos cuentas en esa moneda. Elige cuál leer:`
            : 'Cuenta que se lee:'}
        </p>
        {options.map(account => (
          <label className="choice" key={account.stableId}>
            <input
              type="radio"
              name="bank-account"
              checked={account.chosen}
              disabled={busy}
              onChange={() => onChoose(account.stableId)}
            />
            {accountLabel(account)}
          </label>
        ))}
        <p className="muted">
          Solo se leen los movimientos de la cuenta elegida.
        </p>
      </div>
    </div>
  );
}
