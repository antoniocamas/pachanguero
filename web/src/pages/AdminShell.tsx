import { useCallback, useEffect, useState } from 'react';
import { api, type Game, type Player, type Season } from '../api';
import { GameDay } from './GameDay';
import { Standings } from './Standings';
import { Debts } from './Debts';
import { PlayersPage } from './PlayersPage';
import { Manage, type ManageSection } from './Manage';
import { AccountPanel } from '../components/AccountPanel';
import { BankBanner } from '../components/BankBanner';
import { BankPanel } from '../components/BankPanel';
import { NewSeasonPrompt } from '../components/NewSeasonPrompt';
import { useBankBanner } from '../hooks/useBankBanner';
import { useBankReturn } from '../hooks/useBankReturn';
import type { SessionUser, SwitchView } from '../lib/sessionClient';

type Tab = 'game' | 'standings' | 'debts' | 'player' | 'manage';

export function AdminShell({
  user,
  onLogout,
  onSwitchView,
}: {
  user: SessionUser;
  onLogout: () => Promise<void>;
  onSwitchView: SwitchView;
}) {
  const returned = useBankReturn();
  const [tab, setTab] = useState<Tab>(returned === null ? 'game' : 'manage');
  const [section, setSection] = useState<ManageSection>(
    returned === null ? 'players' : 'bank'
  );
  const { data: banner, reload: reloadBanner } = useBankBanner();
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
          <button
            className="btn link top-action"
            title={user.username}
            onClick={() => void onLogout()}
          >
            Salir
          </button>
        </h1>
      </header>

      <BankBanner
        banner={banner}
        onOpen={() => {
          setSection('bank');
          setTab('manage');
        }}
      />

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
      ) : tab === 'debts' ? (
        <Debts canRead={banner?.canRead ?? false} />
      ) : tab === 'player' ? (
        <PlayersPage season={season} />
      ) : (
        <Manage
          season={season}
          seasons={seasons}
          players={players}
          onChanged={refresh}
          onSelectSeason={setSeason}
          section={section}
          onSection={setSection}
          bank={<BankPanel returned={returned} onChanged={reloadBanner} />}
          account={
            <AccountPanel
              user={user}
              onLogout={onLogout}
              onSwitchView={onSwitchView}
            />
          }
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
        <button aria-current={tab === 'debts'} onClick={() => setTab('debts')}>
          <span className="ico" aria-hidden>
            💸
          </span>
          Deudas
        </button>
        <button
          aria-current={tab === 'player'}
          onClick={() => setTab('player')}
        >
          <span className="ico" aria-hidden>
            👤
          </span>
          Jugadores
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
