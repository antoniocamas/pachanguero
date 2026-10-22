import { useState } from 'react';
import type { DirectoryRow } from '../api';
import { fold } from '../lib/playerDirectory';

/** Every player by name, searchable by name or alias, each with its Editar. */
export function PlayersList({
  rows,
  onOpen,
}: {
  rows: Pick<DirectoryRow, 'id' | 'name' | 'aliases'>[];
  onOpen: (playerId: number) => void;
}) {
  const [search, setSearch] = useState('');
  const wanted = fold(search.trim());
  const shown = rows.filter(
    p => !wanted || [p.name, ...p.aliases].some(n => fold(n).includes(wanted))
  );
  return (
    <>
      <div style={{ padding: '0 14px 12px' }}>
        <input
          type="search"
          aria-label="Buscar jugador"
          placeholder="Buscar jugador o apodo"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {shown.length === 0 && <div className="empty">Nadie coincide.</div>}
      {shown.map(p => (
        <div key={p.id} className="row">
          <span className="name">{p.name}</span>
          {p.aliases.length > 0 && (
            <span className="muted">{p.aliases.join(', ')}</span>
          )}
          <button
            className="btn"
            aria-label={`Editar ${p.name}`}
            onClick={() => onOpen(p.id)}
          >
            Editar
          </button>
        </div>
      ))}
    </>
  );
}
