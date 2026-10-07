import type Database from 'better-sqlite3';
import { PointsCalculator } from '../domain/points.js';
import { PlayerRepository } from './player-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { DebtRepository } from './debt-repository.js';

export interface Standing {
  playerId: number;
  name: string;
  seasons: number;
  paidGames: number;
  exclusions: number;
  attendance: number;
  seniority: number;
  points: number;
  gamesPlayed: number;
  debtCents: number;
}

export class StandingsService {
  constructor(
    private readonly players: PlayerRepository,
    private readonly exclusions: ExclusionRepository,
    private readonly debts: DebtRepository,
    private readonly points: PointsCalculator,
    private readonly conn: Database.Database
  ) {}

  /**
   * Standings for a season. `upToGameId` excludes that game and everything after
   * it, which is what selection for that game must see.
   */
  standings(seasonId: number, upToGameId?: number): Standing[] {
    const players = this.players.list(seasonId);
    const bound = upToGameId
      ? (this.conn
          .prepare('SELECT played_on FROM games WHERE id = ?')
          .get(upToGameId) as { played_on: string } | undefined)
      : undefined;

    const cutoff = bound
      ? { played_on: bound.played_on, id: upToGameId! }
      : { played_on: '9999-12-31', id: Number.MAX_SAFE_INTEGER };

    const paid = this.conn
      .prepare(
        `SELECT pa.player_id,
                SUM(CASE WHEN pa.paid_cents > 0 THEN 1 ELSE 0 END) AS paid_games,
                SUM(CASE WHEN pa.played = 1 THEN 1 ELSE 0 END)     AS games_played
           FROM participations pa JOIN games g ON g.id = pa.game_id
          WHERE g.season_id = @seasonId AND g.status != 'cancelled'
            AND (g.played_on < @on OR (g.played_on = @on AND g.id < @id))
          GROUP BY pa.player_id`
      )
      .all({ seasonId, on: cutoff.played_on, id: cutoff.id }) as Array<{
      player_id: number;
      paid_games: number;
      games_played: number;
    }>;

    // Debt is always current — it is money owed, not a point-in-time score.
    const debtBy = this.debts.totalsByHolder(seasonId);

    const history = this.exclusions.historyFor(seasonId, upToGameId);
    const paidBy = new Map(paid.map(r => [r.player_id, r]));

    return players
      .map(p => {
        const stats = paidBy.get(p.id);
        const excl = history.get(p.id)?.exclusionCount() ?? 0;
        const b = this.points.compute({
          paidGames: stats?.paid_games ?? 0,
          exclusions: excl,
          seasons: p.seasons,
        });
        return {
          playerId: p.id,
          name: p.name,
          seasons: p.seasons,
          paidGames: stats?.paid_games ?? 0,
          exclusions: excl,
          attendance: b.attendance,
          seniority: b.seniority,
          points: b.total,
          gamesPlayed: stats?.games_played ?? 0,
          debtCents: debtBy.get(p.id) ?? 0,
        };
      })
      .sort(
        (a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es')
      );
  }
}
