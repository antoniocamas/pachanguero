import { useState } from 'react';
import type { BankPanel, BankSettingsChange } from '../api';
import { fmtFullDate } from '../lib/dates';

/** What is read: from which day, in which currency, and from which bank. */
export function BankReadingSettings({
  panel,
  busy,
  onChange,
}: {
  panel: BankPanel;
  busy: boolean;
  onChange: (change: BankSettingsChange) => void;
}) {
  const [startDate, setStartDate] = useState(panel.startDate ?? '');
  const [currency, setCurrency] = useState(panel.currency);

  return (
    <div className="card" data-testid="bank-reading">
      <h2>Lectura</h2>
      <div className="bank-body">
        <div className="setting">
          <label>
            Se ignora todo lo anterior al
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </label>
          <button
            className="btn"
            disabled={busy || startDate === '' || startDate === panel.startDate}
            onClick={() => onChange({ startDate })}
          >
            Guardar fecha
          </button>
        </div>
        {panel.startDate !== null && (
          <p className="muted">
            Se ignora todo lo anterior al {fmtFullDate(panel.startDate)}
          </p>
        )}
        <div className="setting">
          <label>
            Moneda a leer
            <input
              value={currency}
              maxLength={3}
              onChange={e => setCurrency(e.target.value.toUpperCase())}
            />
          </label>
          <button
            className="btn"
            disabled={
              busy || currency.length !== 3 || currency === panel.currency
            }
            onClick={() => onChange({ currency })}
          >
            Guardar moneda
          </button>
        </div>
        <div className="setting">
          <label>
            Banco
            <select
              value={panel.bank.chosenId ?? ''}
              disabled={busy || !panel.bank.editable}
              onChange={e => onChange({ bankId: e.target.value })}
            >
              {panel.bank.chosenId === null && <option value="">—</option>}
              {panel.bank.options.map(option => (
                <option key={option.id} value={option.id}>
                  {option.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!panel.bank.editable && (
          <p className="muted">Para cambiar de banco, desconecta primero.</p>
        )}
      </div>
    </div>
  );
}
