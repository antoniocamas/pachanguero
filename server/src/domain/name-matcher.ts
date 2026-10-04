import { NameStripper } from './name-stripper.js';

export interface NamedPlayer {
  id: number;
  name: string;
}

export interface PlayerAlias {
  playerId: number;
  alias: string;
}

export type NameMatch =
  | { outcome: 'matched'; playerId: number }
  | { outcome: 'ambiguous'; playerIds: number[] }
  | { outcome: 'unresolved' };

/**
 * Matches a pasted line against canonical names and aliases. Never guesses:
 * a name that fits more than one player is reported as ambiguous.
 */
export class NameMatcher {
  private readonly stripper = new NameStripper();

  constructor(
    private readonly players: readonly NamedPlayer[],
    private readonly aliases: readonly PlayerAlias[]
  ) {}

  strip(raw: string): string {
    return this.stripper.strip(raw);
  }

  match(raw: string): NameMatch {
    const name = this.strip(raw);
    const ids = new Set<number>();
    for (const p of this.players) {
      if (this.same(p.name, name)) ids.add(p.id);
    }
    for (const a of this.aliases) {
      if (this.same(a.alias, name)) ids.add(a.playerId);
    }
    if (ids.size === 0) return { outcome: 'unresolved' };
    if (ids.size === 1) return { outcome: 'matched', playerId: [...ids][0] };
    return { outcome: 'ambiguous', playerIds: [...ids] };
  }

  private same(a: string, b: string): boolean {
    return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
  }
}
