import type { PlayerSeasonStat } from './player-game-stat.js';
import type { SeasonRow } from './season-repository.js';
import type { StandingsService } from './standings-service.js';

export interface PointsSeasonValue {
  points: number;
  /** Games with the player's own share paid. */
  paidGames: number;
  /** Weeks signed up and left out, demotions included. */
  exclusions: number;
  seniority: number;
  gamesPlayed: number;
  rank: number;
  of: number;
}

/** The player's points this season, what they are made of, and where they stand. */
export class PointsSeasonStat implements PlayerSeasonStat {
  readonly key = 'points';

  constructor(private readonly standings: StandingsService) {}

  compute(playerId: number, season: SeasonRow): PointsSeasonValue | null {
    const table = this.standings.standings(season.id);
    const index = table.findIndex(s => s.playerId === playerId);
    if (index < 0) return null;
    const s = table[index];
    return {
      points: s.points,
      paidGames: s.paidGames,
      exclusions: s.exclusions,
      seniority: s.seniority,
      gamesPlayed: s.gamesPlayed,
      rank: index + 1,
      of: table.length,
    };
  }
}
