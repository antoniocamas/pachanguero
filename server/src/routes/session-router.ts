import { Router, type Request } from 'express';
import type { AuthService } from '../repo/auth-service.js';
import {
  PasswordChangeError,
  type PasswordChangeService,
} from '../repo/password-change-service.js';
import type { Authenticate } from './authenticate.js';
import type { CookieJar } from './cookie-jar.js';
import { HttpError, type HttpErrorHandler } from './http-error.js';

const MAX_FIELD = 1024;

/** The routes any signed-in user may call, whatever their role or view. */
export class SessionRouter {
  constructor(
    private readonly authenticate: Authenticate,
    private readonly auth: AuthService,
    private readonly passwords: PasswordChangeService,
    private readonly cookies: CookieJar,
    private readonly errors: HttpErrorHandler
  ) {}

  router(): Router {
    const router = Router();
    router.use(['/me/password', '/auth/view'], (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    });
    router.put('/me/password', async (req, res) => {
      const { current, next, confirm } = this.passwordFields(req);
      const { userId } = this.authenticate.principalOf(res);
      try {
        await this.passwords.change(userId, current, next, confirm);
      } catch (err) {
        if (err instanceof PasswordChangeError) {
          throw new HttpError(
            422,
            err.message,
            err.rules.length ? { rules: err.rules } : {}
          );
        }
        throw err;
      }
      res.status(204).end();
    });
    router.post('/auth/view', async (req, res) => {
      const { view } = (req.body ?? {}) as Record<string, unknown>;
      if (view !== 'admin' && view !== 'regular') {
        throw new HttpError(400, 'Vista no válida');
      }
      const { userId } = this.authenticate.principalOf(res);
      res.json(
        await this.auth.switchView(userId, view, this.cookies.read(req))
      );
    });
    router.use(this.errors.handler());
    return router;
  }

  private passwordFields(req: Request) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fields = [body.current, body.next, body.confirm];
    if (
      !fields.every(
        f => typeof f === 'string' && f !== '' && f.length <= MAX_FIELD
      )
    ) {
      throw new HttpError(400, 'Faltan las contraseñas');
    }
    const [current, next, confirm] = fields as string[];
    return { current, next, confirm };
  }
}
