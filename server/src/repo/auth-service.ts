import type Database from 'better-sqlite3';
import type { Clock } from '../domain/clock.js';
import { EffectiveRole } from '../domain/effective-role.js';
import type { LockoutPolicy } from '../domain/lockout-policy.js';
import type { PasswordHasher } from '../domain/password-hasher.js';
import type { TokenService } from '../domain/token-service.js';
import type { Role, View } from '../domain/types.js';
import { HttpError } from '../routes/http-error.js';
import type { AuthConfig } from './auth-config.js';
import type { PlayerRepository } from './player-repository.js';
import type { RefreshTokenRepository } from './refresh-token-repository.js';
import type { UserRecord, UserRepository } from './user-repository.js';

export interface SessionUser {
  username: string;
  role: Role;
  /** The effective role: what the web uses to choose a screen. */
  mode: Role;
  playerName: string | null;
  canSwitchView: boolean;
}

/** What a view switch answers: a new access token; the refresh cookie stays as it is. */
export type ViewSwitch = Omit<Session, 'refreshToken'>;

export interface Session {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: SessionUser;
}

const BAD_CREDENTIALS = 'Usuario o contraseña incorrectos.';
const NOT_AUTHORISED = 'No autorizado';

/** Logs in, keeps a session alive by rotating its refresh token, and ends it. */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly players: PlayerRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutPolicy,
    private readonly clock: Clock,
    private readonly config: AuthConfig,
    private readonly conn: Database.Database
  ) {}

  async login(rawUsername: string, password: string): Promise<Session> {
    const now = this.clock.now();
    const user = this.users.byUsername(rawUsername.trim().toLowerCase());
    if (!user || !user.active) {
      await this.hasher.burn(password);
      throw new HttpError(401, BAD_CREDENTIALS);
    }
    if (this.lockout.isLocked(user.lockedUntil, now)) {
      throw this.locked(user.lockedUntil!, now);
    }

    // Count the attempt before the slow check, so parallel guesses each use one up.
    const attempt = this.users.reserveAttempt(
      user.id,
      now,
      this.lockout.attemptsAfterExpiry()
    );
    if (this.lockout.exhausted(attempt.failedAttempts - 1)) {
      const until = attempt.lockedUntil ?? this.lockout.lockUntil(now);
      if (!attempt.lockedUntil) this.users.lockUntil(user.id, until);
      throw this.locked(until, now);
    }

    if (!(await this.hasher.verify(password, user.passwordHash))) {
      if (this.lockout.exhausted(attempt.failedAttempts)) {
        const until = this.lockout.lockUntil(now);
        this.users.lockUntil(user.id, until);
        throw this.locked(until, now);
      }
      throw new HttpError(401, BAD_CREDENTIALS);
    }

    this.users.recordSuccess(user.id, now);
    this.refreshTokens.purge(now);
    return this.issueSession(user, 'admin', now);
  }

  async refresh(token: string): Promise<Session> {
    const now = this.clock.now();
    const row = await this.liveRow(token, now);
    const user = this.users.byId(row.userId);
    if (!user || !user.active) throw new HttpError(401, NOT_AUTHORISED);

    return this.issueSession(user, row.view, now, row.id);
  }

  /**
   * An admin looks at the app as the player they are, or goes back. The choice is kept on the
   * session's refresh token, so a reload, a refresh and a rotation keep it and a new login starts
   * in the admin view.
   */
  async switchView(
    userId: number,
    view: View,
    token: string | undefined
  ): Promise<ViewSwitch> {
    const now = this.clock.now();
    const user = this.users.byId(userId);
    if (!user || !user.active) throw new HttpError(401, NOT_AUTHORISED);
    if (user.role !== 'admin') throw new HttpError(403, 'Prohibido');
    if (view === 'regular' && user.playerId === null) {
      throw new HttpError(403, 'No tienes un jugador asociado');
    }
    const row = await this.liveRow(token ?? '', now);
    if (row.userId !== user.id) throw new HttpError(401, NOT_AUTHORISED);

    this.refreshTokens.setView(row.id, view);
    return {
      accessToken: await this.tokens.issueAccess(
        { userId: user.id, role: user.role, view },
        now
      ),
      expiresIn: this.config.accessSeconds,
      user: this.sessionUser(user, view),
    };
  }

  /** Never throws: logging out twice, or with a token that is already dead, is fine. */
  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    try {
      const row = await this.liveRow(token, this.clock.now());
      this.refreshTokens.revokeIfLive(row.id);
    } catch {
      // nothing to end
    }
  }

  /** The user a session belongs to, as the web shows it. */
  sessionUser(user: UserRecord, view: View): SessionUser {
    return {
      username: user.username,
      role: user.role,
      mode: new EffectiveRole(user.role, view).value(),
      playerName:
        user.playerId === null
          ? null
          : (this.players.nameOf(user.playerId) ?? null),
      canSwitchView: user.role === 'admin' && user.playerId !== null,
    };
  }

  private async liveRow(token: string, now: Date) {
    try {
      await this.tokens.verifyRefresh(token, now);
    } catch {
      throw new HttpError(401, NOT_AUTHORISED);
    }
    const row = this.refreshTokens.findByHash(this.tokens.hashOf(token));
    if (!row || row.revoked || row.expiresAt.getTime() <= now.getTime()) {
      throw new HttpError(401, NOT_AUTHORISED);
    }
    return row;
  }

  /**
   * Signs the pair first (signing is asynchronous), then stores the new refresh token in one
   * step with the revocation of the one it replaces, so a token can be rotated only once.
   */
  private async issueSession(
    user: UserRecord,
    view: View,
    now: Date,
    replacing?: number
  ): Promise<Session> {
    const accessToken = await this.tokens.issueAccess(
      { userId: user.id, role: user.role, view },
      now
    );
    const refresh = await this.tokens.issueRefresh(user.id, now);
    this.conn
      .transaction(() => {
        if (
          replacing !== undefined &&
          !this.refreshTokens.revokeIfLive(replacing)
        ) {
          throw new HttpError(401, NOT_AUTHORISED);
        }
        this.refreshTokens.insert({
          userId: user.id,
          tokenHash: this.tokens.hashOf(refresh.token),
          view,
          expiresAt: refresh.expiresAt,
        });
      })
      .immediate();
    return {
      accessToken,
      expiresIn: this.config.accessSeconds,
      refreshToken: refresh.token,
      user: this.sessionUser(user, view),
    };
  }

  private locked(until: Date, now: Date): HttpError {
    const minutes = this.lockout.minutesLeft(until, now);
    return new HttpError(
      423,
      `Cuenta bloqueada. Inténtalo de nuevo en ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
      { lockedMinutes: minutes }
    );
  }
}
