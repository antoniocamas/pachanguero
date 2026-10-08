import { useState } from 'react';
import type { Player, ResolveAction, UnresolvedEntry } from '../api';

const spelled = (e: UnresolvedEntry) =>
  e.field === 'host'
    ? e.line.kind === 'plain'
      ? e.line.name
      : e.line.hostName
    : e.line.kind === 'plusOne'
      ? e.line.hostName
      : e.line.name;

const REASONS: Record<UnresolvedEntry['reason'], string> = {
  unmatched: 'No encuentro a nadie con ese nombre',
  ambiguous: 'Puede ser más de una persona',
  collision: 'Ese nombre ya existe',
  duplicate: 'Ya hay uno en la lista con otro anfitrión: ¿es otra persona?',
  correction: 'Corregir quién es',
};

/** Who the entry's name could be: the players it matched, or anyone. */
const optionsFor = <P,>(entry: UnresolvedEntry, everyone: P[]) =>
  entry.reason === 'ambiguous' || entry.reason === 'collision'
    ? entry.candidates
    : everyone;

/** A second person with a known name needs a different one: "Javi de Caro". */
const suggestedName = (entry: UnresolvedEntry, text: string) =>
  entry.reason === 'duplicate' && entry.line.kind === 'hostAnnotated'
    ? `${text} de ${entry.line.hostName}`
    : text;

/**
 * One unresolved name and the ways to settle it: pick the player it is,
 * optionally remembering the spelling as an alias, or register someone new.
 * It knows nothing about which list it came from.
 */
export function ResolveLine({
  entry,
  players,
  busy,
  allowRegister = true,
  onResolve,
}: {
  entry: UnresolvedEntry;
  players: Pick<Player, 'id' | 'name'>[];
  busy: boolean;
  /** Whether a name can be settled by registering a new player. */
  allowRegister?: boolean;
  onResolve: (action: ResolveAction) => void;
}) {
  const text = spelled(entry);
  const options = optionsFor(entry, players);
  const [playerId, setPlayerId] = useState<number | ''>(
    entry.candidates.length === 1 && entry.reason !== 'duplicate'
      ? entry.candidates[0].id
      : ''
  );
  const [newName, setNewName] = useState(suggestedName(entry, text));
  const [hostId, setHostId] = useState<number | ''>('');

  return (
    <div className="resolve" data-testid="unresolved-line">
      <div>
        <b>{text}</b>{' '}
        <span className="muted">
          {entry.field === 'host' ? '(quien lo trae) · ' : ''}
          {REASONS[entry.reason]}
        </span>
      </div>
      <div className="actions">
        <select
          aria-label={`Quién es ${text}`}
          value={playerId}
          onChange={e =>
            setPlayerId(e.target.value ? Number(e.target.value) : '')
          }
        >
          <option value="">Elegir jugador…</option>
          {options.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          disabled={busy || playerId === ''}
          onClick={() =>
            playerId !== '' && onResolve({ type: 'link', playerId })
          }
        >
          Es este
        </button>
        <button
          className="btn"
          disabled={busy || playerId === ''}
          onClick={() =>
            playerId !== '' && onResolve({ type: 'linkAsAlias', playerId })
          }
        >
          Es este y recordar apodo
        </button>
      </div>
      {allowRegister && (
        <div className="actions">
          <input
            aria-label={`Nombre nuevo para ${text}`}
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <select
            aria-label="Lo trae"
            value={hostId}
            onChange={e =>
              setHostId(e.target.value ? Number(e.target.value) : '')
            }
          >
            <option value="">Lo trae…</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="btn primary"
            disabled={busy || !newName.trim()}
            onClick={() =>
              onResolve({
                type: 'register',
                name: newName.trim(),
                ...(hostId !== '' ? { introducedBy: hostId } : {}),
              })
            }
          >
            Registrar nuevo
          </button>
        </div>
      )}
    </div>
  );
}
