import { useState } from 'react';
import { useKnownPlayers } from '../hooks/useKnownPlayers';
import { usePlayerReport } from '../hooks/usePlayerReport';
import { fmtDate } from '../lib/dates';
import { gamesToShow } from '../lib/playerReport';
import { PLAYER_SEASON_STATS, PLAYER_STATS } from '../lib/playerStats';

/** Pick a player, see every game they played and the statistics about each. */
export function PlayerReportPage() {
  const players = useKnownPlayers(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [allSeasons, setAllSeasons] = useState(false);
  const { report, error } = usePlayerReport(playerId);
  const games = report ? gamesToShow(report, allSeasons) : [];

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
        <>
          <div className="card" data-testid="player-summary">
            <h2>
              {report.player.name}
              <span className="right muted">
                {report.summary.gamesPlayed} partidos jugados
                {report.season && ` · ${report.season.name}`}
              </span>
            </h2>
            {PLAYER_STATS.map(stat => (
              <div className="row" key={stat.key}>
                <span className="name">{stat.title}</span>
                <span>{stat.summary(report.summary[stat.key])}</span>
              </div>
            ))}
          </div>

          {report.season &&
            PLAYER_SEASON_STATS.map(stat => (
              <div
                className="card"
                key={stat.key}
                data-testid={`season-${stat.key}`}
              >
                <h2>
                  {stat.title}
                  <span className="right muted">{report.season!.name}</span>
                </h2>
                {report.seasonStats[stat.key] ? (
                  stat.figures(report.seasonStats[stat.key]).map(f => (
                    <div className="row" key={f.label}>
                      <span className="name">{f.label}</span>
                      <b className={f.tone ? `stat-${f.tone}` : undefined}>
                        {f.value}
                      </b>
                    </div>
                  ))
                ) : (
                  <div className="empty">No ha participado esta temporada.</div>
                )}
              </div>
            ))}

          <div className="card">
            <h2>
              Partidos
              {report.season && (
                <label className="right muted">
                  <input
                    type="checkbox"
                    checked={allSeasons}
                    onChange={e => setAllSeasons(e.target.checked)}
                  />{' '}
                  Otras temporadas
                </label>
              )}
            </h2>
            {games.length === 0 && (
              <div className="empty">Sin partidos en esta temporada.</div>
            )}
            {games.map(g => (
              <div
                className="row debtor-line"
                key={g.gameId}
                data-testid="player-game"
              >
                <span className="name">
                  {fmtDate(g.playedOn)}
                  {g.label ? ` (${g.label})` : ''}
                  <span className="muted"> · {g.season}</span>
                </span>
                {PLAYER_STATS.map(stat => {
                  const { text, tone } = stat.cell(g.stats[stat.key]);
                  return (
                    <span key={stat.key} className={`tag stat-${tone}`}>
                      {text}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
