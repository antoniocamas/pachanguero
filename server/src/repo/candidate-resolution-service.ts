import type Database from 'better-sqlite3';
import { LocalCalendar } from '../domain/local-calendar.js';
import { NameMatcher } from '../domain/name-matcher.js';
import type { NameMatch } from '../domain/name-matcher.js';
import { NameStripper } from '../domain/name-stripper.js';
import type {
  CandidateLineParser,
  ParsedLine,
} from '../domain/candidate-line-parser.js';
import type { AliasRepository } from './alias-repository.js';
import type { GameDayResolutionService } from './game-day-resolution-service.js';
import type { GameRepository, GameRow } from './game-repository.js';
import type { GuestCandidateRepository } from './guest-candidate-repository.js';
import type { ParticipationRepository } from './participation-repository.js';
import type { PlayerRegistrar } from './player-registrar.js';
import type { PlayerRepository } from './player-repository.js';

/** The part of a line that could not be matched: the candidate's name or its host's. */
export type LineField = 'name' | 'host';

export interface UnresolvedEntry {
  line: ParsedLine;
  field: LineField;
  /** 'collision' is a new name that turned out to belong to an existing player. */
  reason: 'unmatched' | 'ambiguous' | 'collision';
  /** Players the name could be; empty when nothing matched. */
  candidates: { id: number; name: string }[];
}

export interface MatchedCandidate {
  position: number;
  playerId: number | null;
  name: string | null;
  /** Who a guest came with; null for a regular. */
  hostPlayerId: number | null;
  guest: 'named' | 'anonymous' | null;
}

export interface PasteResult {
  game: GameRow;
  matched: MatchedCandidate[];
  unresolved: UnresolvedEntry[];
}

export type ResolveAction =
  | { type: 'link'; playerId: number }
  | { type: 'linkAsAlias'; playerId: number }
  | { type: 'register'; name: string; introducedBy?: number };

export type ResolveResult =
  | { outcome: 'resolved'; candidate: MatchedCandidate }
  | { outcome: 'unresolved'; entry: UnresolvedEntry };

/** A line whose players are all settled, ready to persist. */
interface ResolvedLine {
  line: ParsedLine;
  playerId: number | null;
  hostPlayerId: number | null;
  /** True when this line registered the player, which is what makes a named guest. */
  registered: boolean;
}

type Settled =
  | { settled: true; playerId: number }
  | { settled: false; entry: UnresolvedEntry };

/**
 * Turns a pasted candidate list into sign-ups and guest rows. A name that
 * cannot be matched is never guessed: it comes back unresolved and nothing is
 * stored for it until the organiser settles it with `resolve`.
 */
export class CandidateResolutionService {
  private readonly stripper = new NameStripper();
  private readonly calendar = new LocalCalendar();

  constructor(
    private readonly games: GameRepository,
    private readonly gameDay: GameDayResolutionService,
    private readonly players: PlayerRepository,
    private readonly aliases: AliasRepository,
    private readonly participations: ParticipationRepository,
    private readonly guests: GuestCandidateRepository,
    private readonly parser: CandidateLineParser,
    private readonly registrar: PlayerRegistrar,
    private readonly conn: Database.Database
  ) {}

  /**
   * Replaces the game's candidates with this paste. Without a `gameId` the
   * game is the next game day on or after today.
   */
  paste(text: string, gameId?: number, now: Date = new Date()): PasteResult {
    const game = this.targetGame(gameId, now);
    const matcher = this.matcher();
    const names = this.nameLookup();

    const resolved: ResolvedLine[] = [];
    const unresolved: UnresolvedEntry[] = [];
    for (const line of this.parser.parseAll(text)) {
      const outcome = this.resolveLine(line, matcher, names);
      if ('entry' in outcome) unresolved.push(outcome.entry);
      else resolved.push(outcome.line);
    }

    this.conn.transaction(() => {
      this.participations.clearSignups(game.id);
      for (const r of resolved) this.signUp(game.id, r);
      this.guests.replaceAll(
        game.id,
        resolved.flatMap(r => this.guestRow(r) ?? [])
      );
    })();

    return {
      game,
      matched: resolved.map(r => this.describe(r, names)),
      unresolved,
    };
  }

