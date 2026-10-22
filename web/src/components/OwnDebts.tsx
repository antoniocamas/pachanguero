import type { OwnDebts as OwnDebtsData } from '../api';
import { debtLines, heldLines, type MoneyLine } from '../lib/ownDebts';
import { euros } from '../lib/money';

function Lines({ lines }: { lines: MoneyLine[] }) {
  return (
    <>
      {lines.map(l => (
        <div className="row wrap" key={l.key}>
          <span className="name">
            {l.date}
            {l.label && <small>{l.label}</small>}
          </span>
          {l.tag && <span className="tag">{l.tag}</span>}
          <span className="amount">{l.amount}</span>
        </div>
      ))}
    </>
  );
}

/** What the player owes, and what a host pays for them. */
export function OwnDebts({ debts }: { debts: OwnDebtsData }) {
  const mine = debtLines(debts.mine);
  const held = heldLines(debts.heldByHost);

  return (
    <>
      {mine.length === 0 ? (
        <div className="card">
          <div className="empty">
            <span className="big" aria-hidden>
              ✅
            </span>
            Estás al día.
            <br />
            <b style={{ color: 'var(--text)' }}>{euros(0)}</b>
          </div>
        </div>
      ) : (
        <div className="card" data-testid="own-debts">
          <h2>
            Debes<span className="right">{euros(debts.owedCents)}</span>
          </h2>
          <Lines lines={mine} />
          <div className="row total">
            <span className="name">Total que debes</span>
            <span className="amount">{euros(debts.owedCents)}</span>
          </div>
          <p className="note">
            Incluye lo que debes por tus invitados y por quien pagas.
          </p>
        </div>
      )}
      {held.length > 0 && (
        <div className="card" data-testid="own-held">
          <h2>Pagan otros por ti</h2>
          <Lines lines={held} />
          <p className="note">
            Estos importes no suman en tu total: se los debes a quien los paga,
            no a la organización.
          </p>
        </div>
      )}
    </>
  );
}
