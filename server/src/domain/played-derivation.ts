import type { ExclusionKind, Outcome } from './types.js';

/** What a stored convocatoria entry says, as far as deriving who played goes. */
export interface DerivableEntry {
  /** Null for an anonymous plus-one, who has no record of their own. */
  playerId: number | null;
  playing: boolean;
  outcome: Outcome;
}

export interface DerivedParticipation {
  playerId: number;
  played: boolean;
  /** The exclusion row the game leaves for the player, if any. */
  exclusion: ExclusionKind | null;
}

/**
 * Who played, and who earns an exclusion point, from a convocatoria's final
 * state: `playing` is what the organiser settled, `outcome` what the selection
 * chose. A mercy seat is history only (never scores) unless it was taken away.
 */
export class PlayedDerivation {
  derive(entries: readonly DerivableEntry[]): DerivedParticipation[] {
    return entries.flatMap(e =>
      e.playerId === null
        ? []
        : [
            {
              playerId: e.playerId,
              played: e.playing,
              exclusion: this.exclusionOf(e),
            },
          ]
    );
  }

  private exclusionOf(e: DerivableEntry): ExclusionKind | null {
    if (e.playing) return e.outcome === 'mercy' ? 'mercy' : null;
    return e.outcome === 'demoted' ? 'demoted' : 'points';
  }
}
