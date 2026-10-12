import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from './domain/clock.js';
import { LockoutPolicy } from './domain/lockout-policy.js';
import type { PasswordHasher } from './domain/password-hasher.js';
import { TokenService } from './domain/token-service.js';
import { ContactValidator } from './domain/contact-validator.js';
import { PasswordPolicy } from './domain/password-policy.js';
import { db } from './db/index.js';
import type { AuthConfig } from './repo/auth-config.js';
import { AuthService } from './repo/auth-service.js';
import { ContactRepository } from './repo/contact-repository.js';
import { ContactService } from './repo/contact-service.js';
import { OwnDataService } from './repo/own-data-service.js';
import { PasswordChangeService } from './repo/password-change-service.js';
import {
  debtRepository,
  paymentRepository,
  playerReport,
  players,
  refreshTokens,
  users,
} from './repo/index.js';
import { api } from './routes/api.js';
import { ApiRoutes } from './routes/api-routes.js';
import { AuthRouter } from './routes/auth-router.js';
import { Authenticate } from './routes/authenticate.js';
import { CookieJar } from './routes/cookie-jar.js';
import { HttpErrorHandler } from './routes/http-error.js';
import { OwnPlayer } from './routes/own-player.js';
import { OwnRouter } from './routes/own-router.js';
import { SecurityHeaders } from './routes/security-headers.js';
import { SessionRouter } from './routes/session-router.js';

/** The whole web server: builds the sign-in and guard classes and mounts the API and the SPA. */
export class ServerApp {
  readonly tokens: TokenService;
  readonly auth: AuthService;
  readonly authenticate: Authenticate;
  readonly routes: ApiRoutes;

  /** `webDist` is the built SPA to serve, or null for an API-only server. */
  constructor(
    config: AuthConfig,
    clock: Clock,
    hasher: PasswordHasher,
    private readonly webDist: string | null
  ) {
    this.tokens = new TokenService(
      config.secretBytes(),
      config.accessSeconds,
      config.refreshSeconds
    );
    this.auth = new AuthService(
      users,
      refreshTokens,
      players,
      hasher,
      this.tokens,
      new LockoutPolicy(),
      clock,
      config,
      db()
    );
    this.authenticate = new Authenticate(this.tokens, clock);
    const cookies = new CookieJar();
    const errors = new HttpErrorHandler();
    const contacts = new ContactService(
      new ContactValidator(),
      new ContactRepository(db()),
      db()
    );
    this.routes = new ApiRoutes(
      new AuthRouter(this.auth, cookies, config, errors).router(),
      new SessionRouter(
        this.authenticate,
        this.auth,
        new PasswordChangeService(
          users,
          refreshTokens,
          hasher,
          new PasswordPolicy(),
          db()
        ),
        cookies,
        errors
      ).router(),
      new OwnRouter(
        new OwnPlayer(this.authenticate, users),
        new OwnDataService(
          debtRepository,
          paymentRepository,
          playerReport,
          clock
        ),
        contacts,
        errors
      ).router(),
      api,
      this.authenticate
    );
  }

  build(): Express {
    const app = express();
    app.disable('x-powered-by');
    app.use(new SecurityHeaders().middleware());
    app.use(express.json());
    app.use('/api', this.routes.router());

    // Serve the built SPA when it exists, so the Pi runs a single process on a
    // single port and Caddy only has to reverse-proxy one upstream.
    const webDist = this.webDist;
    if (webDist !== null && existsSync(webDist)) {
      app.use(express.static(webDist));
      app.get(/^(?!\/api\/).*/, (_req, res) =>
        res.sendFile(join(webDist, 'index.html'))
      );
    }
    return app;
  }
}
