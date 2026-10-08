import { GuestOrdinals, type GuestLine } from '../domain/guest-ordinals.js';
import type { MemberKey } from '../domain/types.js';
import type { ConvocatoriaEditService } from './convocatoria-edit-service.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import type Database from 'better-sqlite3';
import type { NameMatch, NameMatcher } from '../domain/name-matcher.js';
import type {
  CandidateLineParser,
  ParsedLine,
} from '../domain/candidate-line-parser.js';
import { LocalCalendar } from '../domain/local-calendar.js';
import type { AliasRepository } from './alias-repository.js';
import type {
  CandidateLine,
  CandidateLineRepository,
  CandidateLinks,
} from './candidate-line-repository.js';
import type { GameDayResolutionService } from './game-day-resolution-service.js';
import type { GameRepository, GameRow } from './game-repository.js';
import type { GuestCandidateRepository } from './guest-candidate-repository.js';
import type { ParticipationRepository } from './participation-repository.js';
import type { PlayerRegistrar } from './player-registrar.js';
import type { PlayerRepository } from './player-repository.js';
import {
  LineResolver,
  type ResolveAction,
  type UnresolvedEntry,
} from './line-resolver.js';

export type { ResolveAction, UnresolvedEntry };
export type { CandidateLine, CandidateLinks };

export interface MatchedCandidate {
  position: number;
  playerId: number | null;
  name: string | null;
  /** Who a guest came with; null for a regular. */
  hostPlayerId: number | null;
  guest: 'named' | 'anonymous' | null;
  /** First time this season: the organiser has to say how many seasons they have. */
  seniorityPrompt?: true;
  suggested?: number;
}

/** One line of the candidate list and what the current players make of it. */
export type CandidateRow =
  | {
      position: number;
      text: string;
      links?: CandidateLinks;
      introduced?: true;
      status: 'matched';
      /** The line as read, so a wrong match can be corrected. */
      line: ParsedLine;
      candidate: MatchedCandidate;
    }
  | {
      position: number;
      text: string;
      links?: CandidateLinks;
      introduced?: true;
      status: 'unresolved';
      entry: UnresolvedEntry;
    };

export type ResolveResult =
  | { outcome: 'resolved'; playerId: number }
  | { outcome: 'unresolved'; entry: UnresolvedEntry };

/** A line whose players are all settled, ready to persist. */
interface ResolvedLine {
  line: ParsedLine;
  playerId: number | null;
  hostPlayerId: number | null;
}

interface GuestRow {
  player_id: number | null;
  host_player_id: number;
}

/** A row of the list plus what saving it would store. */
interface ReadLine {
  row: CandidateRow;
  resolved?: ResolvedLine;
  guest?: GuestRow;
}

/**
 * The candidate list of a game, as the organiser edits and saves it. Lines
 * are plain text read against the players known right now: a name that cannot
 * be matched is never guessed, it stays an unresolved row until the organiser
 * settles it with `resolve`. Only `save` touches sign-ups and guests.
 */
export class CandidateResolutionService {
  private readonly calendar = new LocalCalendar();
  private readonly lines: LineResolver;

  constructor(
    private readonly games: GameRepository,
    private readonly gameDay: GameDayResolutionService,
    private readonly players: PlayerRepository,
    aliases: AliasRepository,
    private readonly participations: ParticipationRepository,
    private readonly guests: GuestCandidateRepository,
    private readonly saved: CandidateLineRepository,
    private readonly parser: CandidateLineParser,
    registrar: PlayerRegistrar,
    private readonly lifecycle: GameLifecycleService,
    private readonly edits: ConvocatoriaEditService,
    private readonly conn: Database.Database
  ) {
    this.lines = new LineResolver(players, aliases, registrar);
  }

  /**
   * The game a list belongs to: the one given by id, or for `next` the next
   * game day on or after today, created from the weekly schedule if it does
   * not exist yet.
   */
  target(ref: string, now: Date = new Date()): number {
    if (ref === 'next') {
      return this.gameDay.resolveTarget(this.calendar.dateOf(now)).id;
    }
    if (!/^\d+$/.test(ref)) throw new Error(`Not a game: ${ref}`);
    return Number(ref);
  }

  /**
   * The saved list read afresh. A game signed up before lists were saved has
   * none, so its sign-ups stand in for it, in name order: the order they were
   * pasted in was never recorded.
   */
  load(gameId: number): CandidateRow[] {
    const game = this.requireGame(gameId);
    const saved = this.saved.list(gameId);
    return this.rows(game, saved.length ? saved : this.fromSignUps(gameId)).map(
      r => r.row
    );
  }

