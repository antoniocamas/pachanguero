import { useState } from 'react';
import type { Player, WaitingBizum } from '../api';
import { useOpenShares } from '../hooks/useOpenShares';
import { centsOf, shareRows, sharesAfterToggle } from '../lib/rulingPreview';

/** Another player the Bizum pays for, with how many of their own shares and what they cost. */
export interface OtherPick {
  playerId: number;
  name: string;
  count: number;
  cents: number;
}

/** One other player's own open shares, ticked in order up to what the money left covers. */
function OtherShares({
  item,
  pick,
  budgetCents,
  onChange,
  onRemove,
}: {
  item: WaitingBizum;
  pick: OtherPick;
  /** What the Bizum has left for this player once the others are paid. */
  budgetCents: number;
  onChange: (pick: OtherPick) => void;
  onRemove: () => void;
}) {
  const { data, error } = useOpenShares(item.id, pick.playerId, true);
  const open = data ?? [];
  const rows = shareRows(open, budgetCents, pick.count);
  return (
    <fieldset className="field" data-testid="pay-for-other">
      <legend>
        {pick.name}{' '}
        <button
          type="button"
          className="btn link"
          aria-label={`No paga por ${pick.name}`}
          onClick={onRemove}
        >
          Quitar
        </button>
      </legend>
      {error && <p className="err">{error}</p>}
      {data !== null && open.length === 0 && (
        <p className="muted">No tiene cuotas abiertas en esa temporada.</p>
      )}
      {rows.map((row, i) => (
        <label className="choice" key={row.share.debtId}>
          <input
            type="checkbox"
            checked={row.checked}
            disabled={!row.payable && !row.checked}
            onChange={e => {
              const count = sharesAfterToggle(pick.count, i, e.target.checked);
              onChange({ ...pick, count, cents: centsOf(open, count) });
            }}
          />
          {row.text}
          {!row.payable && !row.checked && ' · el Bizum no lo cubre'}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Other players the Bizum also pays for, occasionally: a player who sends one Bizum for a friend
 * or several. Each pays only their own shares, in order.
 */
export function PayForOthers({
  item,
  players,
  excluded,
  picks,
  freeCents,
  onChange,
}: {
  item: WaitingBizum;
  players: Pick<Player, 'id' | 'name'>[];
  /** The sender, who cannot also be another. */
  excluded: number | null;
  picks: OtherPick[];
  /** What the Bizum has left once the sender's own shares are paid. */
  freeCents: number;
  onChange: (picks: OtherPick[]) => void;
}) {
  const [adding, setAdding] = useState<number | ''>('');
  const others = players.filter(
    p => p.id !== excluded && !picks.some(o => o.playerId === p.id)
  );
  const spentByOthers = (except: number) =>
    picks.reduce((sum, o) => (o.playerId === except ? sum : sum + o.cents), 0);

  return (
    <div className="pay-for-others">
      {picks.map(pick => (
        <OtherShares
          key={pick.playerId}
          item={item}
          pick={pick}
          budgetCents={freeCents - spentByOthers(pick.playerId)}
          onChange={next =>
            onChange(picks.map(o => (o.playerId === next.playerId ? next : o)))
          }
          onRemove={() =>
            onChange(picks.filter(o => o.playerId !== pick.playerId))
          }
        />
      ))}
      <div className="actions">
        <select
          className="sel"
          aria-label="Paga también por"
          value={adding}
          onChange={e =>
            setAdding(e.target.value ? Number(e.target.value) : '')
          }
        >
          <option value="">Paga también por…</option>
          {others.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={adding === ''}
          onClick={() => {
            const player = players.find(p => p.id === adding);
            if (!player) return;
            onChange([
              ...picks,
              { playerId: player.id, name: player.name, count: 0, cents: 0 },
            ]);
            setAdding('');
          }}
        >
          Añadir
        </button>
      </div>
    </div>
  );
}
