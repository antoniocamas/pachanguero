import express, { Router, type Express } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from './domain/clock.js';
import { LockoutPolicy } from './domain/lockout-policy.js';
import type { PasswordHasher } from './domain/password-hasher.js';
import { TokenService } from './domain/token-service.js';
import { ContactValidator } from './domain/contact-validator.js';
import { PasswordPolicy } from './domain/password-policy.js';
import { BankCatalogue } from './bank/bank-catalogue.js';
import { BankSetupCheck } from './bank/bank-setup-check.js';
import { EnableBankingConfig } from './bank/enable-banking-config.js';
import { EnableBankingConnector } from './bank/enable-banking-connector.js';
import { EnableBankingToken } from './bank/enable-banking-token.js';
import type { BankConnector } from './bizum/ports.js';
import { BankPoller, type Scheduler } from './bizum/bank-poller.js';
import { ConsoleReadLog } from './bizum/console-read-log.js';
import { BizumFeed } from './bizum/feed.js';
import { SqliteBankEntryLedger } from './bizum/sqlite/sqlite-bank-entry-ledger.js';
import { SqliteBizumStore } from './bizum/sqlite/sqlite-bizum-store.js';
import { SqliteFeedStateStore } from './bizum/sqlite/sqlite-feed-state-store.js';
import { SqliteUnitOfWork } from './bizum/sqlite/sqlite-unit-of-work.js';
import { TimerScheduler } from './bizum/timer-scheduler.js';
import { BizumRuleSet } from './domain/bizum-rules.js';
import { BankFeedSource } from './repo/bank-feed-source.js';
import { BizumFactsReader } from './repo/bizum-facts-reader.js';
import { BizumHandler } from './repo/bizum-handler.js';
import { BizumHandlingRepository } from './repo/bizum-handling-repository.js';
import { BizumSettlementService } from './repo/bizum-settlement-service.js';
import { PublicUrl } from './domain/public-url.js';
import { db } from './db/index.js';
import type { AuthConfig } from './repo/auth-config.js';
import { AuthService } from './repo/auth-service.js';
import { BankAuthorizationRepository } from './repo/bank-authorization-repository.js';
import {
  BankConnectionService,
  RandomStateSource,
  type StateSource,
} from './repo/bank-connection-service.js';
import { BankConnectionRepository } from './repo/bank-connection-repository.js';
import { BankSettingsRepository } from './repo/bank-settings-repository.js';
import { BankSettingsService } from './repo/bank-settings-service.js';
import { KeywordRepository } from './repo/keyword-repository.js';
import { ViewAsLogRepository } from './repo/view-as-log-repository.js';
import { ContactRepository } from './repo/contact-repository.js';
import { ContactService } from './repo/contact-service.js';
import { OwnDataService } from './repo/own-data-service.js';
import { PasswordChangeService } from './repo/password-change-service.js';
import {
  aliases,
  bizumResolution,
  debtRepository,
  paymentRepository,
  playerReport,
  players,
  refreshTokens,
  senderPairing,
  seasons,
  shareSettler,
  users,
} from './repo/index.js';
import { api } from './routes/api.js';
import { ApiRoutes } from './routes/api-routes.js';
import { AuthRouter } from './routes/auth-router.js';
import { BankAdminRouter } from './routes/bank-admin-router.js';
import { BizumAdminRouter } from './routes/bizum-admin-router.js';
import { BankCallbackRouter } from './routes/bank-callback-router.js';
import { Authenticate } from './routes/authenticate.js';
import { CookieJar } from './routes/cookie-jar.js';
import { HttpErrorHandler } from './routes/http-error.js';
import { OwnPlayer } from './routes/own-player.js';
import { OwnRouter } from './routes/own-router.js';
import { SecurityHeaders } from './routes/security-headers.js';
import { SessionRouter } from './routes/session-router.js';

/** The bank access: its settings, and the parts a test may replace. */
export interface BankSettings {
  config: EnableBankingConfig;
  publicUrl: PublicUrl;
  connector?: BankConnector;
  catalogue?: BankCatalogue;
  states?: StateSource;
  scheduler?: Scheduler;
}

/** The whole web server: builds the sign-in and guard classes and mounts the API and the SPA. */
export class ServerApp {
  readonly tokens: TokenService;
  readonly auth: AuthService;
  readonly authenticate: Authenticate;
  readonly routes: ApiRoutes;
  readonly bank: BankConnectionService;
  readonly settings: BankSettingsService;
  /** Reads the bank on a schedule once `start()` is called; nothing reads before that. */
  readonly poller: BankPoller;

  /** `webDist` is the built SPA to serve, or null for an API-only server. */
  constructor(
    config: AuthConfig,
    clock: Clock,
    hasher: PasswordHasher,
    private readonly webDist: string | null,
    bank: BankSettings = {
      config: EnableBankingConfig.of({}),
      publicUrl: PublicUrl.of(undefined),
    }
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
      db(),
      new ViewAsLogRepository(db())
    );
    this.authenticate = new Authenticate(this.tokens, clock);
    const cookies = new CookieJar();
    const errors = new HttpErrorHandler();
    const contacts = new ContactService(
      new ContactValidator(),
      new ContactRepository(db()),
      db()
    );
    const connections = new BankConnectionRepository(db());
    const settingsRepository = new BankSettingsRepository(db());
    this.settings = new BankSettingsService(
      settingsRepository,
      new KeywordRepository(db(), settingsRepository),
      connections,
      bank.catalogue ?? BankCatalogue.production(),
      clock
    );
    const connector =
      bank.connector ??
      new EnableBankingConnector(
        bank.config,
        new EnableBankingToken(
          bank.config.appId,
          bank.config.privateKey,
          clock
        ),
        clock
      );
    this.bank = new BankConnectionService(
      connector,
      new BankAuthorizationRepository(db()),
      connections,
      bank.publicUrl,
      new BankSetupCheck(bank.config, bank.publicUrl),
      this.settings,
      clock,
      bank.states ?? new RandomStateSource()
    );
    const handling = new BizumHandlingRepository(db());
    this.poller = new BankPoller(
      new BizumFeed(
        new BizumHandler(
          new BizumFactsReader(
            seasons,
            players,
            aliases,
            new ContactRepository(db()),
            debtRepository,
            new KeywordRepository(db(), settingsRepository)
          ),
          new BizumRuleSet(),
          new BizumSettlementService(shareSettler, handling, clock),
          this.settings
        ),
        new SqliteBizumStore(db(), clock),
        new SqliteBankEntryLedger(db(), clock),
        new SqliteUnitOfWork(db())
      ),
      new BankFeedSource(connector, this.settings, connections, this.bank),
      new SqliteFeedStateStore(db()),
      clock,
      bank.scheduler ?? new TimerScheduler(),
      new ConsoleReadLog()
    );
    const publicRouter = Router()
      .use(new AuthRouter(this.auth, cookies, config, errors).router())
      .use(new BankCallbackRouter(this.bank, errors).router());
    const adminRouter = Router()
      .use(
        new BankAdminRouter(
          this.bank,
          this.settings,
          this.poller,
          errors
        ).router()
      )
      .use(
        new BizumAdminRouter(bizumResolution, senderPairing, errors).router()
      )
      .use(api);
    this.routes = new ApiRoutes(
      publicRouter,
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
      adminRouter,
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
