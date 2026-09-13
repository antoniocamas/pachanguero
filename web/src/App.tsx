import { useCallback, useEffect, useState } from 'react';
import { api, type Game, type Player, type Season } from './api';
import { GameDay } from './pages/GameDay';
import { Standings } from './pages/Standings';
import { Manage } from './pages/Manage';

type Tab = 'game' | 'standings' | 'manage';

export function App() {
  const [tab, setTab] = useState<Tab>('game');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSeasons = useCallback(async () => {
    try {
      const all = await api.seasons();
      setSeasons(all);
      setSeason(all.find(s => s.is_active) ?? all[0] ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadSeasonData = useCallback(async () => {
    if (!season) return;
    try {
      const [p, g] = await Promise.all([
        api.players(season.id),
        api.games(season.id),
      ]);
      setPlayers(p);
      setGames(g);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [season]);

  useEffect(() => {
    void (async () => {
      await loadSeasons();
    })();
  }, [loadSeasons]);
  useEffect(() => {
    void (async () => {
      await loadSeasonData();
    })();
  }, [loadSeasonData]);

  const refresh = useCallback(async () => {
    await loadSeasons();
    await loadSeasonData();
  }, [loadSeasons, loadSeasonData]);

  return (
    <div className="app">
      <header className="top">
        <h1>
          <span aria-hidden>⚽</span> Pachanguero
          <span className="season">{season?.name ?? '—'}</span>
        </h1>
      </header>

      {error && <div className="err">{error}</div>}

      {!season ? (
        <div className="card">
          <div className="empty">
            No hay temporadas.
            <div style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                onClick={async () => {
                  const n = prompt('Nombre de la temporada', '2025/2026');
                  if (!n) return;
                  const created = await api.createSeason({ name: n });
                  await api.activateSeason(created.id);
                  await refresh();
                }}
              >
                Crear la primera
              </button>
            </div>
          </div>
        </div>
      ) : tab === 'game' ? (
        <GameDay
          season={season}
          players={players}
          games={games}
          onGamesChanged={loadSeasonData}
        />
      ) : tab === 'standings' ? (
        <Standings season={season} />
      ) : (
        <Manage
          season={season}
          seasons={seasons}
          players={players}
          onChanged={refresh}
        />
      )}

      <nav className="tabs">
        <button aria-current={tab === 'game'} onClick={() => setTab('game')}>
          <span className="ico" aria-hidden>
            📋
          </span>
          Partido
        </button>
        <button
          aria-current={tab === 'standings'}
          onClick={() => setTab('standings')}
        >
          <span className="ico" aria-hidden>
            🏆
          </span>
          Puntos
        </button>
        <button
          aria-current={tab === 'manage'}
          onClick={() => setTab('manage')}
        >
          <span className="ico" aria-hidden>
            ⚙️
          </span>
          Ajustes
        </button>
      </nav>
    </div>
  );
}
