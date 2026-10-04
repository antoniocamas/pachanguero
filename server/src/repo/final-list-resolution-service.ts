import type Database from 'better-sqlite3';
import type {
  CandidateLineParser,
  ParsedLine,
} from '../domain/candidate-line-parser.js';
import type { FinalListParser, Team } from '../domain/final-list-parser.js';
import type { ExclusionKind } from '../domain/types.js';
import type { ExclusionRepository } from './exclusion-repository.js';
import type { FinalListTargetResolver } from './final-list-target-resolver.js';
import type { GameRepository, GameRow } from './game-repository.js';
import type {
  LineResolver,
  ResolveAction,
  UnresolvedEntry,
} from './line-resolver.js';
import type { ParticipationRepository } from './participation-repository.js';
import type { PlayerRepository } from './player-repository.js';
import type { SeasonRepository } from './season-repository.js';

export interface FinalUnresolved extends UnresolvedEntry {
  team: Team;
}

export interface FinalParticipant {
  position: number;
  team: Team;
  playerId: number;
  name: string;
  /** Unnamed companions billed to this player. */
  companions: number;
  paidCents: number;
  /** Set when this is their first appearance in the game's season. */
  seniorityPrompt?: true;
  suggested?: number;
}

export interface FinalPasteResult {
  game: GameRow;
  matched: FinalParticipant[];
  unresolved: FinalUnresolved[];
}

export type FinalResolveResult =
  | { outcome: 'resolved'; participant: FinalParticipant }
  | { outcome: 'unresolved'; entry: FinalUnresolved };

interface Attendee {
  position: number;
  team: Team;
  playerId: number;
  companions: number;
}

/**
 * Turns the pasted final list into what actually happened: who played, which
 * team, what each owes. It is the only writer of attendance and payment, and
 * it keeps exclusion points in step with who really played.
 */
export class FinalListResolutionService {
  constructor(
    private readonly games: GameRepository,
    private readonly target: FinalListTargetResolver,
    private readonly players: PlayerRepository,
    private readonly participations: ParticipationRepository,
    private readonly exclusions: ExclusionRepository,
    private readonly seasons: SeasonRepository,
    private readonly lines: LineResolver,
    private readonly teamParser: FinalListParser,
    private readonly lineParser: CandidateLineParser,
    private readonly conn: Database.Database
  ) {}

  /**
   * Replaces the game's final list with this paste. Without a `gameId` the
   * game is the one now waiting for its final list. A malformed paste throws
   * before anything is written.
   */
  paste(
    text: string,
    gameId?: number,
    now: Date = new Date()
  ): FinalPasteResult {
    const game = this.targetGame(gameId, now);
    const teamLines = this.teamParser.splitByTeam(text);
    const matcher = this.lines.matcher();
    const names = this.lines.names();

    const attendees = new Map<number, Attendee>();
    const unresolved: FinalUnresolved[] = [];
    for (const { team, line, position } of teamLines) {
      const parsed = this.lineParser.parse(line, position);
      const found = this.matchLine(parsed, matcher, names);
      if ('entry' in found) {
        unresolved.push({ ...found.entry, team });
        continue;
      }
      const seen = attendees.get(found.playerId);
      if (seen) {
        seen.companions += found.companion ? 1 : 0;
      } else {
        attendees.set(found.playerId, {
          position,
          team,
          playerId: found.playerId,
          companions: found.companion ? 1 : 0,
        });
      }
    }

    const season = this.seasons.get(game.season_id)!;
    this.conn.transaction(() => {
      this.participations.clearFinalOutcome(game.id);
      for (const a of attendees.values()) {
        this.record(game.id, a, this.perHead(season) * (1 + a.companions));
      }
      this.reconcileExclusions(game.id, attendees);
      if (unresolved.length === 0)
        this.games.update(game.id, { status: 'played' });
    })();

    return {
      game: this.games.get(game.id)!,
      matched: [...attendees.values()].map(a =>
        this.describe(game, a, this.perHead(season) * (1 + a.companions), names)
      ),
      unresolved,
    };
  }

