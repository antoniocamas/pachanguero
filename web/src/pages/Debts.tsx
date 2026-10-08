import { useMemo, useState } from 'react';
import { PaymentCell } from '../components/PaymentCell';
import { useCopy } from '../hooks/useCopy';
import { useDebtPayments } from '../hooks/useDebtPayments';
import { useDebts } from '../hooks/useDebts';
import {
  filterShares,
  forWhom,
  gameName,
  gamesOwed,
  groupByDebtor,
  peopleOwing,
  totalCents,
  whatsappText,
} from '../lib/debtReport';
import { debtsOfGame, namesOf, rowOf } from '../lib/debtRows';
import { euros } from '../lib/money';
import { paymentCell } from '../lib/paymentCell';

/** Who still owes what, for which games; filterable and ready for WhatsApp. */
export function Debts() {
  const { shares, error, reload } = useDebts();
  const [alert, setAlert] = useState<string | null>(null);
  const payments = useDebtPayments(reload, setAlert);
  const names = useMemo(() => namesOf(shares), [shares]);
  const { copied, copy } = useCopy();
  const [gameId, setGameId] = useState<number | null>(null);
  const [holderId, setHolderId] = useState<number | null>(null);

  const shown = useMemo(
    () => filterShares(shares, { gameId, holderId }),
    [shares, gameId, holderId]
  );
  const debtors = useMemo(() => groupByDebtor(shown), [shown]);
  const games = useMemo(() => gamesOwed(shares), [shares]);
  const people = useMemo(() => peopleOwing(shares), [shares]);
  const filtered = gameId !== null || holderId !== null;

  const pick = (set: (id: number | null) => void) => (value: string) =>
    set(value ? Number(value) : null);

  return (
    <>
      {(alert ?? error) && <div className="err">{alert ?? error}</div>}

      <div className="card" data-testid="debts-filters">
        <h2>
          Deudas
          <span
            className="right"
            style={{ color: 'var(--danger)' }}
            data-testid="debts-total"
          >
            {euros(totalCents(shown))}
          </span>
        </h2>
        <div className="debt-filters">
          <select
            className="sel"
            aria-label="Filtrar por partido"
            value={gameId ?? ''}
            onChange={e => pick(setGameId)(e.target.value)}
          >
            <option value="">Todos los partidos</option>
            {games.map(g => (
              <option key={g.gameId} value={g.gameId}>
                {g.label}
              </option>
            ))}
          </select>
          <select
            className="sel"
            aria-label="Filtrar por persona"
            value={holderId ?? ''}
            onChange={e => pick(setHolderId)(e.target.value)}
          >
            <option value="">Todas las personas</option>
            {people.map(p => (
              <option key={p.holderId} value={p.holderId}>
                {p.name}
              </option>
            ))}
          </select>
          {filtered && (
            <button
              className="btn link"
              onClick={() => {
                setGameId(null);
                setHolderId(null);
              }}
            >
              Quitar filtros
            </button>
          )}
          <span className="sp" />
          <button
            className="btn"
            disabled={shown.length === 0}
            onClick={() => void copy(whatsappText(shown))}
          >
            {copied ? '✓ Copiado' : 'Copiar para WhatsApp'}
          </button>
        </div>
      </div>

      {debtors.length === 0 ? (
        <div className="card">
          <div className="empty">
            {shares.length === 0
              ? 'Nadie debe nada. 🎉'
              : 'Ninguna deuda con estos filtros.'}
          </div>
        </div>
      ) : (
        debtors.map(d => (
          <div className="card" key={d.holderId} data-testid="debtor">
            <h2>
              {d.name}
              <span className="right" style={{ color: 'var(--danger)' }}>
                {euros(d.totalCents)}
              </span>
            </h2>
            {d.shares.map(s => (
              <div className="row debtor-line" key={s.id}>
                <span className="name">
                  {gameName(s)}
                  {forWhom(s) && <span className="muted"> · {forWhom(s)}</span>}
                </span>
                <span className="tag debt">{euros(s.amountCents)}</span>
                <PaymentCell
                  parts={paymentCell(
                    rowOf(s),
                    debtsOfGame(shares, s.gameId),
                    [],
                    names
                  )}
                  busy={payments.busy}
                  onPay={(shared, payerId, cents) =>
                    void payments.pay(s.gameId, shared, payerId, cents)
                  }
                  onUndo={() => undefined}
                />
              </div>
            ))}
          </div>
        ))
      )}
    </>
  );
}
