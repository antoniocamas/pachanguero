import type Database from 'better-sqlite3';
import type { Team } from '../domain/team-list-parser.js';
import type { ConvocatoriaRepository } from './convocatoria-repository.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import type { ParticipationRepository } from './participation-repository.js';
import type { PlayerRepository } from './player-repository.js';

export interface TeamAssignment {
  playerId: number;
  team: Team;
}

/**
 * Who was on which team. It sets `team` and nothing else, however the
 * assignments were produced: a paste today, anything else tomorrow.
 */
export class TeamAssignmentService {
  constructor(
    private readonly lifecycle: GameLifecycleService,
    private readonly convocatorias: ConvocatoriaRepository,
    private readonly participations: ParticipationRepository,
    private readonly players: PlayerRepository,
    private readonly conn: Database.Database
  ) {}

  /** Replace every team of the game with these; refuses anyone not in the convocatoria. */
  assign(gameId: number, assignments: readonly TeamAssignment[]): void {
    this.lifecycle.require(gameId, 'teams');
    for (const a of assignments) this.requireMember(gameId, a.playerId);
    this.conn.transaction(() => {
      this.participations.clearTeams(gameId);
      for (const a of assignments)
        this.participations.set(gameId, a.playerId, { team: a.team });
    })();
  }

  /** Set one member's team, leaving the others as they are. */
  assignOne(gameId: number, assignment: TeamAssignment): void {
    this.lifecycle.require(gameId, 'teams');
    this.requireMember(gameId, assignment.playerId);
    this.participations.set(gameId, assignment.playerId, {
      team: assignment.team,
    });
  }

  read(gameId: number): TeamAssignment[] {
    return this.participations
      .list(gameId)
      .filter(p => p.team !== null)
      .map(p => ({ playerId: p.player_id, team: p.team! }));
  }

  /** Whether a player is playing in the game's convocatoria. */
  isMember(gameId: number, playerId: number): boolean {
    return (this.convocatorias.find(gameId)?.entries ?? []).some(
      e => e.player_id === playerId && e.playing === 1
    );
  }

  requireMember(gameId: number, playerId: number): void {
    if (!this.isMember(gameId, playerId))
      throw new Error(
        `${this.players.nameOf(playerId) ?? 'Ese jugador'} no estaba en la convocatoria`
      );
  }
}