  /**
   * The rows a list would have: the lines already there followed by whatever
   * `paste` adds. A player listed twice appears once, in the first place.
   * Writes nothing.
   */
  preview(
    gameId: number,
    lines: readonly CandidateLine[],
    paste = ''
  ): CandidateRow[] {
    const added = this.parser.texts(paste).map(text => ({ text }));
    return this.rows(this.requireGame(gameId), [...lines, ...added]).map(
      r => r.row
    );
  }

  /** Makes this list the game's: the lines, the sign-ups and the guests. */
  save(gameId: number, lines: readonly CandidateLine[]): CandidateRow[] {
    const game = this.requireGame(gameId);
    this.lifecycle.require(gameId, 'edit_apuntados');
    const all = this.rows(game, lines);

    const signedUp = new Set<number>();
    const guestRows: GuestLine[] = [];
    for (const { resolved, guest } of all) {
      if (!resolved) continue;
      signedUp.add((resolved.playerId ?? resolved.hostPlayerId)!);
      if (guest) guestRows.push({ position: resolved.line.position, ...guest });
    }
    const members: MemberKey[] = [
      ...[...signedUp].map(playerId => ({ playerId })),
      ...new GuestOrdinals(guestRows).keys(),
    ];
    // Refused before anything is written: someone still playing cannot be dropped.
    this.edits.checkUnsign(gameId, members);

    this.conn.transaction(() => {
      this.saved.replaceAll(
        gameId,
        all.map(r => ({
          text: r.row.text,
          links: r.row.links,
          introduced: r.row.introduced,
        }))
      );
      this.participations.clearSignups(gameId);
      for (const playerId of signedUp)
        this.participations.set(gameId, playerId, { signed_up: true });
      this.guests.replaceAll(gameId, guestRows);
      this.edits.align(gameId, members);
    })();
    return all.map(r => r.row);
  }

  /**
   * Settles the name that failed to match by remembering the spelling as an
   * alias or registering someone new. The list itself is not touched; the row
   * matches the next time it is read. Choosing a player just for this line is
   * not done here: that is a link on the line.
   */
  resolve(
    gameId: number,
    entry: Pick<UnresolvedEntry, 'line' | 'field'>,
    action: ResolveAction
  ): ResolveResult {
    this.requireGame(gameId);
    if (action.type === 'link') {
      throw new Error('A link is kept on the list line, not on the players');
    }
    const typed = this.lines.settle(entry, action);
    return typed.settled
      ? { outcome: 'resolved', playerId: typed.playerId }
      : { outcome: 'unresolved', entry: typed.entry };
  }

  /**
   * Guests keep the place they arrived in, since their position decides who
   * gets the open slots; the regulars, whose order never mattered, fill the
   * rest by name.
   */
  private fromSignUps(gameId: number): CandidateLine[] {
    const names = this.lines.names();
    const guests = this.guests.list(gameId); // already by position
    const guestOf = new Map(
      guests.flatMap(g => (g.player_id === null ? [] : [[g.player_id, g]]))
    );
    const regulars = this.participations
      .list(gameId)
      .filter(p => p.signed_up && !guestOf.has(p.player_id))
      .map(p => p.name)
      .sort((a, b) => a.localeCompare(b, 'es'));
    const guestLines: CandidateLine[] = guests.map(g =>
      g.player_id === null
        ? { text: `${names.get(g.host_player_id)} +1` }
        : {
            text: `${names.get(g.player_id)} (${names.get(g.host_player_id)})`,
            introduced: true,
          }
    );

    const total = regulars.length + guestLines.length;
    const placed = new Array<CandidateLine | undefined>(total);
    let last = -1;
    guests.forEach((g, i) => {
      // Keep the stored position, but never behind an earlier guest or so far
      // along that the guests after it would not fit.
      const index = Math.min(
        Math.max(g.position - 1, last + 1),
        total - (guests.length - i)
      );
      placed[index] = guestLines[i];
      last = index;
    });
    const rest = regulars.map(text => ({ text }));
    return Array.from(placed, slot => slot ?? rest.shift()!);
  }

  private requireGame(gameId: number): GameRow {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    return game;
  }

