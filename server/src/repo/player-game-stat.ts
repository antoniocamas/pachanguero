import type { SeasonRow } from './season-repository.js';

/**
 * One statistic about a player's games. The report asks every stat it was
 * built with, so a new statistic is a new class, not another branch in the
 * report.
 */
export interface PlayerGameStat {
  /** Where the value sits in a game's `stats` and in the summary. */
  readonly key: string;
  /** The value for each of the player's games that has one, by game id. */
  valuesFor(playerId: number): Map<number, unknown>;
  /** The stat across all the games the player was in. */
  summarize(values: ReadonlyMap<number, unknown>, games: number): unknown;
}

/**
 * One statistic about a player across a whole season. `null` when the player
 * has nothing in that season to report.
 */
export interface PlayerSeasonStat {
  readonly key: string;
  compute(playerId: number, season: SeasonRow): unknown | null;
}
