import { useState } from 'react';
import type { Player, RestOfBizum, SharesFor, WaitingBizum } from '../api';
import { useOpenShares } from '../hooks/useOpenShares';
import {
  defaultShares,
  maxShares,
  othersText,
  rulingPreview,
  shareRows,
  sharesAfterToggle,
} from '../lib/rulingPreview';
import { euros } from '../lib/money';
import { defaultPlayerId } from '../lib/waitingBizums';
import { BizumFacts } from './BizumFacts';
import { PayForOthers, type OtherPick } from './PayForOthers';
import { PlayerSelect } from './PlayerSelect';
import { ResolveDialog } from './ResolveDialog';

/**
 * The organiser's ruling: this Bizum pays this many of a player's shares, whatever its amount, and
 * occasionally some of other players' own shares that the player pays for them.
 */
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
  onRule: (
    playerId: number,
    shares: number,
    rest: RestOfBizum,
    others: SharesFor[]
  ) => void;
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

/** What the player's own ticked shares take of the Bizum. */
const centsOfOwn = (preview: { paid: { amountCents: number }[] }) =>
  preview.paid.reduce((sum, share) => sum + share.amountCents, 0);

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
  const [others, setOthers] = useState<OtherPick[]>([]);
  const { data: open, error } = useOpenShares(item.id, playerId);
  const shares = open ?? [];
  const othersCents = others.reduce((sum, o) => sum + o.cents, 0);
  const forOwn = item.amountCents - othersCents;
  const most = maxShares(shares, forOwn);
  const asked =
    item.reason.code === 'not_enough_debts' ? item.reason.shares : null;
  const count =
    wanted === null
      ? defaultShares(asked, shares, forOwn)
      : Math.min(Math.max(wanted, 0), most);
  const preview = rulingPreview(shares, forOwn, count);
  const rows = shareRows(shares, forOwn, count);
  const othersCount = others.reduce((sum, o) => sum + o.count, 0);
  const total = count + othersCount;
  const alsoFor = othersText(others);

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
          setOthers(list => list.filter(o => o.playerId !== id));
        }}
      />
      {error && <p className="err">{error}</p>}
      {playerId !== null &&
        open !== null &&
        most === 0 &&
        others.length === 0 && (
          <p className="muted">
            Ese jugador no tiene cuotas abiertas que el Bizum cubra en su
            temporada.
          </p>
        )}
      {(most > 0 || (shares.length > 0 && othersCents > 0)) && (
        <>
          <fieldset className="field">
            <legend>Sus cuotas</legend>
            {rows.map((row, i) => (
              <label className="choice" key={row.share.debtId}>
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={!row.payable}
                  onChange={e =>
                    setWanted(sharesAfterToggle(count, i, e.target.checked))
                  }
                />
                {row.text}
                {!row.payable && ' · el Bizum no lo cubre'}
              </label>
            ))}
          </fieldset>
          <p className="muted">{preview.text}</p>
        </>
      )}
      {playerId !== null && (
        <PayForOthers
          item={item}
          players={players}
          excluded={playerId}
          picks={others}
          freeCents={item.amountCents - centsOfOwn(preview)}
          onChange={setOthers}
        />
      )}
      {alsoFor && <p className="muted">{alsoFor}</p>}
      {total > 0 && (
        <>
          {preview.restCents > 0 && (
            <fieldset className="field">
              <legend>El resto del Bizum ({euros(preview.restCents)})</legend>
              <label className="choice">
                <input
                  type="radio"
                  name="rest"
                  checked={rest === 'keep'}
                  onChange={() => setRest('keep')}
                />
                Dejarlo sin asignar, para próximos partidos
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="rest"
                  checked={rest === 'dismiss'}
                  onChange={() => setRest('dismiss')}
                />
                Descartarlo
              </label>
            </fieldset>
          )}
        </>
      )}
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy || playerId === null || total === 0}
          onClick={() => {
            if (playerId !== null)
              onRule(
                playerId,
                count,
                preview.restCents > 0 ? rest : 'keep',
                others
                  .filter(o => o.count > 0)
                  .map(o => ({ playerId: o.playerId, shares: o.count }))
              );
          }}
        >
          {total === 0
            ? 'Pagar cuotas'
            : total === 1
              ? 'Pagar 1 cuota'
              : `Pagar ${total} cuotas`}
        </button>
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
