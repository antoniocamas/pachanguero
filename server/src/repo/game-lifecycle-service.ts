import type Database from 'better-sqlite3';
import type { GameLifecycle } from '../domain/game-lifecycle.js';
import type { Capability, GameAction, GameState } from '../domain/types.js';
import type { DebtRepository } from './debt-repository.js';
import type { GameRepository, GameRow } from './game-repository.js';

/** Something that must follow a game entering or leaving the played state. */
export interface PlayedEffect {
  apply(game: GameRow): void;
  retract(game: GameRow): void;
}

/** Moves games through their states, with the effects that ride on being played. */
export class GameLifecycleService {
  constructor(
    private readonly games: GameRepository,
    private readonly lifecycle: GameLifecycle,
    private readonly debts: DebtRepository,
    private readonly effects: readonly PlayedEffect[],
    private readonly conn: Database.Database
  ) {}

  /**
   * Apply `action` to a game: `work` (if any) and the state write happen in one
   * transaction, and entering or leaving `played` runs the played effects.
   * Anything that throws leaves the game exactly as it was.
   */
  perform(
    gameId: number,
    action: GameAction,
    work?: (game: GameRow) => void
  ): GameState {
    const game = this.get(gameId);
    const next = this.lifecycle.next(
      { status: game.status, cancelledFrom: game.cancelled_from },
      action
    );
    this.conn.transaction(() => {
      work?.(game);
      this.games.setState(gameId, next.status, next.cancelledFrom);
      const wasPlayed = game.status === 'played';
      const isPlayed = next.status === 'played';
      if (isPlayed && !wasPlayed)
        for (const effect of this.effects) effect.apply(game);
      if (wasPlayed && !isPlayed)
        for (const effect of this.effects) effect.retract(game);
    })();
    return next.status;
  }

  /** Throws the capability's refusal when the game's state does not allow it. */
  require(gameId: number, capability: Capability): void {
    this.lifecycle.require(this.get(gameId).status, capability);
  }

  describe(gameId: number): { state: GameState; nextAction: string | null } {
    const { status } = this.get(gameId);
    return {
      state: status,
      nextAction: this.lifecycle.nextAction(
        status,
        this.debts.anyOutstanding(gameId)
      ),
    };
  }

  private get(gameId: number): GameRow {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`No game ${gameId}`);
    return game;
  }
}
