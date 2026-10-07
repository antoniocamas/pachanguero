import type { CandidateLineParser } from '../domain/candidate-line-parser.js';
import type { Team, TeamListParser } from '../domain/team-list-parser.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import type {
  LineResolver,
  ResolveAction,
  UnresolvedEntry,
} from './line-resolver.js';
import type {
  TeamAssignment,
  TeamAssignmentService,
} from './team-assignment-service.js';

export interface PastedTeamMember {
  position: number;
  team: Team;
  playerId: number;
  name: string;
}

export interface TeamUnresolved extends UnresolvedEntry {
  team: Team;
}

export interface TeamPasteResult {
  /** Members of the convocatoria who now have the team of their line. */
  matched: PastedTeamMember[];
  /** Known players who were not in the convocatoria: kept as text, no team. */
  outside: PastedTeamMember[];
  /** Names that matched nobody or several: kept as text, stored nowhere. */
  unresolved: TeamUnresolved[];
  /** `X +1` lines name no one with a row of their own. */
  ignored: Array<{ position: number; team: Team; text: string }>;
}

export type TeamResolveResult =
  | { outcome: 'assigned'; member: PastedTeamMember }
  | { outcome: 'unresolved'; entry: TeamUnresolved };

/** Turns two pasted team lists into team assignments, line by line. */
export class TeamPasteService {
  constructor(
    private readonly lifecycle: GameLifecycleService,
    private readonly assignments: TeamAssignmentService,
    private readonly lines: LineResolver,
    private readonly teamParser: TeamListParser,
    private readonly lineParser: CandidateLineParser
  ) {}

  /** Replaces the game's teams with the members this paste names. */
  paste(gameId: number, text: string): TeamPasteResult {
    this.lifecycle.require(gameId, 'teams');
    const matcher = this.lines.matcher();
    const names = this.lines.names();
    const result: TeamPasteResult = {
      matched: [],
      outside: [],
      unresolved: [],
      ignored: [],
    };
    const seen = new Set<number>();
    for (const { team, line, position } of this.teamParser.splitByTeam(text)) {
      const parsed = this.lineParser.parse(line, position);
      if (parsed.kind === 'plusOne') {
        result.ignored.push({ position, team, text: line });
        continue;
      }
      const found = matcher.match(parsed.name);
      if (found.outcome !== 'matched') {
        result.unresolved.push({
          ...this.lines.unresolved(parsed, 'name', found, names),
          team,
        });
        continue;
      }
      if (seen.has(found.playerId)) continue;
      seen.add(found.playerId);
      const member = {
        position,
        team,
        playerId: found.playerId,
        name: names.get(found.playerId) ?? '',
      };
      (this.assignments.isMember(gameId, found.playerId)
        ? result.matched
        : result.outside
      ).push(member);
    }
    this.assignments.assign(
      gameId,
      result.matched.map<TeamAssignment>(m => ({
        playerId: m.playerId,
        team: m.team,
      }))
    );
    return result;
  }

  /**
   * Settles one unresolved line by choosing a member for it; the other teams
   * stay as they are. A new player cannot be registered from here.
   */
  resolve(
    gameId: number,
    entry: Pick<TeamUnresolved, 'line' | 'field' | 'team'>,
    action: ResolveAction
  ): TeamResolveResult {
    this.lifecycle.require(gameId, 'teams');
    if (action.type === 'register')
      throw new Error(
        'Aquí solo se puede elegir un jugador de la convocatoria'
      );
    this.assignments.requireMember(gameId, action.playerId);
    const settled = this.lines.settle(entry, action);
    if (!settled.settled)
      return {
        outcome: 'unresolved',
        entry: { ...settled.entry, team: entry.team },
      };
    this.assignments.assignOne(gameId, {
      playerId: settled.playerId,
      team: entry.team,
    });
    return {
      outcome: 'assigned',
      member: {
        position: entry.line.position,
        team: entry.team,
        playerId: settled.playerId,
        name: this.lines.names().get(settled.playerId) ?? '',
      },
    };
  }
}
