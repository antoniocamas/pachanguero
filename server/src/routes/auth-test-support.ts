import type Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManualClock } from '../domain/clock-test-support.js';
import { PasswordHasher } from '../domain/password-hasher.js';
import type { Role, View } from '../domain/types.js';
import type { ApiRoutes } from './api-routes.js';
import type { BankSettings, ServerApp } from '../server-app.js';
import type { UserRecord } from '../repo/user-repository.js';

/** A hasher that counts how many passwords were actually checked. */
export class CountingHasher extends PasswordHasher {
  verifyCalls = 0;

  override verify(password: string, stored: string): Promise<boolean> {
    this.verifyCalls++;
    return super.verify(password, stored);
  }
}

/** The JSON fields the API answers with, all optional: a test reads the ones it expects. */
export interface ReplyBody {
  error?: string;
  lockedMinutes?: number;
  accessToken?: string;
  expiresIn?: number;
  user?: {
    username: string;
    role: Role;
    mode: Role;
    playerName: string | null;
    canSwitchView: boolean;
  };
}

export interface ApiReply {
  status: number;
  body: ReplyBody;
  headers: Headers;
  setCookies: string[];
}

export interface ApiRequest {
  method?: string;
  token?: string;
  cookie?: string;
  body?: unknown;
  /** `manual` answers a redirect as it is, instead of following it. */
  redirect?: 'manual';
}

/**
 * The real server on a throwaway database and a clock the test moves. Start it before
 * anything imports the composition root: the database path is read at that import.
 */
export class AuthTestApp {
  static readonly PASSWORD = 'Gol-del-Miercoles7';

  private constructor(
    readonly clock: ManualClock,
    readonly hasher: CountingHasher,
    readonly server: ServerApp,
    private readonly http: Server,
    readonly base: string,
    private readonly dir: string,
    private readonly repo: typeof import('../repo/index.js'),
    readonly conn: Database.Database
  ) {}

  static async start(
    options: {
      webDist?: string | null;
      /** Builds the bank settings from the clock the app will run on. */
      bank?: (clock: ManualClock) => BankSettings;
    } = {}
  ): Promise<AuthTestApp> {
    const dir = mkdtempSync(join(tmpdir(), 'pachanguero-auth-'));
    process.env.PACHANGUERO_DB = join(dir, 'test.db');
    const repo = await import('../repo/index.js');
    const { db } = await import('../db/index.js');
    const { ServerApp } = await import('../server-app.js');
    const { AuthConfig } = await import('../repo/auth-config.js');
    const clock = new ManualClock(new Date('2026-10-11T10:00:00.000Z'));
    const hasher = new CountingHasher(2 ** 10);
    const config = AuthConfig.of({
      jwtSecret: 'test-secret-that-is-long-enough-0123456789',
    });
    const server = new ServerApp(
      config,
      clock,
      hasher,
      options.webDist ?? null,
      options.bank?.(clock)
    );
    const http = await new Promise<Server>(resolve => {
      const listening = server
        .build()
        .listen(0, '127.0.0.1', () => resolve(listening));
    });
    const { port } = http.address() as { port: number };
    return new AuthTestApp(
      clock,
      hasher,
      server,
      http,
      `http://127.0.0.1:${port}`,
      dir,
      repo,
      db()
    );
  }

  get routes(): ApiRoutes {
    return this.server.routes;
  }

  /** Creates a user (and the player, for a regular one or when a name is given). */
  async createUser(
    username: string,
    role: Role,
    playerName?: string,
    password = AuthTestApp.PASSWORD
  ): Promise<UserRecord> {
    const { players, users } = this.repo;
    let playerId: number | null = null;
    if (playerName !== undefined) {
      const existing = players.listAll().find(p => p.name === playerName);
      playerId = existing?.id ?? players.register(playerName).id;
    }
    return users.create({
      username,
      passwordHash: await this.hasher.hash(password),
      role,
      playerId,
    });
  }

  async request(path: string, options: ApiRequest = {}): Promise<ApiReply> {
    const headers: Record<string, string> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.cookie) headers.cookie = options.cookie;
    if (options.body !== undefined)
      headers['content-type'] = 'application/json';
    const res = await fetch(`${this.base}${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: options.redirect,
    });
    const text = await res.text();
    return {
      status: res.status,
      body: this.parse(text),
      headers: res.headers,
      setCookies: res.headers.getSetCookie(),
    };
  }

  /** An empty answer is an empty body; text that is not JSON (a default 404 page) lands in `error`. */
  private parse(text: string): ReplyBody {
    if (!text) return {};
    try {
      return JSON.parse(text) as ReplyBody;
    } catch {
      return { error: text };
    }
  }

  login(username: string, password = AuthTestApp.PASSWORD): Promise<ApiReply> {
    return this.request('/api/auth/login', { body: { username, password } });
  }

  /** The `name=value` part of the refresh cookie a reply set, for sending back. */
  refreshCookieOf(reply: ApiReply): string {
    const cookie = reply.setCookies.find(c =>
      c.startsWith('pachanguero_refresh=')
    );
    return cookie!.split(';')[0];
  }

  /** An access token for a user as of now, without going through the login. */
  tokenFor(
    role: Role | { role: Role; view: View },
    userId = 1
  ): Promise<string> {
    const claims = typeof role === 'string' ? { role, view: role } : role;
    return this.server.tokens.issueAccess(
      { userId, ...claims },
      this.clock.now()
    );
  }

  advance(minutes: number): void {
    this.clock.advance(minutes * 60_000);
  }

  async close(): Promise<void> {
    await new Promise(resolve => this.http.close(resolve));
    rmSync(this.dir, { recursive: true, force: true });
  }
}
