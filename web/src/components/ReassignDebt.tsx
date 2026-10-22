import { useState } from 'react';
import type { Player } from '../api';
import { ResolveDialog } from './ResolveDialog';

/**
 * Makes another player answer for one share: whoever pays for someone else, by hand or with one
 * Bizum for several. The share stays its player's; a +1's always stays with its host.
 */
export function ReassignDebt({
  shareOf,
  holderId,
  players,
  busy,
  onReassign,
}: {
  /** Whose share it is, for the dialog's title. */
  shareOf: string;
  holderId: number;
  players: Pick<Player, 'id' | 'name'>[];
  busy: boolean;
  onReassign: (holderId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<number | ''>('');

  return (
    <>
      <button
        className="btn mini"
        aria-label={`Lo paga otro: ${shareOf}`}
        title="Lo paga otro…"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        ⇄
      </button>
      <ResolveDialog
        open={open}
        title={`¿Quién paga la cuota de ${shareOf}?`}
        onClose={() => setOpen(false)}
      >
        <div className="resolve">
          <p className="muted">
            Quien elijas responde de esta cuota desde ahora: la ve en su deuda y
            un Bizum suyo puede pagarla. Para que pague siempre por alguien,
            ponlo en su ficha de Jugones.
          </p>
          <div className="actions">
            <select
              aria-label="Quién la paga"
              value={chosen}
              onChange={e =>
                setChosen(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">Lo paga…</option>
              {players
                .filter(p => p.id !== holderId)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button
              className="btn primary"
              disabled={busy || chosen === ''}
              onClick={() => {
                if (chosen === '') return;
                onReassign(chosen);
                setOpen(false);
                setChosen('');
              }}
            >
              Asignar
            </button>
          </div>
        </div>
      </ResolveDialog>
    </>
  );
}
