import { randomBytes, randomUUID } from 'node:crypto';
import express, { type Express, type Request, type Response } from 'express';
import type { Server } from 'node:http';
import { importSPKI, jwtVerify, type CryptoKey } from 'jose';
import type { BankRef, Clock, RawEntry } from '../../bizum/ports.js';
import type { FakeAccountTemplate } from './fake-fixtures.js';

/** What a test (or the end-to-end run, over HTTP) can do to the fake bank. */
export interface FakeControl {
  addEntry(entry: RawEntry): void;
  removeEntry(reference: string): void;
  /** The next consent ends in a refusal instead of an approval. */
  denyNext(): void;
  /** Ends sessions by passing their validity; every session when none is named. */
  expire(sessionId?: string): void;
  /** Ends sessions as the bank revoking them; every session when none is named. */
  revoke(sessionId?: string): void;
  /** The next `count` reads of entries answer with the rate limit. */
  rateLimitNext(count: number): void;
  /** Moves the fake's own time forward: session validity, codes' lifetime. */
  advance(ms: number): void;
  /** Plays the browser at the bank's consent page: where it would be sent back to. */
  approve(consentUrl: string): Promise<{
    state: string | null;
    code: string | null;
    error: string | null;
  }>;
}

export interface FakeEnableBankingOptions {
  appId: string;
  /** SPKI PEM of the key whose private half signs the application's tokens. */
  publicKeyPem: string;
  /** The redirect addresses the application registered; matched exactly. */
  registeredRedirects: readonly string[];
  /** Real time for tokens; the fake's own offset (see `advance`) applies to sessions only. */
  clock: Clock;
  accounts: readonly FakeAccountTemplate[];
  /** Enable Banking-shaped entries of the first account. */
  entries: readonly RawEntry[];
  banks?: readonly BankRef[];
}

/** The body of `POST /auth`, as far as the fake reads it. */
interface AuthBody {
  redirect_url?: unknown;
  aspsp?: { name?: unknown; country?: unknown };
  state?: unknown;
  access?: { valid_until?: unknown };
}

interface Consent {
  redirectUrl: string;
  state: string;
  validUntil: Date;
}

interface Session {
  validUntil: Date;
  status: 'AUTHORIZED' | 'CLOSED' | 'REVOKED';
  uids: string[];
}

class FakeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code
  ) {
    super(message);
  }
}

/**
 * The part of the Enable Banking API the application calls, on a loopback port, so the real
 * connector runs over HTTP with no network. It copies what the Mock bank was seen to do: pages of
 * 100 with a continuation key, newest first, `date_from` inclusive, exact redirect addresses, a
 * session that still reads `AUTHORIZED` after its validity passed.
 */
export class FakeEnableBankingServer implements FakeControl {
  static readonly PAGE_SIZE = 100;
  static readonly CODE_SECONDS = 60;

  private readonly app: Express = express();
  private server: Server | null = null;
  private key: CryptoKey | null = null;
  private offsetMs = 0;
  private denials = 0;
  private rateLimits = 0;

  private readonly consents = new Map<string, Consent>();
  private readonly codes = new Map<
    string,
    { consentId: string; issuedAt: Date; used: boolean }
  >();
  private readonly sessions = new Map<string, Session>();
  private readonly accountOfUid = new Map<
    string,
    { sessionId: string; template: FakeAccountTemplate }
  >();
  private entries: RawEntry[];

  constructor(private readonly options: FakeEnableBankingOptions) {
    this.entries = [...options.entries];
    this.routes();
  }

  async start(port = 0): Promise<string> {
    this.server = await new Promise<Server>(resolve => {
      const listening = this.app.listen(port, '127.0.0.1', () =>
        resolve(listening)
      );
    });
    return this.baseUrl();
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (server === null) return;
    this.server = null;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }

  baseUrl(): string {
    const address = this.server?.address();
    if (
      address === null ||
      address === undefined ||
      typeof address === 'string'
    ) {
      throw new Error('The fake bank is not listening');
    }
    return `http://127.0.0.1:${address.port}`;
  }

  addEntry(entry: RawEntry): void {
    this.entries.unshift(entry);
  }

  removeEntry(reference: string): void {
    this.entries = this.entries.filter(e => e.entry_reference !== reference);
  }

  denyNext(): void {
    this.denials++;
  }

  expire(sessionId?: string): void {
    for (const session of this.pick(sessionId)) session.validUntil = this.now();
  }

  revoke(sessionId?: string): void {
    for (const session of this.pick(sessionId)) session.status = 'REVOKED';
  }

