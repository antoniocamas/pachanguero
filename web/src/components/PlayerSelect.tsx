import type { Player, WaitingBizum } from '../api';
import { playerChoices } from '../lib/waitingBizums';

/** The players to choose from for a Bizum: the ones suggested for its sender first, then everyone. */
export function PlayerSelect({
  item,
  players,
  value,
  label,
  onChange,
}: {
  item: WaitingBizum;
  players: Pick<Player, 'id' | 'name'>[];
  value: number | null;
  label: string;
  onChange: (playerId: number | null) => void;
}) {
  const { suggested, others } = playerChoices(item, players);
  const option = (p: Pick<Player, 'id' | 'name'>) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  );
  return (
    <label className="field">
      {label}
      <select
        className="sel"
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Elige un jugador…</option>
        {suggested.length > 0 && (
          <optgroup label="Sugeridos">{suggested.map(option)}</optgroup>
        )}
        <optgroup label="Todos">{others.map(option)}</optgroup>
      </select>
    </label>
  );
}
