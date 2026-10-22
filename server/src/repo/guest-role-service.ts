import { SeasonRolePolicy, type SeasonRole } from '../domain/season-role.js';
import type { PlayerHostRepository } from './player-host-repository.js';
import type { PlayerRepository } from './player-repository.js';
import type { SeasonRoleRepository } from './season-role-repository.js';

/** Everything a list of one season needs to tell guests from fijos, read once. */
export class GuestContext {
  private readonly policy = new SeasonRolePolicy();

  constructor(
    private readonly stored: ReadonlyMap<number, SeasonRole>,
    private readonly previous: ReadonlyMap<number, SeasonRole>,
    private readonly introducers: ReadonlyMap<number, number | null>,
    private readonly hosts: ReadonlyMap<number, readonly number[]>
  ) {}

  roleOf(playerId: number): SeasonRole {
    return this.policy.roleOf({
      stored: this.stored.get(playerId) ?? null,
      previous: this.previous.get(playerId) ?? null,
      introducedBy: this.introducedBy(playerId),
    });
  }

  usualHosts(playerId: number): readonly number[] {
    return this.hosts.get(playerId) ?? [];
  }

  introducedBy(playerId: number): number | null {
    return this.introducers.get(playerId) ?? null;
  }
}

/** A named candidate a saved list placed, and the host they came with if a guest. */
export interface PlacedCandidate {
  playerId: number;
  hostId: number | null;
}

/**
 * The roles, usual hosts and introducers a season's lists are read with, and what a saved list
 * teaches them: a season's role is written the first time a list places the player, and every
 * host a guest came with joins their usual hosts.
 */
export class GuestRoleService {
  constructor(
    private readonly roles: SeasonRoleRepository,
    private readonly hosts: PlayerHostRepository,
    private readonly players: PlayerRepository
  ) {}

  forSeason(seasonId: number): GuestContext {
    return new GuestContext(
      this.roles.listForSeason(seasonId),
      this.roles.listPrevious(seasonId),
      new Map(this.players.listDetailed().map(p => [p.id, p.introducedBy])),
      this.hosts.listAll()
    );
  }

  /** The caller holds the transaction. */
  recordSaved(seasonId: number, placed: readonly PlacedCandidate[]): void {
    for (const { playerId, hostId } of placed) {
      this.roles.setIfMissing(
        seasonId,
        playerId,
        hostId === null ? 'fijo' : 'invitado'
      );
      if (hostId !== null && hostId !== playerId)
        this.hosts.add(playerId, hostId);
    }
  }
}