  rateLimitNext(count: number): void {
    this.rateLimits = count;
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  async approve(consentUrl: string): Promise<{
    state: string | null;
    code: string | null;
    error: string | null;
  }> {
    const response = await fetch(consentUrl, { redirect: 'manual' });
    const location = new URL(response.headers.get('location') ?? 'http://none');
    return {
      state: location.searchParams.get('state'),
      code: location.searchParams.get('code'),
      error: location.searchParams.get('error'),
    };
  }

  private pick(sessionId?: string): Session[] {
    return sessionId === undefined
      ? [...this.sessions.values()]
      : [this.sessions.get(sessionId)].filter(s => s !== undefined);
  }

  private now(): Date {
    return new Date(this.options.clock.now().getTime() + this.offsetMs);
  }

  private routes(): void {
    const app = this.app;
    app.use(express.json());
    this.controlRoutes();

    app.get('/consent/:id', (req, res) => this.consentPage(req, res));

    const api = express.Router();
    api.use((req, res, next) => {
      this.verified(req).then(() => next(), next);
    });
    api.post('/auth', (req, res) => this.auth(req, res));
    api.post('/sessions', (req, res) => this.openSession(req, res));
    api.get('/sessions/:id', (req, res) => this.sessionStatus(req, res));
    api.delete('/sessions/:id', (req, res) => this.closeSession(req, res));
    api.get('/accounts/:uid/details', (req, res) => this.details(req, res));
    api.get('/accounts/:uid/transactions', (req, res) =>
      this.transactions(req, res)
    );
    app.use(api);

    app.use(
      (
        error: unknown,
        _req: Request,
        res: Response,
        _next: express.NextFunction
      ) => {
        const failure =
          error instanceof FakeApiError
            ? error
            : new FakeApiError(500, 'INTERNAL_ERROR');
        res
          .status(failure.status)
          .json({ error: failure.code, message: failure.message });
      }
    );
  }

  private controlRoutes(): void {
    const app = this.app;
    app.get('/__control/health', (_req, res) => {
      res.status(204).end();
    });
    app.post('/__control/add-entry', (req, res) => {
      this.addEntry(req.body as RawEntry);
      res.status(204).end();
    });
    app.post('/__control/remove-entry', (req, res) => {
      this.removeEntry(String(req.body?.reference));
      res.status(204).end();
    });
    app.post('/__control/deny-next', (_req, res) => {
      this.denyNext();
      res.status(204).end();
    });
    app.post('/__control/expire', (req, res) => {
      this.expire(req.body?.sessionId);
      res.status(204).end();
    });
    app.post('/__control/revoke', (req, res) => {
      this.revoke(req.body?.sessionId);
      res.status(204).end();
    });
    app.post('/__control/rate-limit-next', (req, res) => {
      this.rateLimitNext(Number(req.body?.count ?? 1));
      res.status(204).end();
    });
    app.post('/__control/advance', (req, res) => {
      this.advance(Number(req.body?.ms ?? 0));
      res.status(204).end();
    });
  }

  private async verified(req: Request): Promise<void> {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      this.key ??= await importSPKI(this.options.publicKeyPem, 'RS256');
      const { protectedHeader } = await jwtVerify(token, this.key, {
        algorithms: ['RS256'],
        issuer: 'enablebanking.com',
        audience: 'api.enablebanking.com',
        currentDate: this.options.clock.now(),
      });
      if (protectedHeader.kid !== this.options.appId) throw new Error('kid');
    } catch {
      throw new FakeApiError(401, 'UNAUTHORIZED');
    }
  }

  private auth(req: Request, res: Response): void {
    const body = (req.body ?? {}) as AuthBody;
    if (!this.options.registeredRedirects.includes(String(body.redirect_url))) {
      throw new FakeApiError(400, 'REDIRECT_URI_NOT_ALLOWED');
    }
    const banks = this.options.banks ?? [
      { name: 'Revolut', country: 'ES' },
      { name: 'Mock ASPSP', country: 'ES' },
      { name: 'Banco Ficticio', country: 'ES' },
    ];
    if (
      !banks.some(
        b => b.name === body.aspsp?.name && b.country === body.aspsp?.country
      )
    ) {
      throw new FakeApiError(400, 'WRONG_ASPSP_PROVIDED');
    }
    const validUntil = new Date(String(body.access?.valid_until));
    const limit = this.now().getTime() + 180 * 86_400_000;
    if (
      typeof body.state !== 'string' ||
      Number.isNaN(validUntil.getTime()) ||
      validUntil.getTime() > limit
    ) {
      throw new FakeApiError(422, 'WRONG_REQUEST_PARAMETERS');
    }
    const id = randomUUID();
    this.consents.set(id, {
      redirectUrl: String(body.redirect_url),
      state: body.state,
      validUntil,
    });
    res.json({ url: `${this.baseUrl()}/consent/${id}` });
  }

  private consentPage(req: Request, res: Response): void {
    const consent = this.consents.get(String(req.params.id));
    if (consent === undefined) {
      res.status(404).send('Consentimiento desconocido');
      return;
    }
    const target = new URL(consent.redirectUrl);
    target.searchParams.set('state', consent.state);
    if (this.denials > 0) {
      this.denials--;
      target.searchParams.set('error', 'access_denied');
      target.searchParams.set('error_description', 'El usuario no aprobó');
    } else {
      const code = randomBytes(12).toString('base64url');
      this.codes.set(code, {
        consentId: String(req.params.id),
        issuedAt: this.now(),
        used: false,
      });
      target.searchParams.set('code', code);
    }
    res.redirect(302, target.toString());
  }

