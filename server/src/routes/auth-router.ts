import { Router, type Request, type Response } from 'express';
import type { AuthConfig } from '../repo/auth-config.js';
import type { AuthService, Session } from '../repo/auth-service.js';
import type { CookieJar } from './cookie-jar.js';
import { HttpError, type HttpErrorHandler } from './http-error.js';

const MAX_FIELD = 1024;

/** The three routes that need no token: they are how a token is obtained, kept alive and ended. */
export class AuthRouter {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: CookieJar,
    private readonly config: AuthConfig,
    private readonly errors: HttpErrorHandler
  ) {}

  router(): Router {
    const router = Router();
    router.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    });
    router.post('/auth/login', async (req, res) => {
      const { username, password } = this.credentials(req);
      this.send(res, await this.auth.login(username, password));
    });
    router.post('/auth/refresh', async (req, res) => {
      try {
        this.send(res, await this.auth.refresh(this.cookies.read(req) ?? ''));
      } catch (err) {
        this.cookies.clear(res);
        throw err;
      }
    });
    router.post('/auth/logout', async (req, res) => {
      await this.auth.logout(this.cookies.read(req));
      this.cookies.clear(res);
      res.status(204).end();
    });
    router.use(this.errors.handler());
    return router;
  }

  private credentials(req: Request): { username: string; password: string } {
    const { username, password } = (req.body ?? {}) as Record<string, unknown>;
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username === '' ||
      password === '' ||
      username.length > MAX_FIELD ||
      password.length > MAX_FIELD
    ) {
      throw new HttpError(400, 'Usuario y contraseña son obligatorios');
    }
    return { username, password };
  }

  private send(res: Response, session: Session): void {
    this.cookies.set(
      res,
      session.refreshToken,
      this.config.refreshSeconds,
      this.config.cookieSecure
    );
    res.json({
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    });
  }
}
