import type Database from 'better-sqlite3';
import type { PasswordHasher } from '../domain/password-hasher.js';
import type { PasswordPolicy } from '../domain/password-policy.js';
import type { RefreshTokenRepository } from './refresh-token-repository.js';
import type { UserRepository } from './user-repository.js';

/** A refusal to change the password; `rules` lists the policy rules the new one breaks. */
export class PasswordChangeError extends Error {
  constructor(
    message: string,
    readonly rules: string[] = []
  ) {
    super(message);
  }
}

/** Lets a signed-in user replace their password, ending every session they have. */
export class PasswordChangeService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly policy: PasswordPolicy,
    private readonly conn: Database.Database
  ) {}

  /** A wrong current password is refused without counting toward the lock-out. */
  async change(
    userId: number,
    current: string,
    next: string,
    confirm: string
  ): Promise<void> {
    const user = this.users.byId(userId);
    if (!user) throw new PasswordChangeError('Usuario no encontrado');
    if (!(await this.hasher.verify(current, user.passwordHash))) {
      throw new PasswordChangeError('La contraseña actual no es correcta');
    }
    if (next !== confirm) {
      throw new PasswordChangeError('Las contraseñas nuevas no coinciden');
    }
    const broken = this.policy.violations(next);
    if (broken.length) {
      throw new PasswordChangeError(
        'La contraseña nueva no es válida',
        broken.map(rule => this.policy.describe(rule))
      );
    }
    if (next === current) {
      throw new PasswordChangeError(
        'La contraseña nueva debe ser distinta de la actual'
      );
    }
    const hash = await this.hasher.hash(next);
    this.conn.transaction(() => {
      this.users.setPasswordHash(userId, hash);
      this.refreshTokens.revokeAllFor(userId);
    })();
  }
}