  private openSession(req: Request, res: Response): void {
    const issued = this.codes.get(String(req.body?.code));
    if (issued === undefined || issued.used) {
      throw new FakeApiError(400, 'WRONG_AUTHORIZATION_CODE');
    }
    issued.used = true;
    const age = this.now().getTime() - issued.issuedAt.getTime();
    if (age > FakeEnableBankingServer.CODE_SECONDS * 1000) {
      throw new FakeApiError(400, 'EXPIRED_AUTHORIZATION_CODE');
    }
    const consent = this.consents.get(issued.consentId)!;
    const sessionId = randomUUID();
    const uids = this.options.accounts.map(template => {
      const uid = randomUUID();
      this.accountOfUid.set(uid, { sessionId, template });
      return uid;
    });
    this.sessions.set(sessionId, {
      validUntil: consent.validUntil,
      status: 'AUTHORIZED',
      uids,
    });
    res.json({
      session_id: sessionId,
      accounts: this.options.accounts.map((template, index) => ({
        uid: uids[index],
        identification_hash: template.identification_hash,
      })),
    });
  }

  private sessionStatus(req: Request, res: Response): void {
    const session = this.sessions.get(String(req.params.id));
    if (session === undefined) throw new FakeApiError(404, 'SESSION_NOT_FOUND');
    res.json({
      status: session.status === 'REVOKED' ? 'AUTHORIZED' : session.status,
      valid_until: session.validUntil.toISOString(),
    });
  }

  private closeSession(req: Request, res: Response): void {
    const session = this.sessions.get(String(req.params.id));
    if (session === undefined) throw new FakeApiError(404, 'SESSION_NOT_FOUND');
    if (session.status === 'CLOSED') {
      throw new FakeApiError(401, 'CLOSED_SESSION');
    }
    session.status = 'CLOSED';
    res.status(200).json({});
  }

  private details(req: Request, res: Response): void {
    const { template } = this.accountOf(String(req.params.uid));
    res.json({
      currency: template.currency,
      cash_account_type: template.cash_account_type,
      usage: template.usage,
      account_id: template.account_id,
    });
  }

  private transactions(req: Request, res: Response): void {
    const { sessionId, template } = this.accountOf(String(req.params.uid));
    const session = this.sessions.get(sessionId)!;
    if (session.status === 'CLOSED') {
      throw new FakeApiError(401, 'CLOSED_SESSION');
    }
    if (session.status === 'REVOKED') {
      throw new FakeApiError(401, 'REVOKED_SESSION');
    }
    if (this.now().getTime() >= session.validUntil.getTime()) {
      throw new FakeApiError(401, 'EXPIRED_SESSION');
    }
    if (this.rateLimits > 0) {
      this.rateLimits--;
      throw new FakeApiError(429, 'ASPSP_RATE_LIMIT_EXCEEDED');
    }
    const dateFrom = this.dateFrom(req.query.date_from);
    const offset = this.offset(req.query.continuation_key);
    const own =
      template.identification_hash ===
      this.options.accounts[0].identification_hash
        ? this.matching(dateFrom)
        : [];
    const page = own.slice(offset, offset + FakeEnableBankingServer.PAGE_SIZE);
    const next = offset + page.length;
    res.json({
      transactions: page,
      ...(next < own.length
        ? { continuation_key: Buffer.from(`o:${next}`).toString('base64url') }
        : {}),
    });
  }

  private accountOf(uid: string) {
    const found = this.accountOfUid.get(uid);
    if (found === undefined) {
      throw new FakeApiError(404, 'ACCOUNT_DOES_NOT_EXIST');
    }
    return found;
  }

  private dateFrom(value: unknown): string {
    const text = typeof value === 'string' ? value : '';
    const date = new Date(`${text}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== text
    ) {
      throw new FakeApiError(422, 'WRONG_REQUEST_PARAMETERS');
    }
    if (text > this.now().toISOString().slice(0, 10)) {
      throw new FakeApiError(422, 'DATE_FROM_IN_FUTURE');
    }
    return text;
  }

  private offset(value: unknown): number {
    if (value === undefined) return 0;
    const match = /^o:(\d+)$/.exec(
      Buffer.from(String(value), 'base64url').toString()
    );
    if (match === null) throw new FakeApiError(422, 'WRONG_REQUEST_PARAMETERS');
    return Number(match[1]);
  }

  /** Newest first, from `dateFrom` inclusive. */
  private matching(dateFrom: string): RawEntry[] {
    return this.entries
      .filter(entry => String(entry.booking_date) >= dateFrom)
      .map((entry, index) => ({ entry, index }))
      .sort(
        (a, b) =>
          String(b.entry.booking_date).localeCompare(
            String(a.entry.booking_date)
          ) || a.index - b.index
      )
      .map(({ entry }) => entry);
  }
}
