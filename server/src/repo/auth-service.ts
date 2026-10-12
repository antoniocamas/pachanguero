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
import type { ViewAsLogRepository } from './view-as-log-repository.js';
import type { UserRecord, UserRepository } from './user-repository.js';

export interface SessionUser {
  username: string;
  role: Role;
  /** The effective role: what the web uses to choose a screen. */
  mode: Role;
  /** The player the app is shown for: the user's own, or the one an admin is looking at it as. */
  playerName: string | null;
  canSwitchView: boolean;
  /** The name of the player an admin is looking at the app as, when not their own. */
  viewingAs: string | null;
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
    private readonly conn: Database.Database,
    private readonly viewLog: ViewAsLogRepository
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

    return this.issueSession(user, row.view, now, row.id, row.actingAs);
  }

  /**
   * An admin looks at the app as a player, or goes back to the admin view. With no `playerId`
   * the player is the admin's own; with one it is that player, who may have no account at all.
   * The choice is kept on the session's refresh token, so a reload, a refresh and a rotation
   * keep it and a new login starts in the admin view. Looking at another player is logged.
   */
  async switchView(
    userId: number,
    view: View,
    token: string | undefined,
    playerId?: number
  ): Promise<ViewSwitch> {
    const now = this.clock.now();
    const user = this.users.byId(userId);
    if (!user || !user.active) throw new HttpError(401, NOT_AUTHORISED);
    if (user.role !== 'admin') throw new HttpError(403, 'Prohibido');
    const actingAs = this.otherPlayer(user, view, playerId);
    const row = await this.liveRow(token ?? '', now);
    if (row.userId !== user.id) throw new HttpError(401, NOT_AUTHORISED);

    this.conn
      .transaction(() => {
        this.refreshTokens.setView(row.id, view, actingAs);
        if (actingAs !== null) {
          this.viewLog.record(
            user.id,
            actingAs,
            this.players.nameOf(actingAs) ?? '',
            now
          );
        }
      })
      .immediate();
    return {
      accessToken: await this.tokens.issueAccess(
        { userId: user.id, role: user.role, view, actingAs },
        now
      ),
      expiresIn: this.config.accessSeconds,
      user: this.sessionUser(user, view, actingAs),
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
  sessionUser(
    user: UserRecord,
    view: View,
    actingAs: number | null = null
  ): SessionUser {
    const viewingAs =
      actingAs === null ? null : (this.players.nameOf(actingAs) ?? null);
    return {
      username: user.username,
      role: user.role,
      mode: new EffectiveRole(user.role, view).value(),
      playerName:
        viewingAs ??
        (user.playerId === null
          ? null
          : (this.players.nameOf(user.playerId) ?? null)),
      canSwitchView: user.role === 'admin' && user.playerId !== null,
      viewingAs,
    };
  }

  /** The other player an admin asks to look at the app as, checked; null for their own view. */
  private otherPlayer(
    user: UserRecord,
    view: View,
    playerId: number | undefined
  ): number | null {
    if (view === 'admin') return null;
    if (playerId === undefined || playerId === user.playerId) {
      if (user.playerId === null) {
        throw new HttpError(403, 'No tienes un jugador asociado');
      }
      return null;
    }
    if (this.players.nameOf(playerId) === undefined) {
      throw new HttpError(404, 'No existe el jugador');
    }
    return playerId;
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
    replacing?: number,
    actingAs: number | null = null
  ): Promise<Session> {
    const accessToken = await this.tokens.issueAccess(
      { userId: user.id, role: user.role, view, actingAs },
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
          actingAs,
          expiresAt: refresh.expiresAt,
        });
      })
      .immediate();
    return {
      accessToken,
      expiresIn: this.config.accessSeconds,
      refreshToken: refresh.token,
      user: this.sessionUser(user, view, actingAs),
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
