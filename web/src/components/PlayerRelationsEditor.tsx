import { useState } from 'react';
import type { DirectoryRow, SeasonRole } from '../api';

type Named = { id: number; name: string };

/** A select of everyone but the player, with an empty first option. */
function OthersSelect({
  label,
  empty,
  value,
  others,
  onChange,
}: {
  label: string;
  empty: string;
  value: number | '';
  others: Named[];
  onChange: (id: number | '') => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
    >
      <option value="">{empty}</option>
      {others.map(p => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

/**
 * How a player comes: their role this season (a fijo competes on points; an invitado comes
 * with a host and ranks by arrival) and the hosts who usually bring them, the usual one first.
 */
export function PlayerRelationsEditor({
  player,
  everyone,
  seasonName,
  onRole,
  onHosts,
}: {
  player: DirectoryRow;
  everyone: Named[];
  seasonName: string;
  onRole: (role: SeasonRole) => void;
  onHosts: (hostIds: number[]) => void;
}) {
  const [adding, setAdding] = useState<number | ''>('');
  const others = everyone.filter(p => p.id !== player.id);
  const nameOf = (id: number) => everyone.find(p => p.id === id)?.name ?? '?';
  const hosts = player.usualHosts;

  return (
    <div className="resolve" data-testid="player-relations">
      <div className="actions">
        <label className="muted" htmlFor={`role-${player.id}`}>
          Papel en {seasonName}
        </label>
        <select
          id={`role-${player.id}`}
          aria-label={`Papel de ${player.name}`}
          value={player.role}
          onChange={e => onRole(e.target.value as SeasonRole)}
        >
          <option value="fijo">Fijo</option>
          <option value="invitado">Invitado</option>
        </select>
        {!player.roleWritten && (
          <span className="muted">(viene de antes; aún sin decidir)</span>
        )}
      </div>
      <p className="muted hint">
        Un fijo compite por puntos y nunca es invitado. Un invitado entra por
        orden de llegada y siempre viene con alguien: el de la lista, o si no su
        anfitrión habitual; su cuota la paga quien lo trae. Quien ya ha jugado
        como fijo esta temporada no puede pasar a invitado.
      </p>

      <div className="actions">
        <span className="muted">Anfitriones habituales:</span>
        {hosts.length === 0 && <span className="muted">ninguno</span>}
        {hosts.map((id, i) => (
          <span key={id} className="tag">
            {nameOf(id)}
            {i === 0 && hosts.length > 1 ? ' (habitual)' : ''}{' '}
            {i > 0 && (
              <button
                className="btn"
                aria-label={`Hacer a ${nameOf(id)} el anfitrión habitual`}
                title="Hacer habitual"
                onClick={() => onHosts([id, ...hosts.filter(h => h !== id)])}
              >
                ★
              </button>
            )}{' '}
            <button
              className="btn"
              aria-label={`Quitar anfitrión ${nameOf(id)}`}
              onClick={() => onHosts(hosts.filter(h => h !== id))}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="actions">
        <OthersSelect
          label={`Añadir anfitrión de ${player.name}`}
          empty="Añadir anfitrión…"
          value={adding}
          others={others.filter(p => !hosts.includes(p.id))}
          onChange={setAdding}
        />
        <button
          className="btn"
          disabled={adding === ''}
          onClick={() => {
            if (adding === '') return;
            onHosts([...hosts, adding]);
            setAdding('');
          }}
        >
          Añadir
        </button>
      </div>
    </div>
  );
}
