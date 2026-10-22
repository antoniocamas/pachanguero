/** What a player is in a season: a fijo competes on points, an invitado comes with a host. */
export type SeasonRole = 'fijo' | 'invitado';

/** A refusal the organiser reads. */
export class SeasonRoleError extends Error {}

/** What is known of one player when their role in a season is asked for. */
export interface RoleFacts {
  /** The role written for this season, if any. */
  stored: SeasonRole | null;
  /** The role written for their latest earlier season, if any. */
  previous: SeasonRole | null;
  introducedBy: number | null;
}

/**
 * The rules of a player's role in a season. A season's role, once written, is the role; until
 * then a player keeps the role of their latest earlier season, and someone new is an invitado
 * when somebody introduced them and a fijo otherwise.
 */
export class SeasonRolePolicy {
  roleOf(facts: RoleFacts): SeasonRole {
    if (facts.stored) return facts.stored;
    if (facts.previous) return facts.previous;
    return facts.introducedBy === null ? 'fijo' : 'invitado';
  }

  /** Once a fijo has played a game of the season as one, they are never an invitado in it again. */
  checkChange(
    from: SeasonRole,
    to: SeasonRole,
    playedAsFijo: boolean,
    name: string
  ): void {
    if (from === 'fijo' && to === 'invitado' && playedAsFijo) {
      throw new SeasonRoleError(
        `${name} ya ha jugado como fijo esta temporada: no puede pasar a invitado`
      );
    }
  }
}

/** One named line of a candidate list, as far as being a guest goes. */
export interface GuestQuestion {
  role: SeasonRole;
  /** The line registered this name as its host's guest. */
  introduced: boolean;
  /** The host the line names or the organiser chose for it; null when there is none. */
  lineHost: number | null;
  /** The player's usual hosts, the usual one first. */
  usualHosts: readonly number[];
  introducedBy: number | null;
}

export type GuestAnswer =
  | { kind: 'regular' }
  | { kind: 'guest'; hostId: number }
  /** An invitado needs a host and none is known: the organiser has to say who. */
  | { kind: 'needsHost' };

/**
 * Whether a named candidate is a guest and of whom. A guest always has a host, which can change
 * from game to game: the one on the line, else the usual one, else whoever introduced them.
 * A fijo is never a guest, whatever the line says; a name the line itself registered is.
 */
export class GuestClassifier {
  classify(q: GuestQuestion): GuestAnswer {
    if (q.introduced && q.lineHost !== null) {
      return { kind: 'guest', hostId: q.lineHost };
    }
    if (q.role === 'fijo') return { kind: 'regular' };
    const host = q.lineHost ?? q.usualHosts[0] ?? q.introducedBy;
    return host === null || host === undefined
      ? { kind: 'needsHost' }
      : { kind: 'guest', hostId: host };
  }
}
