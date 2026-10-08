import { NameMatcher } from '../domain/name-matcher.js';
import type { NameMatch } from '../domain/name-matcher.js';
import { NameStripper } from '../domain/name-stripper.js';
import type { ParsedLine } from '../domain/candidate-line-parser.js';
import type { AliasRepository } from './alias-repository.js';
import type { PlayerRegistrar } from './player-registrar.js';
import type { PlayerRepository } from './player-repository.js';

/** The part of a line that could not be matched: the candidate's name or its host's. */
export type LineField = 'name' | 'host';

export interface UnresolvedEntry {
  line: ParsedLine;
  field: LineField;
  /**
   * 'collision' is a new name that turned out to belong to an existing player;
   * 'duplicate' is a guest whose name is already in the list with another host.
   */
  reason: 'unmatched' | 'ambiguous' | 'collision' | 'duplicate';
  /** Players the name could be; empty when nothing matched. */
  candidates: { id: number; name: string }[];
}

export type ResolveAction =
  | { type: 'link'; playerId: number }
  | { type: 'linkAsAlias'; playerId: number }
  | { type: 'register'; name: string; introducedBy?: number };

export type Settled =
  | { settled: true; playerId: number }
  | { settled: false; entry: UnresolvedEntry };

/**
 * What both pasted lists share: matching names against everyone known, and
 * applying the organiser's choice for a name that could not be matched.
 */
export class LineResolver {
  private readonly stripper = new NameStripper();

  constructor(
    private readonly players: PlayerRepository,
    private readonly aliases: AliasRepository,
    private readonly registrar: PlayerRegistrar
  ) {}

  matcher(): NameMatcher {
    return new NameMatcher(this.players.listAll(), this.aliases.listAll());
  }

  names(): Map<number, string> {
    return new Map(this.players.listAll().map(p => [p.id, p.name]));
  }

  /** Applies the organiser's choice to the field that failed to match. */
  settle(
    entry: Pick<UnresolvedEntry, 'line' | 'field'>,
    action: ResolveAction
  ): Settled {
    const spelled = this.spelling(entry.line, entry.field);
    if (action.type === 'register') {
      const result = this.registrar.register(action.name, action.introducedBy);
      if (result.outcome === 'collision') {
        return {
          settled: false,
          entry: this.unresolved(
            entry.line,
            entry.field,
            result.match,
            this.names()
          ),
        };
      }
      return { settled: true, playerId: result.player.id };
    }
    if (!this.players.nameOf(action.playerId)) {
      throw new Error(`Unknown player: ${action.playerId}`);
    }
    if (action.type === 'linkAsAlias') {
      this.aliases.add(action.playerId, this.stripper.strip(spelled));
    }
    return { settled: true, playerId: action.playerId };
  }

  private spelling(line: ParsedLine, field: LineField): string {
    if (field === 'host') {
      return line.kind === 'plain' ? line.name : line.hostName;
    }
    return line.kind === 'plusOne' ? line.hostName : line.name;
  }

  unresolved(
    line: ParsedLine,
    field: LineField,
    match: NameMatch,
    names: Map<number, string>
  ): UnresolvedEntry {
    const ids =
      match.outcome === 'matched'
        ? [match.playerId]
        : match.outcome === 'ambiguous'
          ? match.playerIds
          : [];
    return {
      line,
      field,
      reason:
        match.outcome === 'unresolved'
          ? 'unmatched'
          : match.outcome === 'ambiguous'
            ? 'ambiguous'
            : 'collision',
      candidates: ids.map(id => ({ id, name: names.get(id) ?? '' })),
    };
  }
}