  /**
   * Settles one unresolved line and stores just that line; the rest of the
   * game's final list stays as it is.
   */
  resolve(
    gameId: number,
    entry: Pick<FinalUnresolved, 'line' | 'field' | 'team'>,
    action: ResolveAction
  ): FinalResolveResult {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Unknown game: ${gameId}`);

    const settled = this.lines.settle(entry, this.withHost(entry, action));
    if (!settled.settled) {
      return {
        outcome: 'unresolved',
        entry: { ...settled.entry, team: entry.team },
      };
    }

    const season = this.seasons.get(game.season_id)!;
    const perHead = this.perHead(season);
    const companion = entry.line.kind === 'plusOne';
    const existing = this.participations
      .list(gameId)
      .find(p => p.player_id === settled.playerId);
    const alreadyBilled = existing && existing.played ? existing.paid_cents : 0;
    const attendee: Attendee = {
      position: entry.line.position,
      team: entry.team,
      playerId: settled.playerId,
      companions:
        (existing?.played ? existing.guests : 0) + (companion ? 1 : 0),
    };
    const paid = (alreadyBilled || perHead) + (companion ? perHead : 0);

    this.conn.transaction(() => {
      this.record(gameId, attendee, paid);
      const frozen = this.exclusions
        .frozenOutcomes(gameId)
        .get(settled.playerId);
      if (frozen === 'excluded' || frozen === 'demoted') {
        this.exclusions.set(gameId, settled.playerId, null);
      }
      this.games.update(gameId, { status: 'played' });
    })();

    return {
      outcome: 'resolved',
      participant: this.describe(game, attendee, paid, this.lines.names()),
    };
  }

  private targetGame(gameId: number | undefined, now: Date): GameRow {
    if (gameId !== undefined) {
      const game = this.games.get(gameId);
      if (!game) throw new Error(`Unknown game: ${gameId}`);
      return game;
    }
    const game = this.target.resolve(now);
    if (!game)
      throw new Error('No hay ningún partido esperando su lista final');
    return game;
  }

  /** Match a parsed line; a plus-one resolves to its host and adds a companion. */
  private matchLine(
    line: ParsedLine,
    matcher: ReturnType<LineResolver['matcher']>,
    names: Map<number, string>
  ): { playerId: number; companion: boolean } | { entry: UnresolvedEntry } {
    // A host annotation is only used when someone new is registered, never to match.
    const spelled = line.kind === 'plusOne' ? line.hostName : line.name;
    const found = matcher.match(spelled);
    if (found.outcome !== 'matched') {
      return {
        entry: this.lines.unresolved(
          line,
          line.kind === 'plusOne' ? 'host' : 'name',
          found,
          names
        ),
      };
    }
    return { playerId: found.playerId, companion: line.kind === 'plusOne' };
  }

  /** For a new player named with a host, the host introduces them unless told otherwise. */
  private withHost(
    entry: Pick<FinalUnresolved, 'line' | 'field'>,
    action: ResolveAction
  ): ResolveAction {
    if (
      action.type !== 'register' ||
      action.introducedBy !== undefined ||
      entry.line.kind !== 'hostAnnotated'
    ) {
      return action;
    }
    const host = this.lines.matcher().match(entry.line.hostName);
    return host.outcome === 'matched'
      ? { ...action, introducedBy: host.playerId }
      : action;
  }

  private record(gameId: number, a: Attendee, paidCents: number): void {
    this.participations.set(gameId, a.playerId, {
      signed_up: true,
      played: true,
      team: a.team,
      paid_cents: paidCents,
      guests: a.companions,
    });
  }

  /**
   * An exclusion point stands only while its player did not play. Derived
   * from the frozen selection each time, so correcting a list can bring a
   * point back as well as take it away.
   */
  private reconcileExclusions(
    gameId: number,
    attendees: Map<number, Attendee>
  ): void {
    for (const [playerId, outcome] of this.exclusions.frozenOutcomes(gameId)) {
      if (outcome !== 'excluded' && outcome !== 'demoted') continue;
      const kind: ExclusionKind = outcome === 'excluded' ? 'points' : 'demoted';
      this.exclusions.set(
        gameId,
        playerId,
        attendees.has(playerId) ? null : kind
      );
    }
  }

  private perHead(season: { price_cents: number; slots: number }): number {
    return Math.round(season.price_cents / season.slots);
  }

  private describe(
    game: GameRow,
    a: Attendee,
    paidCents: number,
    names: Map<number, string>
  ): FinalParticipant {
    const base: FinalParticipant = {
      position: a.position,
      team: a.team,
      playerId: a.playerId,
      name: names.get(a.playerId) ?? '',
      companions: a.companions,
      paidCents,
    };
    if (this.players.hasAppeared(game.season_id, a.playerId)) return base;
    return {
      ...base,
      seniorityPrompt: true,
      suggested: this.players.suggestSeniority(game.season_id, a.playerId),
    };
  }
}
