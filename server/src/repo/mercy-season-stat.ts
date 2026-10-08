import { ExclusionHistory } from '../domain/exclusion-history.js';
import type { ExclusionRepository } from './exclusion-repository.js';
import type { PlayerSeasonStat } from './player-game-stat.js';
import type { SeasonRepository, SeasonRow } from './season-repository.js';

export interface MercySeasonValue {
  outOnPoints: number;
  mercySeats: number;
  demotions: number;
  /** The wait counter the selection uses, which the legacy rule can leave negative. */
  waitCounter: number;
  /** The counter that makes a player a mercy candidate. */
  threshold: number;
  /** Weeks still to wait; 0 means a candidate already. */
  gamesUntilMercy: number;
}

/** Weeks out, mercy seats and demotions this season, and how far the next mercy seat is. */
export class MercySeasonStat implements PlayerSeasonStat {
  readonly key = 'mercy';

  constructor(
    private readonly exclusions: ExclusionRepository,
    private readonly seasons: SeasonRepository
  ) {}

  compute(playerId: number, season: SeasonRow): MercySeasonValue {
    const rules = this.seasons.rulesOf(season);
    const history =
      this.exclusions.historyFor(season.id).get(playerId) ??
      new ExclusionHistory([]);
    return {
      outOnPoints: history.outOnPointsCount(),
      mercySeats: history.mercyCount(),
      demotions: history.demotionCount(),
      waitCounter: history.waitCounter(rules),
      threshold: rules.gamesOutForMercy,
      gamesUntilMercy: history.gamesUntilMercy(rules),
    };
  }
}
