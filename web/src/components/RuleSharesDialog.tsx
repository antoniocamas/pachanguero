import { useState } from 'react';
import type { Player, RestOfBizum, WaitingBizum } from '../api';
import { useOpenShares } from '../hooks/useOpenShares';
import {
  defaultShares,
  maxShares,
  rulingPreview,
  sharesLabel,
} from '../lib/rulingPreview';
import { defaultPlayerId } from '../lib/waitingBizums';
import { BizumFacts } from './BizumFacts';
import { PlayerSelect } from './PlayerSelect';
import { ResolveDialog } from './ResolveDialog';

/** The organiser's ruling: this Bizum pays this many of a player's shares, whatever its amount. */
export function RuleSharesDialog({
  item,
  open,
  players,
  busy,
  onRule,
  onClose,
}: {
  item: WaitingBizum;
  open: boolean;
  players: Pick<Player, 'id' | 'name'>[];
  busy: boolean;
  onRule: (playerId: number, shares: number, rest: RestOfBizum) => void;
  onClose: () => void;
}) {
  return (
    <ResolveDialog open={open} title="Pagar cuotas" onClose={onClose}>
      <RuleBody
        item={item}
        players={players}
        busy={busy}
        onRule={onRule}
        onClose={onClose}
      />
    </ResolveDialog>
  );
}

function RuleBody({
  item,
  players,
  busy,
  onRule,
  onClose,
}: Omit<Parameters<typeof RuleSharesDialog>[0], 'open'>) {
  const [playerId, setPlayerId] = useState(defaultPlayerId(item));
  const [wanted, setWanted] = useState<number | null>(null);
  const [rest, setRest] = useState<RestOfBizum>('keep');
  const { data: open, error } = useOpenShares(item.id, playerId);
  const shares = open ?? [];
  const most = maxShares(shares, item.amountCents);
  const asked =
    item.reason.code === 'not_enough_debts' ? item.reason.shares : null;
  const count =
    wanted === null
      ? defaultShares(asked, shares, item.amountCents)
      : Math.min(Math.max(wanted, 1), Math.max(most, 1));
  const preview = rulingPreview(shares, item.amountCents, count);

  return (
    <div className="dialog-body">
      <BizumFacts item={item} />
      <PlayerSelect
        item={item}
        players={players}
        value={playerId}
        label="Jugador"
        onChange={id => {
          setPlayerId(id);
          setWanted(null);
        }}
      />
      {error && <p className="err">{error}</p>}
      {playerId !== null && open !== null && most === 0 && (
        <p className="muted">
          Ese jugador no tiene cuotas abiertas que el Bizum cubra en su
          temporada.
        </p>
      )}
      {most > 0 && (
        <>
          <label className="field">
            Cuotas que paga
            <select
              className="sel"
              value={count}
              onChange={e => setWanted(Number(e.target.value))}
            >
              {Array.from({ length: most }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>
                  {sharesLabel(shares, n)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">{preview.text}</p>
          {preview.restCents > 0 && (
            <fieldset className="field">
              <legend>El resto del Bizum</legend>
              <label>
                <input
                  type="radio"
                  name="rest"
                  checked={rest === 'keep'}
                  onChange={() => setRest('keep')}
                />{' '}
                Dejarlo sin asignar, para próximos partidos
              </label>
              <label>
                <input
                  type="radio"
                  name="rest"
                  checked={rest === 'dismiss'}
                  onChange={() => setRest('dismiss')}
                />{' '}
                Descartarlo
              </label>
            </fieldset>
          )}
        </>
      )}
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy || playerId === null || most === 0}
          onClick={() => {
            if (playerId !== null)
              onRule(playerId, count, preview.restCents > 0 ? rest : 'keep');
          }}
        >
          {count === 1 ? 'Pagar 1 cuota' : `Pagar ${count} cuotas`}
        </button>
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
