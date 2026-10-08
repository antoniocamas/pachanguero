import { api, type Season } from '../api';

/** The season's rules, saved as each field is left. */
export function RulesSection({
  season,
  guard,
}: {
  season: Season;
  guard: (fn: () => Promise<unknown>) => void;
}) {
  return (
    <>
      <div className="card">
        <h2>Reglas</h2>
        <div style={{ padding: '12px 14px' }}>
          <label className="field">
            <span>Plazas (7 vs 7 = 14)</span>
            <input
              type="number"
              defaultValue={season.slots}
              onBlur={e =>
                guard(() =>
                  api.updateSeason(season.id, { slots: Number(e.target.value) })
                )
              }
            />
          </label>
          <label className="field">
            <span>Mercy seats</span>
            <input
              type="number"
              defaultValue={season.mercy_seats}
              onBlur={e =>
                guard(() =>
                  api.updateSeason(season.id, {
                    mercy_seats: Number(e.target.value),
                  })
                )
              }
            />
          </label>
          <label className="field">
            <span>Partidos fuera para optar a mercy</span>
            <input
              type="number"
              defaultValue={season.games_out_for_mercy}
              onBlur={e =>
                guard(() =>
                  api.updateSeason(season.id, {
                    games_out_for_mercy: Number(e.target.value),
                  })
                )
              }
            />
          </label>
          <label className="field">
            <span>Precio de la pista (céntimos)</span>
            <input
              type="number"
              defaultValue={season.price_cents}
              onBlur={e =>
                guard(() =>
                  api.updateSeason(season.id, {
                    price_cents: Number(e.target.value),
                  })
                )
              }
            />
          </label>
          <label className="field">
            <span>Degradar empezando por</span>
            <select
              defaultValue={season.demotion_direction}
              onChange={e =>
                guard(() =>
                  api.updateSeason(season.id, {
                    demotion_direction: e.target
                      .value as Season['demotion_direction'],
                  })
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
              onChange={e =>
                guard(() =>
                  api.updateSeason(season.id, {
                    mercy_resets_counter: Number(e.target.value),
                  })
                )
              }
            >
              <option value="0">resta N (como el script original)</option>
              <option value="1">se pone a cero (la regla contada)</option>
            </select>
          </label>
        </div>
      </div>
    </>
  );
}
