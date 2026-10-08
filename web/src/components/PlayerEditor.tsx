import { useState } from 'react';
import type { PlayerDetail } from '../api';

/**
 * One player's data, open for correction: principal name, aliases, who
 * introduced them and, when enrolled this season, their seasons of seniority.
 */
export function PlayerEditor({
  player,
  everyone,
  seasons,
  onRename,
  onIntroduce,
  onAddAlias,
  onRemoveAlias,
  onSeasons,
  onMerge,
}: {
  player: PlayerDetail;
  everyone: Pick<PlayerDetail, 'id' | 'name'>[];
  /** Seasons of seniority this season; null when not enrolled. */
  seasons: number | null;
  onRename: (name: string, keepOldAsAlias: boolean) => Promise<boolean>;
  onIntroduce: (by: number | null) => void;
  onAddAlias: (alias: string) => Promise<boolean>;
  onRemoveAlias: (alias: string) => void;
  onSeasons: (seasons: number) => void;
  /** Folds another player into this one; false when refused. */
  onMerge: (fromId: number) => Promise<boolean>;
}) {
  const [name, setName] = useState(player.name);
  const [keepOld, setKeepOld] = useState(true);
  const [alias, setAlias] = useState('');
  const [absorb, setAbsorb] = useState<number | ''>('');

  return (
    <div className="resolve" data-testid="player-editor">
      <div className="actions">
        <input
          aria-label={`Nombre principal de ${player.name}`}
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <label className="muted">
          <input
            type="checkbox"
            checked={keepOld}
            onChange={e => setKeepOld(e.target.checked)}
          />{' '}
          guardar el anterior como apodo
        </label>
        <button
          className="btn primary"
          disabled={!name.trim() || name.trim() === player.name}
          onClick={() => onRename(name.trim(), keepOld)}
        >
          Cambiar nombre
        </button>
      </div>
      <div className="actions">
        {player.aliases.length === 0 && (
          <span className="muted">Sin apodos</span>
        )}
        {player.aliases.map(a => (
          <span key={a} className="tag">
            {a}{' '}
            <button
              className="btn"
              aria-label={`Quitar apodo ${a}`}
              onClick={() => onRemoveAlias(a)}
            >
              ✕
            </button>{' '}
            <button
              className="btn"
              aria-label={`Hacer ${a} el nombre principal`}
              title="Hacer nombre principal"
              onClick={() => onRename(a, true)}
            >
              ★
            </button>
          </span>
        ))}
      </div>
      <div className="actions">
        <input
          aria-label={`Nuevo apodo de ${player.name}`}
          placeholder="Nuevo apodo"
          value={alias}
          onChange={e => setAlias(e.target.value)}
        />
        <button
          className="btn"
          disabled={!alias.trim()}
          onClick={async () => {
            if (await onAddAlias(alias.trim())) setAlias('');
          }}
        >
          Añadir apodo
        </button>
      </div>
      <div className="actions">
        <select
          aria-label={`Quién trajo a ${player.name}`}
          value={player.introducedBy ?? ''}
          onChange={e =>
            onIntroduce(e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">Lo trajo… (nadie)</option>
          {everyone
            .filter(p => p.id !== player.id)
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        {seasons !== null && (
          <label className="muted">
            Temporadas de antigüedad{' '}
            <input
              type="number"
              min={1}
              style={{ width: 72 }}
              defaultValue={seasons}
              aria-label={`Temporadas de ${player.name}`}
              onBlur={e => onSeasons(Number(e.target.value))}
            />
          </label>
        )}
      </div>
      <div className="actions">
        <select
          aria-label={`Fundir con ${player.name}`}
          value={absorb}
          onChange={e =>
            setAbsorb(e.target.value ? Number(e.target.value) : '')
          }
        >
          <option value="">Es la misma persona que…</option>
          {everyone
            .filter(p => p.id !== player.id)
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <button
          className="btn"
          disabled={absorb === ''}
          onClick={() => {
            const other = everyone.find(p => p.id === absorb);
            if (
              other &&
              window.confirm(
                `¿Fundir a ${other.name} en ${player.name}? Sus partidos, pagos y apodos pasan a ${player.name}, y ${other.name} deja de existir como jugador.`
              )
            ) {
              onMerge(other.id);
            }
          }}
        >
          Fundir
        </button>
      </div>
    </div>
  );
}
