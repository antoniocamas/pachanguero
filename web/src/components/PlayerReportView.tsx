import type { PlayerReport } from '../api';
import { fmtDate } from '../lib/dates';
import { gamesToShow } from '../lib/playerReport';
import { PLAYER_SEASON_STATS, PLAYER_STATS } from '../lib/playerStats';

/** A player's report as cards: summary, season statistics and the games. Read only. */
export function PlayerReportView({
  report,
  allSeasons,
  onAllSeasons,
}: {
  report: PlayerReport;
  allSeasons: boolean;
  onAllSeasons: (all: boolean) => void;
}) {
  const games = gamesToShow(report, allSeasons);

  return (
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
                onChange={e => onAllSeasons(e.target.checked)}
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
            className="row debtor-line report-line"
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
  );
}
