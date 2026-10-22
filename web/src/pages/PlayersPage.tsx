import { useState } from 'react';
import type { Season } from '../api';
import { PlayerDirectoryTable } from '../components/PlayerDirectoryTable';
import {
  PlayersViewTabs,
  type PlayersView,
} from '../components/PlayersViewTabs';
import { usePlayerDirectory } from '../hooks/usePlayerDirectory';
import { PlayerReportPage } from './PlayerReportPage';

/**
 * Looking at the players: one player's statistics, or all of them in a table to filter and sort
 * by any column; a row of the table opens that player's statistics. Changing a player is done in
 * Ajustes.
 */
export function PlayersPage({ season }: { season: Season }) {
  const [view, setView] = useState<PlayersView>('stats');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const directory = usePlayerDirectory(season.id, view);

  return (
    <>
      <PlayersViewTabs view={view} onSelect={setView} />
      {view === 'stats' ? (
        <PlayerReportPage playerId={playerId} onPlayer={setPlayerId} />
      ) : (
        <div className="card">
          <h2>
            Jugadores
            <span className="right muted">{directory.rows.length}</span>
          </h2>
          {directory.error && <div className="err">{directory.error}</div>}
          {directory.loaded && (
            <PlayerDirectoryTable
              rows={directory.rows}
              onOpen={id => {
                setPlayerId(id);
                setView('stats');
              }}
            />
          )}
        </div>
      )}
    </>
  );
}