  /**
   * Settles one unresolved line and stores just that line; the rest of the
   * game's candidates are left exactly as they are.
   */
  resolve(
    gameId: number,
    entry: Pick<UnresolvedEntry, 'line' | 'field'>,
    action: ResolveAction
  ): ResolveResult {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Unknown game: ${gameId}`);

    const typed = this.applyAction(entry, action);
    if (!typed.settled) return { outcome: 'unresolved', entry: typed.entry };

    // Read after `applyAction`, which may have registered a player or alias.
    const matcher = this.matcher();
    const names = this.nameLookup();
    const registered = action.type === 'register';
    const resolved = this.completeLine(
      entry.line,
      entry.field,
      typed.playerId,
      registered,
      action,
      matcher,
      names
    );
    if ('entry' in resolved) {
      return { outcome: 'unresolved', entry: resolved.entry };
    }

    this.conn.transaction(() => {
      this.signUp(game.id, resolved.line);
      const row = this.guestRow(resolved.line);
      if (row) this.guests.put(game.id, row);
    })();
    return {
      outcome: 'resolved',
      candidate: this.describe(resolved.line, names),
    };
  }

  private targetGame(gameId: number | undefined, now: Date): GameRow {
    if (gameId === undefined) {
      return this.gameDay.resolveTarget(this.calendar.dateOf(now));
    }
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    return game;
  }

  private matcher(): NameMatcher {
    return new NameMatcher(this.players.listAll(), this.aliases.listAll());
  }

  private nameLookup(): Map<number, string> {
    return new Map(this.players.listAll().map(p => [p.id, p.name]));
  }

  private resolveLine(
    line: ParsedLine,
    matcher: NameMatcher,
    names: Map<number, string>
  ): { line: ResolvedLine } | { entry: UnresolvedEntry } {
    let playerId: number | null = null;
    if (line.kind !== 'plusOne') {
      const name = matcher.match(line.name);
      if (name.outcome !== 'matched') {
        return { entry: this.unresolvedEntry(line, 'name', name, names) };
      }
      playerId = name.playerId;
    }
    let hostPlayerId: number | null = null;
    if (line.kind !== 'plain') {
      const host = matcher.match(line.hostName);
      if (host.outcome !== 'matched') {
        return { entry: this.unresolvedEntry(line, 'host', host, names) };
      }
      hostPlayerId = host.playerId;
    }
    // A name that matched is already a known player, so a host annotation
    // changes nothing; only a plus-one makes a guest here.
    return {
      line:
        line.kind === 'plusOne'
          ? { line, playerId: null, hostPlayerId, registered: false }
          : { line, playerId, hostPlayerId: null, registered: false },
    };
  }

  /** Applies the organiser's choice to the field that failed to match. */
  private applyAction(
    entry: Pick<UnresolvedEntry, 'line' | 'field'>,
    action: ResolveAction
  ): Settled {
    const spelled = this.spelling(entry.line, entry.field);
    if (action.type === 'register') {
      const result = this.registrar.register(action.name, action.introducedBy);
      if (result.outcome === 'collision') {
        return {
          settled: false,
          entry: this.unresolvedEntry(
            entry.line,
            entry.field,
            result.match,
            this.nameLookup()
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

  /** With one field settled, match the other and build the line to store. */
  private completeLine(
    line: ParsedLine,
    field: LineField,
    settledId: number,
    registered: boolean,
    action: ResolveAction,
    matcher: NameMatcher,
    names: Map<number, string>
  ): { line: ResolvedLine } | { entry: UnresolvedEntry } {
    if (line.kind === 'plain') {
      return {
        line: { line, playerId: settledId, hostPlayerId: null, registered },
      };
    }
    if (line.kind === 'plusOne') {
      return {
        line: { line, playerId: null, hostPlayerId: settledId, registered },
      };
    }
    if (field === 'name') {
      // The host's own settled value, if the organiser gave one for a new
      // player, otherwise whoever the pasted host name matches.
      const given =
        action.type === 'register' ? action.introducedBy : undefined;
      let hostPlayerId = given ?? null;
      if (hostPlayerId === null) {
        const host = matcher.match(line.hostName);
        if (host.outcome !== 'matched') {
          return { entry: this.unresolvedEntry(line, 'host', host, names) };
        }
        hostPlayerId = host.playerId;
      }
      return { line: { line, playerId: settledId, hostPlayerId, registered } };
    }
    // The host was settled; now the guest's own name still has to match.
    const name = matcher.match(line.name);
    if (name.outcome !== 'matched') {
      return { entry: this.unresolvedEntry(line, 'name', name, names) };
    }
    return {
      line: {
        line,
        playerId: name.playerId,
        hostPlayerId: settledId,
        registered: false,
      },
    };
  }

  private signUp(gameId: number, r: ResolvedLine): void {
    const signedUp = r.playerId ?? r.hostPlayerId;
    this.participations.set(gameId, signedUp!, { signed_up: true });
  }

  /** A guest row for an anonymous plus-one, or for a player this paste registered as someone's guest. */
  private guestRow(r: ResolvedLine): {
    position: number;
    player_id: number | null;
    host_player_id: number;
  } | null {
    if (r.line.kind === 'plusOne') {
      return {
        position: r.line.position,
        player_id: null,
        host_player_id: r.hostPlayerId!,
      };
    }
    if (r.line.kind === 'hostAnnotated' && r.registered) {
      return {
        position: r.line.position,
        player_id: r.playerId,
        host_player_id: r.hostPlayerId!,
      };
    }
    return null;
  }

  private describe(
    r: ResolvedLine,
    names: Map<number, string>
  ): MatchedCandidate {
    const row = this.guestRow(r);
    return {
      position: r.line.position,
      playerId: r.playerId,
      name: r.playerId === null ? null : (names.get(r.playerId) ?? null),
      hostPlayerId: row ? row.host_player_id : null,
      guest: row ? (row.player_id === null ? 'anonymous' : 'named') : null,
    };
  }

  private spelling(line: ParsedLine, field: LineField): string {
    if (field === 'host') {
      return line.kind === 'plain' ? line.name : line.hostName;
    }
    return line.kind === 'plusOne' ? line.hostName : line.name;
  }

  private unresolvedEntry(
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
