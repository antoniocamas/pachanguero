import { Router } from 'express';
import type { Authenticate } from './authenticate.js';

/**
 * Decides, by which router holds a route, who may call it. Mount order is the whole rule:
 * routes that need no token, then the guard, then routes any signed-in user may call, then
 * the player's own routes (acting as a regular user), then the organiser's routes (acting as
 * an admin). A path nobody declared falls through to the last guard, so it is refused (401,
 * 403) or unknown (404 for an admin) without anyone having to remember to protect it.
 */
export class ApiRoutes {
  constructor(
    readonly publicRouter: Router,
    readonly sessionRouter: Router,
    readonly ownRouter: Router,
    readonly adminRouter: Router,
    private readonly authenticate: Authenticate
  ) {}

  router(): Router {
    const router = Router();
    router.use(this.publicRouter);
    router.use(this.authenticate.middleware());
    router.use(this.sessionRouter);
    router.use(
      '/me',
      this.authenticate.requireEffective('regular'),
      this.ownRouter
    );
    router.use(this.authenticate.requireEffective('admin'), this.adminRouter);
    return router;
  }
}
