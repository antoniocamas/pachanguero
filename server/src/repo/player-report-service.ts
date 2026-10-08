import type Database from 'better-sqlite3';
import type { PlayerGameStat, PlayerSeasonStat } from './player-game-stat.js';
import type { SeasonRepository } from './season-repository.js';

export interface PlayerReport {
  player: { id: number; name: string };
  /** Most recent first. */
  games: Array<{
    gameId: number;
    playedOn: string;
    label: string | null;
    seasonId: number;
    season: string;
    /** Whether they were on the pitch; false when they signed up and were left out. */
    played: boolean;
    stats: Record<string, unknown>;
  }>;
  /** The season the season stats are about: today's; null when none exists. */
  season: { id: number; name: string } | null;
  /** Each season stat, by key; null where the player has no part in the season. */
  seasonStats: Record<string, unknown>;
  /** Each stat's summary over the games of that season, by the stat's key. */
  summary: Record<string, unknown> & { gamesPlayed: number };
}

/** Every game a player played, with what each statistic says about it. */
export class PlayerReportService {
  constructor(
    private readonly stats: readonly PlayerGameStat[],
    private readonly seasonStats: readonly PlayerSeasonStat[],
    private readonly seasons: SeasonRepository,
    private readonly conn: Database.Database
  ) {}

  report(playerId: number, today: string): PlayerReport {
    const player = this.conn
      .prepare('SELECT id, name FROM players WHERE id = ?')
      .get(playerId) as { id: number; name: string } | undefined;
    if (!player) throw new Error('Jugador no encontrado');

    const rows = this.conn
      .prepare(
        `SELECT g.id AS gameId, g.played_on AS playedOn, g.label, s.id AS seasonId, s.name AS season,
                COALESCE(pa.played, 0) AS played
           FROM games g
           JOIN seasons s ON s.id = g.season_id
           LEFT JOIN participations pa
                  ON pa.game_id = g.id AND pa.player_id = @playerId
          WHERE g.status = 'played'
            AND (pa.played = 1
                 OR EXISTS (SELECT 1 FROM exclusions e
                             WHERE e.game_id = g.id AND e.player_id = @playerId))
          ORDER BY g.played_on DESC, g.id DESC`
      )
      .all({ playerId }) as Array<{
      gameId: number;
      playedOn: string;
      label: string | null;
      seasonId: number;
      season: string;
      played: number;
    }>;

    const season = this.seasons.current(today);
    // The summary is about today's season; with none, about every game.
    const counted = season ? rows.filter(r => r.seasonId === season.id) : rows;
    const countedIds = new Set(counted.map(r => r.gameId));
    const values = this.stats.map(
      stat => [stat, stat.valuesFor(playerId)] as const
    );
    const summary: PlayerReport['summary'] = {
      gamesPlayed: counted.filter(r => r.played).length,
    };
    for (const [stat, byGame] of values)
      summary[stat.key] = stat.summarize(
        new Map([...byGame].filter(([gameId]) => countedIds.has(gameId))),
        counted.length
      );

    const seasonStats: Record<string, unknown> = {};
    if (season)
      for (const stat of this.seasonStats)
        seasonStats[stat.key] = stat.compute(playerId, season);

    return {
      player,
      season: season ? { id: season.id, name: season.name } : null,
      seasonStats,
      games: rows.map(row => ({
        ...row,
        played: row.played === 1,
        stats: Object.fromEntries(
          values.map(([stat, byGame]) => [stat.key, byGame.get(row.gameId)])
        ),
      })),
      summary,
    };
  }
}
