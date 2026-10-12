import { useState } from 'react';
import { useKnownPlayers } from '../hooks/useKnownPlayers';
import { usePlayerReport } from '../hooks/usePlayerReport';
import { PlayerReportView } from '../components/PlayerReportView';

/** Pick a player, see every game they played and the statistics about each. */
export function PlayerReportPage() {
  const players = useKnownPlayers(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [allSeasons, setAllSeasons] = useState(false);
  const { report, error } = usePlayerReport(playerId);

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h2>Jugador</h2>
        <div className="debt-filters">
          <select
            className="sel"
            aria-label="Elegir jugador"
            value={playerId ?? ''}
            onChange={e =>
              setPlayerId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Elige un jugador…</option>
            {[...players]
              .sort((a, b) => a.name.localeCompare(b.name, 'es'))
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {report && (
        <PlayerReportView
          report={report}
          allSeasons={allSeasons}
          onAllSeasons={setAllSeasons}
        />
      )}
    </>
  );
}
