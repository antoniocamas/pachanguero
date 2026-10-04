import { NameMatcher } from '../domain/name-matcher.js';
import type { NameMatch } from '../domain/name-matcher.js';
import type { AliasRepository } from './alias-repository.js';
import type {
  PlayerRepository,
  RegisteredPlayer,
} from './player-repository.js';

export type Registration =
  | { outcome: 'registered'; player: RegisteredPlayer }
  | {
      outcome: 'collision';
      match: Exclude<NameMatch, { outcome: 'unresolved' }>;
    };

/**
 * Registers a new player unless the name already belongs to someone, whether
 * as their name or as an alias. A collision is reported in the same shape a
 * pasted line gets, so it can be resolved through the same view.
 */
export class PlayerRegistrar {
  constructor(
    private readonly players: PlayerRepository,
    private readonly aliases: AliasRepository
  ) {}

  register(name: string, introducedBy?: number): Registration {
    const matcher = new NameMatcher(
      this.players.listAll(),
      this.aliases.listAll()
    );
    const found = matcher.match(name);
    if (found.outcome !== 'unresolved') {
      return { outcome: 'collision', match: found };
    }
    return {
      outcome: 'registered',
      player: this.players.register(name, introducedBy),
    };
  }
}
