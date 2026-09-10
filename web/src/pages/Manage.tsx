import { useState } from 'react';
import { api, type Player, type Season } from '../api';

/** Players and season rules. Not the everyday screen — set up and forget. */
export function Manage({
  season,
  seasons,
  players,
  onChanged,
}: {
  season: Season;
  seasons: Season[];
  players: Player[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [seniority, setSeniority] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onChanged();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h2>Temporada</h2>
        <div style={{ padding: '12px 14px' }}>
          <label className="field">
            <span>Activa</span>
            <select
              value={season.id}
              onChange={(e) => guard(() => api.activateSeason(Number(e.target.value)))}
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <button
            className="btn wide"
            onClick={() => {
              const n = prompt('Nombre de la temporada', '2025/2026');
              if (n) guard(async () => {
                const created = await api.createSeason({ name: n });
                await api.activateSeason(created.id);
              });
            }}
          >
            + Nueva temporada
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Reglas</h2>
        <div style={{ padding: '12px 14px' }}>
          <label className="field">
            <span>Plazas (7 vs 7 = 14)</span>
            <input
              type="number"
              defaultValue={season.slots}
              onBlur={(e) => guard(() => api.updateSeason(season.id, { slots: Number(e.target.value) }))}
            />
          </label>
          <label className="field">
            <span>Mercy seats</span>
            <input
              type="number"
              defaultValue={season.mercy_seats}
              onBlur={(e) => guard(() => api.updateSeason(season.id, { mercy_seats: Number(e.target.value) }))}
            />
          </label>
          <label className="field">
            <span>Partidos fuera para optar a mercy</span>
            <input
              type="number"
              defaultValue={season.games_out_for_mercy}
              onBlur={(e) =>
                guard(() => api.updateSeason(season.id, { games_out_for_mercy: Number(e.target.value) }))
              }
            />
          </label>
          <label className="field">
            <span>Precio de la pista (céntimos)</span>
            <input
              type="number"
              defaultValue={season.price_cents}
              onBlur={(e) => guard(() => api.updateSeason(season.id, { price_cents: Number(e.target.value) }))}
            />
          </label>
          <label className="field">
            <span>Degradar empezando por</span>
            <select
              defaultValue={season.demotion_direction}
              onChange={(e) =>
                guard(() =>
                  api.updateSeason(season.id, {
                    demotion_direction: e.target.value as Season['demotion_direction'],
                  }),
                )
              }
            >
              <option value="bottom-up">el último de los 14 (bottom-up)</option>
              <option value="top-down">el primero (top-down)</option>
            </select>
          </label>
          <label className="field">
            <span>Al recibir mercy seat, el contador…</span>
            <select
              defaultValue={season.mercy_resets_counter ? '1' : '0'}
              onChange={(e) =>
                guard(() =>
                  api.updateSeason(season.id, { mercy_resets_counter: Number(e.target.value) }),
                )
              }
            >
              <option value="0">resta N (como el script original)</option>
              <option value="1">se pone a cero (la regla contada)</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <h2>
          Jugones
          <span className="right muted">{players.length}</span>
        </h2>
        <div style={{ padding: '12px 14px', display: 'flex', gap: 8 }}>
          <input
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                guard(() => api.addPlayer(season.id, name.trim(), seniority));
                setName('');
              }
            }}
          />
          <input
            type="number"
            min={1}
            style={{ width: 80 }}
            value={seniority}
            title="Temporadas de antigüedad"
            onChange={(e) => setSeniority(Number(e.target.value))}
          />
          <button
            className="btn"
            disabled={!name.trim()}
            onClick={() => {
              guard(() => api.addPlayer(season.id, name.trim(), seniority));
              setName('');
            }}
          >
            +
          </button>
        </div>
        {players.map((p) => (
          <div key={p.id} className="row">
            <span className="name">{p.name}</span>
            <input
              type="number"
              min={1}
              style={{ width: 72 }}
              defaultValue={p.seasons}
              title="Temporadas"
              onBlur={(e) =>
                guard(() => api.updatePlayer(season.id, p.id, { seasons: Number(e.target.value) }))
              }
            />
          </div>
        ))}
      </div>
    </>
  );
}
