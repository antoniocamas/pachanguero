import type { NextFunction, Request, Response } from 'express';
import type { UserRepository } from '../repo/user-repository.js';
import type { Authenticate } from './authenticate.js';

/**
 * Finds the player a signed-in user is, from the token alone: no route takes a player id from
 * the path, the query or the body, so asking for someone else's data is not expressible.
 */
export class OwnPlayer {
  constructor(
    private readonly authenticate: Authenticate,
    private readonly users: UserRepository
  ) {}

  middleware() {
    return (_req: Request, res: Response, next: NextFunction) => {
      const { userId } = this.authenticate.principalOf(res);
      const playerId = this.users.byId(userId)?.playerId ?? null;
      if (playerId === null) {
        res.status(403).json({ error: 'No tienes un jugador asociado' });
        return;
      }
      res.locals.ownPlayerId = playerId;
      next();
    };
  }

  /** The one reader of the id stored by `middleware()`. */
  playerOf(res: Response): number {
    return res.locals.ownPlayerId as number;
  }
}
