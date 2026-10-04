/**
 * Suggests how many seasons a player has behind them when they first appear in
 * a season. A brand-new player starts at 0; a returning one carries on from
 * their most recent recorded season, so a gap year costs them nothing.
 */
export class SeniorityAdvisor {
  suggest(lastRecorded: number | null): number {
    return lastRecorded === null ? 0 : lastRecorded + 1;
  }
}
