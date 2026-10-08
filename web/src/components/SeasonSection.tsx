import { api, type Season } from '../api';

/** Which season is looked at, and creating the next one. */
export function SeasonSection({
  season,
  seasons,
  guard,
  onSelectSeason,
}: {
  season: Season;
  seasons: Season[];
  guard: (fn: () => Promise<unknown>) => void;
  onSelectSeason: (season: Season) => void;
}) {
  return (
    <>
      <div className="card">
        <h2>Temporada</h2>
        <div style={{ padding: '12px 14px' }}>
          <label className="field">
            <span>Temporada</span>
            <select
              value={season.id}
              onChange={e => {
                const chosen = seasons.find(
                  s => s.id === Number(e.target.value)
                );
                if (chosen) onSelectSeason(chosen);
              }}
            >
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn wide"
            onClick={() => {
              const n = prompt('Nombre de la temporada', '2025/2026');
              if (n)
                guard(async () => {
                  onSelectSeason(await api.createSeason({ name: n }));
                });
            }}
          >
            + Nueva temporada
          </button>
        </div>
      </div>
    </>
  );
}
