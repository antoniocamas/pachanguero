import { useState } from 'react';
import { api, type Player, type Season } from '../api';
import { usePlayerDirectory } from '../hooks/usePlayerDirectory';
import { BizumNamesEditor } from './BizumNamesEditor';
import { PlayerContactEditor } from './PlayerContactEditor';
import { PlayerEditor } from './PlayerEditor';
import { PlayerRelationsEditor } from './PlayerRelationsEditor';
import { PlayersList } from './PlayersList';

/**
 * Every player: a searchable list, and one player at a time open for correction in a view of
 * their own, so nothing needs scrolling past.
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
  const [open, setOpen] = useState<number | null>(null);
  const directory = usePlayerDirectory(season.id, players);

  const refresh = (done: Promise<boolean>) =>
    done.then(ok => {
      if (ok) onChanged();
      return ok;
    });
  const add = () => {
    guard(() => api.addPlayer(season.id, name.trim(), seniority));
    setName('');
  };

  const chosen = directory.rows.find(p => p.id === open);
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
          everyone={directory.rows}
          seasons={chosen.seasons}
          onRename={(next, keep) =>
            refresh(directory.rename(chosen.id, next, keep))
          }
          onMerge={async from => {
            const done = await refresh(directory.merge(chosen.id, from));
            if (done) setOpen(null);
            return done;
          }}
          onDelete={async () => {
            if (await refresh(directory.remove(chosen.id))) setOpen(null);
          }}
          onIntroduce={by => directory.introduce(chosen.id, by)}
          onAddAlias={alias => directory.addAlias(chosen.id, alias)}
          onRemoveAlias={alias => directory.removeAlias(chosen.id, alias)}
          onSeasons={seasons =>
            guard(() => api.updatePlayer(season.id, chosen.id, { seasons }))
          }
        />
        <PlayerRelationsEditor
          player={chosen}
          everyone={directory.rows}
          seasonName={season.name}
          onRole={role => void refresh(directory.setRole(chosen.id, role))}
          onHosts={hosts => void refresh(directory.setHosts(chosen.id, hosts))}
        />
        <BizumNamesEditor
          playerName={chosen.name}
          names={chosen.bizumNames}
          onAdd={bizumName => directory.addBizumName(chosen.id, bizumName)}
          onRemove={bizumName =>
            void directory.removeBizumName(chosen.id, bizumName)
          }
        />
        <PlayerContactEditor
          stored={{ emails: chosen.emails, phone: chosen.phone }}
          onSave={patch => directory.saveContact(chosen.id, patch)}
        />
      </div>
    );
  }

  return (
    <div className="card">
      <h2>
        Jugones
        <span className="right muted">{directory.rows.length}</span>
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
      {directory.loaded && (
        <PlayersList rows={directory.rows} onOpen={setOpen} />
      )}
    </div>
  );
}
