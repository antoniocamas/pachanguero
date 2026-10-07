import { useCallback, useEffect, useState } from 'react';
import { api, type Game, type Player, type Season } from './api';
import { GameDay } from './pages/GameDay';
import { Standings } from './pages/Standings';
import { Manage } from './pages/Manage';
import { NewSeasonPrompt } from './components/NewSeasonPrompt';

type Tab = 'game' | 'standings' | 'manage';

export function App() {
  const [tab, setTab] = useState<Tab>('game');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [missingSeason, setMissingSeason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSeasons = useCallback(async () => {
    try {
      const [all, current, missing] = await Promise.all([
        api.seasons(),
        api.currentSeason(),
        api.missingSeason(),
      ]);
      setSeasons(all);
      setMissingSeason(missing?.name ?? null);
      // Keep the season being looked at; otherwise today's, else the latest.
      setSeason(
        prev => all.find(s => s.id === prev?.id) ?? current ?? all[0] ?? null
      );
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
    <div className={`app${tab === 'game' ? ' wide' : ''}`}>
      <header className="top">
        <h1>
          <span aria-hidden>⚽</span> Pachanguero
          <span className="season">{season?.name ?? '—'}</span>
        </h1>
      </header>

      {error && <div className="err">{error}</div>}

      {missingSeason && (
        <NewSeasonPrompt
          name={missingSeason}
          onCreated={async () => {
            // Move to the season just created, not the one being looked at.
            const created = (await api.currentSeason()) ?? null;
            await refresh();
            if (created) setSeason(created);
          }}
        />
      )}

      {!season ? (
        missingSeason ? null : (
          <div className="card">
            <div className="empty">No hay temporadas.</div>
          </div>
        )
      ) : tab === 'game' ? (
        <GameDay
          season={season}
          players={players}
          games={games}
          onGamesChanged={loadSeasonData}
          onSelectSeason={seasonId =>
            setSeason(prev => seasons.find(s => s.id === seasonId) ?? prev)
          }
        />
      ) : tab === 'standings' ? (
        <Standings season={season} />
      ) : (
        <Manage
          season={season}
          seasons={seasons}
          players={players}
          onChanged={refresh}
          onSelectSeason={setSeason}
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
