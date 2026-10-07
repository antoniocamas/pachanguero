import type { CandidateResolutionService } from './candidate-resolution-service.js';
import type { ConvocatoriaService } from './convocatoria-service.js';
import type { DebtRepository } from './debt-repository.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import type { GameRepository } from './game-repository.js';
import type { ParticipationRepository } from './participation-repository.js';
import type { PaymentRepository } from './payment-repository.js';
import type { StandingsService } from './standings-service.js';

/** Where a signed-up line arrived in the candidate list, and whose it is. */
export interface Arrival {
  position: number;
  playerId: number | null;
  hostPlayerId: number | null;
  guest: 'named' | 'anonymous' | null;
  text: string;
}

/** Everything the game screen shows for one game, read in one go. */
export class GameViewService {
  constructor(
    private readonly games: GameRepository,
    private readonly lifecycle: GameLifecycleService,
    private readonly participations: ParticipationRepository,
    private readonly convocatorias: ConvocatoriaService,
    private readonly debts: DebtRepository,
    private readonly payments: PaymentRepository,
    private readonly candidates: CandidateResolutionService,
    private readonly standings: StandingsService
  ) {}

  /** The game's detail, or null when there is no such game. */
  view(gameId: number) {
    const game = this.games.get(gameId);
    if (!game) return null;
    return {
      game,
      ...this.lifecycle.describe(gameId),
      participations: this.participations.list(gameId),
      convocatoria: this.convocatorias.saved(gameId),
      debts: this.debts.list(gameId),
      payments: this.payments.list(gameId),
      arrivals: this.arrivals(gameId),
      points: this.pointsAsOf(game.season_id, gameId),
    };
  }

  /** The matched lines of the saved candidate list, in the order they arrived. */
  private arrivals(gameId: number): Arrival[] {
    return this.candidates.load(gameId).flatMap(row =>
      row.status === 'matched'
        ? [
            {
              position: row.position,
              playerId: row.candidate.playerId,
              hostPlayerId: row.candidate.hostPlayerId,
              guest: row.candidate.guest,
              text: row.text,
            },
          ]
        : []
    );
  }

  /** What each player had as of this game: the numbers the selection sees. */
  private pointsAsOf(seasonId: number, gameId: number): Record<number, number> {
    return Object.fromEntries(
      this.standings
        .standings(seasonId, gameId)
        .map(s => [s.playerId, s.points])
    );
  }
}
