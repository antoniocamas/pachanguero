import { useState } from 'react';
import type { Pairing, Player } from '../api';

/** The names the bank shows the players under, one each, with a way to remove one or add one by hand. */
export function BizumPairingsList({
  pairings,
  players,
  busy,
  onSet,
  onClear,
}: {
  pairings: Pairing[];
  players: Pick<Player, 'id' | 'name'>[];
  busy: boolean;
  onSet: (playerId: number, bizumName: string) => void;
  onClear: (playerId: number, bizumName: string) => void;
}) {
  const [playerId, setPlayerId] = useState('');
  const [name, setName] = useState('');
  return (
    <div className="card" data-testid="bank-pairings">
      <h2>Nombres de Bizum</h2>
      <div className="bank-body">
        {pairings.length === 0 ? (
          <p className="muted">Ningún jugador tiene nombre de Bizum.</p>
        ) : (
          pairings.map(p => (
            <div className="row" key={`${p.playerId}:${p.bizumName}`}>
              <span className="name">{p.playerName}</span>
              <span>{p.bizumName}</span>
              <button
                className="btn mini"
                disabled={busy}
                aria-label={`Quitar «${p.bizumName}» de ${p.playerName}`}
                onClick={() => onClear(p.playerId, p.bizumName)}
              >
                Quitar
              </button>
            </div>
          ))
        )}
        <div className="setting">
          <select
            aria-label="Jugador"
            value={playerId}
            onChange={e => setPlayerId(e.target.value)}
          >
            <option value="">Jugador…</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Nombre de Bizum"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <button
            className="btn"
            disabled={busy || playerId === '' || name.trim() === ''}
            onClick={() => {
              onSet(Number(playerId), name);
              setName('');
            }}
          >
            Emparejar
          </button>
        </div>
      </div>
    </div>
  );
}