  /** Every line read against the current players, duplicates folded away. */
  private rows(game: GameRow, lines: readonly CandidateLine[]): ReadLine[] {
    const matcher = this.lines.matcher();
    const names = this.lines.names();
    const seen = new Set<string>();
    // Who each player came with on the line that first listed them.
    const hosts = new Map<number, number | null>();
    const out: ReadLine[] = [];
    for (const { text: raw, links, introduced } of lines) {
      const position = out.length + 1;
      const text = this.parser.texts(raw)[0];
      if (text === undefined) continue;
      const line = this.parser.parse(text, position);
      const outcome = this.withoutImpostors(
        this.resolveLine(line, matcher, names, links),
        hosts,
        names,
        links
      );
      const key =
        'entry' in outcome
          ? `text:${text.toLocaleLowerCase('es')}`
          : outcome.line.line.kind === 'plusOne'
            ? null
            : `player:${outcome.line.playerId}`;
      if (key !== null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      if ('entry' in outcome) {
        out.push({
          row: {
            position,
            text,
            links,
            introduced,
            status: 'unresolved',
            entry: outcome.entry,
          },
        });
        continue;
      }
      const guest = this.guestRow(outcome.line, introduced);
      const who = outcome.line.playerId;
      if (who !== null && !hosts.has(who)) {
        hosts.set(who, outcome.line.hostPlayerId);
      }
      out.push({
        resolved: outcome.line,
        guest: guest ?? undefined,
        row: {
          position,
          text,
          links,
          introduced,
          status: 'matched',
          line: outcome.line.line,
          candidate: this.describe(game, outcome.line, names, guest),
        },
      });
    }
    return out;
  }

  /**
   * "Javi (Fer)" and "Javi (Caro)" are two people, not one Javi listed twice:
   * a name written with a host that already stands in the list with another
   * host (or none) is reported, never folded into that player. A choice the
   * organiser made on the line is respected.
   */
  private withoutImpostors(
    outcome: { line: ResolvedLine } | { entry: UnresolvedEntry },
    hosts: ReadonlyMap<number, number | null>,
    names: Map<number, string>,
    links?: CandidateLinks
  ): { line: ResolvedLine } | { entry: UnresolvedEntry } {
    if (!('line' in outcome)) return outcome;
    const { line, playerId, hostPlayerId } = outcome.line;
    if (
      line.kind !== 'hostAnnotated' ||
      playerId === null ||
      links?.name !== undefined ||
      !hosts.has(playerId) ||
      hosts.get(playerId) === hostPlayerId
    ) {
      return outcome;
    }
    return {
      entry: {
        line,
        field: 'name',
        reason: 'duplicate',
        candidates: [{ id: playerId, name: names.get(playerId) ?? '' }],
      },
    };
  }

  private resolveLine(
    line: ParsedLine,
    matcher: NameMatcher,
    names: Map<number, string>,
    links?: CandidateLinks
  ): { line: ResolvedLine } | { entry: UnresolvedEntry } {
    const read = (spelled: string, chosen?: number): NameMatch =>
      chosen !== undefined && names.has(chosen)
        ? { outcome: 'matched', playerId: chosen }
        : matcher.match(spelled);
    let playerId: number | null = null;
    if (line.kind !== 'plusOne') {
      const name = read(line.name, links?.name);
      if (name.outcome !== 'matched') {
        return { entry: this.lines.unresolved(line, 'name', name, names) };
      }
      playerId = name.playerId;
    }
    let hostPlayerId: number | null = null;
    if (line.kind !== 'plain') {
      const host = read(line.hostName, links?.host);
      if (host.outcome !== 'matched') {
        return { entry: this.lines.unresolved(line, 'host', host, names) };
      }
      hostPlayerId = host.playerId;
    }
    return { line: { line, playerId, hostPlayerId } };
  }

  /**
   * A guest row for an anonymous plus-one, or for a name this very line
   * registered as its host's guest; a known player written with a host is a
   * regular like any other.
   */
  private guestRow(r: ResolvedLine, introduced?: true): GuestRow | null {
    if (r.line.kind === 'plusOne') {
      return { player_id: null, host_player_id: r.hostPlayerId! };
    }
    if (r.line.kind === 'hostAnnotated' && introduced) {
      return { player_id: r.playerId, host_player_id: r.hostPlayerId! };
    }
    return null;
  }

  /** Asks for seniority the first time a player appears in the game's season. */
  private seniorityPrompt(
    game: GameRow,
    playerId: number | null
  ): Pick<MatchedCandidate, 'seniorityPrompt' | 'suggested'> {
    if (playerId === null) return {};
    if (this.players.hasAppeared(game.season_id, playerId)) return {};
    return {
      seniorityPrompt: true,
      suggested: this.players.suggestSeniority(game.season_id, playerId),
    };
  }

  private describe(
    game: GameRow,
    r: ResolvedLine,
    names: Map<number, string>,
    row: GuestRow | null
  ): MatchedCandidate {
    return {
      ...this.seniorityPrompt(game, r.playerId),
      position: r.line.position,
      playerId: r.playerId,
      name: r.playerId === null ? null : (names.get(r.playerId) ?? null),
      hostPlayerId: row ? row.host_player_id : null,
      guest: row ? (row.player_id === null ? 'anonymous' : 'named') : null,
    };
  }
}
