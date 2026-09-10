/** Why a player did not play a game they signed up for. */
export type ExclusionKind =
  /** Left out on points ('1' in the legacy sheet). */
  | 'points'
  /** Was inside the cut, displaced by the mercy rule ('2'). */
  | 'demoted'
  /** Received the mercy seat and played ('D'). */
  | 'mercy';

/** One historical FueraDeConvocatoria entry for a player. */
export interface ExclusionRecord {
  playerId: number;
  gameId: number;
  kind: ExclusionKind;
}

export type DemotionDirection = 'bottom-up' | 'top-down';

export interface SeasonRules {
  /** Players on the pitch. 7-a-side => 14. */
  slots: number;
  /** Seats reserved for the mercy rule (legacy NUMBER_OF_MERCY_SEATS). */
  mercySeats: number;
  /** Games waiting before you qualify (legacy GAMES_OUT_4_MERCY). */
  gamesOutForMercy: number;
  /**
   * Whether a mercy seat resets the waiting counter to zero.
   *
   * The organiser describes the rule as a reset. The legacy script instead
   * subtracts `gamesOutForMercy`, which leaves a remainder for anyone who
   * waited three or more games. Defaults to `false` to reproduce the legacy
   * behaviour; see docs/domain-model/legacy-script-review.md.
   */
  mercyResetsCounter: boolean;
  /**
   * Which end of the starting XIV to demote from, at equal demotion history.
   * `bottom-up` takes the worst-placed player, and is what the legacy script
   * hardcodes.
   */
  demotionDirection: DemotionDirection;
}

export const DEFAULT_RULES: SeasonRules = {
  slots: 14,
  mercySeats: 1,
  gamesOutForMercy: 2,
  mercyResetsCounter: false,
  demotionDirection: 'bottom-up',
};

/** A player standing for selection, with their points already computed. */
export interface Contender {
  playerId: number;
  name: string;
  points: number;
}

export type Outcome =
  /** In the XIV on points alone. */
  | 'called_up'
  /** In the XIV via a mercy seat. */
  | 'mercy'
  /** Displaced from the XIV to make room for a mercy seat. */
  | 'demoted'
  /** Left out on points. */
  | 'excluded';

export interface ConvocatoriaEntry {
  playerId: number;
  name: string;
  points: number;
  /** 1-based, after promotion/demotion swaps have been applied. */
  position: number;
  outcome: Outcome;
  /** Games waiting since the last mercy seat, at selection time. */
  waitCounter: number;
  playing: boolean;
}

export interface ConvocatoriaResult {
  entries: ConvocatoriaEntry[];
  /** Empty when nobody qualified, or when the game was not oversubscribed. */
  swaps: Array<{ promoted: number; demoted: number }>;
  /** True when there were more sign-ups than slots. */
  oversubscribed: boolean;
}
