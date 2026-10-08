import { useState } from 'react';
import { api, type Player, type Season } from '../api';
import { usePlayerDetails } from '../hooks/usePlayerDetails';
import { PlayerEditor } from './PlayerEditor';

const normal = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');

/**
 * Every player: a searchable list, and one player at a time open for
 * correction in a view of their own, so nothing needs scrolling past.
 */
export function PlayersSection({
  season,
  players,
  guard,
  onChanged,
}: {
  season: Season;
  /** The players enrolled in the season, with their seniority. */
  players: Player[];
  guard: (fn: () => Promise<unknown>) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [seniority, setSeniority] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const directory = usePlayerDetails(players);

  const refresh = (done: Promise<boolean>) =>
    done.then(ok => {
      if (ok) onChanged();
      return ok;
    });
  const add = () => {
    guard(() => api.addPlayer(season.id, name.trim(), seniority));
    setName('');
  };

  const chosen = directory.details.find(p => p.id === open);
  if (chosen) {
    return (
      <div className="card">
        <h2>
          <button className="btn" onClick={() => setOpen(null)}>
            ← Jugones
          </button>{' '}
          {chosen.name}
        </h2>
        {directory.error && <div className="err">{directory.error}</div>}
        <PlayerEditor
          key={chosen.name}
          player={chosen}
          everyone={directory.details}
          seasons={players.find(e => e.id === chosen.id)?.seasons ?? null}
          onRename={(next, keep) =>
            refresh(directory.rename(chosen.id, next, keep))
          }
          onMerge={async from => {
            const done = await refresh(directory.merge(chosen.id, from));
            if (done) setOpen(null);
            return done;
          }}
          onIntroduce={by => directory.introduce(chosen.id, by)}
          onAddAlias={alias => directory.addAlias(chosen.id, alias)}
          onRemoveAlias={alias => directory.removeAlias(chosen.id, alias)}
          onSeasons={seasons =>
            guard(() => api.updatePlayer(season.id, chosen.id, { seasons }))
          }
        />
      </div>
    );
  }

  const wanted = normal(search.trim());
  const shown = directory.details.filter(
    p => !wanted || [p.name, ...p.aliases].some(n => normal(n).includes(wanted))
  );
  return (
    <div className="card">
      <h2>
        Jugones
        <span className="right muted">{directory.details.length}</span>
      </h2>
      {directory.error && <div className="err">{directory.error}</div>}
      <div style={{ padding: '12px 14px', display: 'flex', gap: 8 }}>
        <input
          placeholder="Nombre"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && name.trim()) add();
          }}
        />
        <input
          type="number"
          min={1}
          style={{ width: 80 }}
          value={seniority}
          title="Temporadas de antigüedad"
          onChange={e => setSeniority(Number(e.target.value))}
        />
        <button className="btn" disabled={!name.trim()} onClick={add}>
          +
        </button>
      </div>
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
            onClick={() => setOpen(p.id)}
          >
            Editar
          </button>
        </div>
      ))}
    </div>
  );
}
