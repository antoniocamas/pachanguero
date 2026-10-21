import { useState, type ReactNode } from 'react';
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
 * One unresolved name and the ways to settle it: pick the player it is (the usual case, one
 * button), optionally remembering the spelling as an alias, or register someone new, which
 * opens only when asked. It knows nothing about which list it came from; `extra` is whatever
 * the list wants beside those ways, such as taking the name off it.
 */
export function ResolveLine({
  entry,
  players,
  busy,
  allowRegister = true,
  onResolve,
  extra,
}: {
  entry: UnresolvedEntry;
  players: Pick<Player, 'id' | 'name'>[];
  busy: boolean;
  /** Whether a name can be settled by registering a new player. */
  allowRegister?: boolean;
  onResolve: (action: ResolveAction) => void;
  extra?: ReactNode;
}) {
  const text = spelled(entry);
  const options = optionsFor(entry, players);
  const [playerId, setPlayerId] = useState<number | ''>(
    entry.candidates.length === 1 && entry.reason !== 'duplicate'
      ? entry.candidates[0].id
      : ''
  );
  const [remember, setRemember] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [newName, setNewName] = useState(suggestedName(entry, text));
  const [hostId, setHostId] = useState<number | ''>('');

  return (
    <div className="resolve" data-testid="unresolved-line">
      <div>
        <b>{text}</b>
        <div className="muted">
          {entry.field === 'host' ? '(quien lo trae) · ' : ''}
          {REASONS[entry.reason]}
        </div>
      </div>
      <div className="actions">
        <select
          aria-label={`Quién es ${text}`}
          value={playerId}
          onChange={e =>
            setPlayerId(e.target.value ? Number(e.target.value) : '')
          }
        >
          <option value="">¿Quién es?</option>
          {options.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="btn primary"
          disabled={busy || playerId === ''}
          onClick={() =>
            playerId !== '' &&
            onResolve({
              type: remember ? 'linkAsAlias' : 'link',
              playerId,
            })
          }
        >
          Es este
        </button>
      </div>
      <label className="remember">
        <input
          type="checkbox"
          checked={remember}
          onChange={e => setRemember(e.target.checked)}
        />
        Recordar como apodo
      </label>
      {(allowRegister || extra) && (
        <div className="links">
          {allowRegister && (
            <button
              className="btn link"
              aria-expanded={registering}
              onClick={() => setRegistering(r => !r)}
            >
              {registering ? '− Es un jugador nuevo' : '＋ Es un jugador nuevo'}
            </button>
          )}
          <span className="sp" />
          {extra}
        </div>
      )}
      {allowRegister && registering && (
        <div className="register">
          <input
            aria-label={`Nombre nuevo para ${text}`}
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <div className="actions">
            <select
              aria-label="Lo trae"
              value={hostId}
              onChange={e =>
                setHostId(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">Lo trae… (opcional)</option>
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
        </div>
      )}
    </div>
  );
}
