import type { MemberKey } from './types.js';

/** A guest row of a game's candidate list, as far as numbering is concerned. */
export interface GuestLine {
  position: number;
  /** null for an anonymous '+1'. */
  player_id: number | null;
  host_player_id: number;
}

/**
 * Names an anonymous plus-one by its host and ordinal (the nth of that host,
 * in list order) instead of by its line, which changes when the list does.
 * The selection carries anonymous plus-ones as `-position`; this maps those
 * back to a stable key.
 */
export class GuestOrdinals {
  private readonly byPosition = new Map<number, MemberKey>();

  constructor(lines: readonly GuestLine[]) {
    const seen = new Map<number, number>();
    const anonymous = lines
      .filter(l => l.player_id === null)
      .sort((a, b) => a.position - b.position);
    for (const line of anonymous) {
      const ordinal = (seen.get(line.host_player_id) ?? 0) + 1;
      seen.set(line.host_player_id, ordinal);
      this.byPosition.set(line.position, {
        hostPlayerId: line.host_player_id,
        ordinal,
      });
    }
  }

  /** The key of the selection's contender id: a real player, or `-position` for a plus-one. */
  keyOf(contenderId: number): MemberKey {
    if (contenderId > 0) return { playerId: contenderId };
    const key = this.byPosition.get(-contenderId);
    if (!key)
      throw new Error(`No hay invitado anónimo en la línea ${-contenderId}`);
    return key;
  }

  /** Every anonymous plus-one of the list, as keys. */
  keys(): MemberKey[] {
    return [...this.byPosition.values()];
  }
}
