import type Database from 'better-sqlite3';
import type { BizumHandlingRepository } from './bizum-handling-repository.js';
import type { BizumResolutionService } from './bizum-resolution-service.js';
import type { DebtRepository } from './debt-repository.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import type { GameRepository } from './game-repository.js';
import type { PlayerRepository } from './player-repository.js';

/**
 * Moves a share to another holder: a player who pays for someone else (a regular paying a
 * friend's share, say, with one Bizum for three) answers for that share from then on, and a
 * Bizum of theirs can pay it. The share stays the beneficiary's: their paid game and points
 * follow when it is paid. An anonymous plus-one is named by its host, so it cannot move.
 * A waiting Bizum the move makes payable is judged again, as when a game is played.
 */
export class DebtHolderService {
  constructor(
    private readonly lifecycle: GameLifecycleService,
    private readonly games: GameRepository,
    private readonly debts: DebtRepository,
    private readonly players: PlayerRepository,
    private readonly handling: BizumHandlingRepository,
    private readonly resolution: BizumResolutionService,
    private readonly conn: Database.Database
  ) {}

  reassign(gameId: number, debtId: number, holderId: number): void {
    this.lifecycle.require(gameId, 'pay');
    const debt = this.debts.get(debtId);
    if (!debt || debt.game_id !== gameId)
      throw new Error('Esa deuda no es de este partido');
    if (debt.beneficiary_player_id === null)
      throw new Error('La cuota de un +1 la paga siempre quien lo trae');
    if (!this.players.nameOf(holderId))
      throw new Error(`Unknown player: ${holderId}`);
    if (holderId === debt.holder_player_id) return;
    const game = this.games.get(gameId)!;
    this.conn.transaction(() => {
      this.debts.setHolder(debtId, holderId);
      this.resolution.reevaluate(
        this.handling
          .waitingInSeasonFrom(game.season_id, game.played_on)
          .map(waiting => waiting.bizumId)
      );
    })();
  }
}
