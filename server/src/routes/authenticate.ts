import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { EffectiveRole } from '../domain/effective-role.js';
import type { Clock } from '../domain/clock.js';
import type { TokenService } from '../domain/token-service.js';
import type { Role, View } from '../domain/types.js';

/** Who is asking, as the access token says. */
export interface Principal {
  userId: number;
  role: Role;
  view: View;
  effective: Role;
}

/** The guard: checks the access token of a request and decides who may pass. */
export class Authenticate {
  constructor(
    private readonly tokens: TokenService,
    private readonly clock: Clock
  ) {}

  /** Refuses (401) a request without a valid access token; otherwise records who is asking. */
  middleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const token = this.bearer(req);
      try {
        if (!token) throw new Error('no token');
        const claims = await this.tokens.verifyAccess(token, this.clock.now());
        const principal: Principal = {
          ...claims,
          effective: new EffectiveRole(claims.role, claims.view).value(),
        };
        res.locals.principal = principal;
        next();
      } catch {
        res.status(401).json({ error: 'No autorizado' });
      }
    };
  }

  /** Lets through only a request that acts as `role` right now (403 otherwise). */
  requireEffective(role: Role): RequestHandler {
    return (_req: Request, res: Response, next: NextFunction) => {
      if (this.principalOf(res).effective === role) next();
      else res.status(403).json({ error: 'Prohibido' });
    };
  }

  /** The one typed reader of who is asking; only valid after `middleware()` has passed. */
  principalOf(res: Response): Principal {
    return res.locals.principal as Principal;
  }

  private bearer(req: Request): string | undefined {
    const match = /^bearer +(\S+)$/i.exec(req.headers.authorization ?? '');
    return match?.[1];
  }
}
