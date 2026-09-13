import type { ExclusionKind, SeasonRules } from './types.js';

/**
 * One player's exclusion record for a season, in chronological order.
 *
 * `waitCounter` mirrors the legacy sheet's rule exactly: `mercyResetsCounter` decides what a
 * mercy seat does. The organiser's rule is a reset to zero; the legacy script subtracts
 * `gamesOutForMercy` instead, which leaves a remainder behind for anyone who waited three or more
 * games and makes them eligible again sooner than they should be. Not clamped at zero in legacy
 * mode: the original script subtracts unconditionally, so the counter can go negative — reproduced
 * faithfully.
 */
export class ExclusionHistory {
  constructor(private readonly kinds: ExclusionKind[]) {}

  private scores(kind: ExclusionKind): boolean {
    return kind === 'points' || kind === 'demoted';
  }

  waitCounter(
    rules: Pick<SeasonRules, 'gamesOutForMercy' | 'mercyResetsCounter'>
  ): number {
    let counter = 0;
    for (const kind of this.kinds) {
      if (kind === 'mercy') {
        counter = rules.mercyResetsCounter
          ? 0
          : counter - rules.gamesOutForMercy;
      } else if (this.scores(kind)) {
        counter += 1;
      }
    }
    return counter;
  }

  /** How many mercy seats this player has already had this season. */
  mercyCount(): number {
    return this.kinds.filter(k => k === 'mercy').length;
  }

  /** How many times this player has been demoted this season. */
  demotionCount(): number {
    return this.kinds.filter(k => k === 'demoted').length;
  }

  /** Total exclusions that score a point — everything except a mercy seat. */
  exclusionCount(): number {
    return this.kinds.filter(k => k !== 'mercy').length;
  }
}
