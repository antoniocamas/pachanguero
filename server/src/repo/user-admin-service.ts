import type Database from 'better-sqlite3';
import type { Clock } from '../domain/clock.js';
import type { PasswordHasher } from '../domain/password-hasher.js';
import type { PasswordPolicy } from '../domain/password-policy.js';
import type { Role } from '../domain/types.js';
import type { UsernamePolicy } from '../domain/username-policy.js';
import type { PlayerRepository } from './player-repository.js';
import type { RefreshTokenRepository } from './refresh-token-repository.js';
import type { UserRecord, UserRepository } from './user-repository.js';

/** A refusal whose message is the Spanish sentence the operator reads. */
export class UserAdminError extends Error {}

export interface NewAccount {
  username: string;
  password: string;
  role: Role;
  /** A player's id, or their exact name. */
  player?: string;
}

export interface CreatedAccount {
  id: number;
  username: string;
  role: Role;
  playerId: number | null;
  playerName: string | null;
}

export interface AccountSummary {
  username: string;
  role: Role;
  playerName: string | null;
  active: boolean;
  locked: boolean;
}

/**
 * What the operator can do to accounts. Every rule lives here, once: the command line only
 * asks. Hashing is asynchronous so it is done before the transaction; every check and write
 * then runs in one synchronous transaction, so a refused command changes nothing.
 */
export class UserAdminService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly players: PlayerRepository,
    private readonly hasher: PasswordHasher,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly usernamePolicy: UsernamePolicy,
    private readonly clock: Clock,
    private readonly conn: Database.Database
  ) {}

  async create(account: NewAccount): Promise<CreatedAccount> {
    const username = this.usernamePolicy.normalise(account.username);
    if (!this.usernamePolicy.isValid(username)) {
      throw new UserAdminError(
        'El nombre de usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion y guion bajo'
      );
    }
    this.checkPassword(account.password);
    if (account.role === 'regular' && account.player === undefined) {
      throw new UserAdminError(
        'Un usuario normal necesita un jugador (--player)'
      );
    }
    const playerId =
      account.player === undefined ? null : this.resolvePlayer(account.player);
    const passwordHash = await this.hasher.hash(account.password);

    const created = this.write(() => {
      if (this.users.byUsername(username)) {
        throw new UserAdminError(`El usuario "${username}" ya existe`);
      }
      if (playerId !== null) {
        const existing = this.users.byPlayer(playerId);
        if (existing) {
          throw new UserAdminError(
            `${this.players.nameOf(playerId)} ya tiene el usuario "${existing.username}"`
          );
        }
      }
      return this.users.create({
        username,
        passwordHash,
        role: account.role,
        playerId,
      });
    });
    return {
      id: created.id,
      username,
      role: created.role,
      playerId,
      playerName:
        playerId === null ? null : (this.players.nameOf(playerId) ?? null),
    };
  }

  async resetPassword(rawUsername: string, password: string): Promise<void> {
    this.checkPassword(password);
    const passwordHash = await this.hasher.hash(password);
    this.write(() => {
      const user = this.existing(rawUsername);
      this.users.setPasswordHash(user.id, passwordHash);
      this.users.clearLock(user.id);
      this.refreshTokens.revokeAllFor(user.id);
    });
  }

  unlock(rawUsername: string): void {
    this.write(() => this.users.clearLock(this.existing(rawUsername).id));
  }

  deactivate(rawUsername: string): void {
    this.write(() => {
      const user = this.existing(rawUsername);
      this.refuseLastAdmin(user);
      this.users.setActive(user.id, false);
      this.refreshTokens.revokeAllFor(user.id);
    });
  }

  activate(rawUsername: string): void {
    this.write(() => this.users.setActive(this.existing(rawUsername).id, true));
  }

  promote(rawUsername: string): void {
    this.write(() =>
      this.users.setRole(this.existing(rawUsername).id, 'admin')
    );
  }

  demote(rawUsername: string): void {
    this.write(() => {
      const user = this.existing(rawUsername);
      if (user.playerId === null) {
        throw new UserAdminError(
          `"${user.username}" no tiene jugador: no se puede pasar a usuario normal`
        );
      }
      this.refuseLastAdmin(user);
      this.users.setRole(user.id, 'regular');
    });
  }

  list(): AccountSummary[] {
    const now = this.clock.now().getTime();
    return this.users.list().map(user => ({
      username: user.username,
      role: user.role,
      playerName:
        user.playerId === null
          ? null
          : (this.players.nameOf(user.playerId) ?? null),
      active: user.active,
      locked: user.lockedUntil !== null && user.lockedUntil.getTime() > now,
    }));
  }

  private checkPassword(password: string): void {
    const broken = this.passwordPolicy.violations(password);
    if (broken.length) {
      throw new UserAdminError(
        `La contraseña no es válida:\n${broken
          .map(rule => `  - ${this.passwordPolicy.describe(rule)}`)
          .join('\n')}`
      );
    }
  }

  private existing(rawUsername: string): UserRecord {
    const user = this.users.byUsername(
      this.usernamePolicy.normalise(rawUsername)
    );
    if (!user)
      throw new UserAdminError(`No existe el usuario "${rawUsername}"`);
    return user;
  }

  /** Never leave the app without someone who can run it. */
  private refuseLastAdmin(user: UserRecord): void {
    if (
      user.role === 'admin' &&
      user.active &&
      this.users.activeAdminCount() <= 1
    ) {
      throw new UserAdminError(
        'No se puede dejar la aplicación sin ningún administrador activo'
      );
    }
  }

  private resolvePlayer(spec: string): number {
    const text = spec.trim();
    if (/^\d+$/.test(text)) {
      const id = Number(text);
      if (this.players.nameOf(id) === undefined) {
        throw new UserAdminError(`No existe el jugador con id ${id}`);
      }
      return id;
    }
    const matches = this.players.findByName(text);
    if (matches.length === 0)
      throw new UserAdminError(`No existe el jugador "${text}"`);
    if (matches.length > 1) {
      throw new UserAdminError(
        `Hay varios jugadores llamados "${text}": ${matches
          .map(m => `${m.id} (${m.name})`)
          .join(', ')}. Usa el id con --player`
      );
    }
    return matches[0].id;
  }

  /** One transaction; a constraint that fires anyway (a concurrent writer) reads as a refusal. */
  private write<T>(work: () => T): T {
    try {
      return this.conn.transaction(work).immediate();
    } catch (error) {
      if ((error as { code?: string }).code?.startsWith('SQLITE_CONSTRAINT')) {
        throw new UserAdminError(
          'Otro cambio se cruzó con este: inténtalo de nuevo',
          {
            cause: error,
          }
        );
      }
      throw error;
    }
  }
}
