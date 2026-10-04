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

const LIST_MARKER = /^\s*(?:\d+[.)]?|[•\-*])\s*/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|\uFE0F/gu;

/**
 * Matches a pasted line against canonical names and aliases. Never guesses:
 * a name that fits more than one player is reported as ambiguous.
 */
export class NameMatcher {
  constructor(
    private readonly players: readonly NamedPlayer[],
    private readonly aliases: readonly PlayerAlias[]
  ) {}

  /** Drop the list marker, then emoji, then tidy whitespace — in that order. */
  strip(raw: string): string {
    return raw
      .replace(LIST_MARKER, '')
      .replace(EMOJI, '')
      .replace(/\s+/g, ' ')
      .trim();
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
