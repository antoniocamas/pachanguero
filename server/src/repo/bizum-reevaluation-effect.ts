import type { BizumHandlingRepository } from './bizum-handling-repository.js';
import type { BizumResolutionService } from './bizum-resolution-service.js';
import type { PlayedEffect } from './game-lifecycle-service.js';
import type { GameRow } from './game-repository.js';

/**
 * Settles what a game being played makes payable: the waiting Bizums of its season booked on or
 * after its date are judged again, oldest booking first, once its debts exist. It never
 * discards one, and it does not undo a payment when the game leaves `played`: a payment made
 * from a Bizum stays, as every payment does.
 */
export class BizumReevaluationEffect implements PlayedEffect {
  constructor(
    private readonly handling: BizumHandlingRepository,
    private readonly resolution: BizumResolutionService
  ) {}

  apply(game: GameRow): void {
    this.resolution.reevaluate(
      this.handling
        .waitingInSeasonFrom(game.season_id, game.played_on)
        .map(waiting => waiting.bizumId)
    );
  }

  retract(): void {
    // A Bizum's payments outlive the game being played.
  }
}
