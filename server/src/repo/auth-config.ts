export interface AuthSettings {
  jwtSecret: string;
  accessSeconds?: number;
  refreshSeconds?: number;
  cookieSecure?: boolean;
}

/** The settings that make sessions safe. Without a long enough secret the server must not start. */
export class AuthConfig {
  static readonly MIN_SECRET_LENGTH = 32;

  private constructor(
    readonly jwtSecret: string,
    readonly accessSeconds: number,
    readonly refreshSeconds: number,
    readonly cookieSecure: boolean
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv): AuthConfig {
    return AuthConfig.of({
      jwtSecret: env.JWT_SECRET ?? '',
      accessSeconds: AuthConfig.positive(
        'ACCESS_TOKEN_MINUTES',
        env.ACCESS_TOKEN_MINUTES,
        30,
        60
      ),
      refreshSeconds: AuthConfig.positive(
        'REFRESH_TOKEN_DAYS',
        env.REFRESH_TOKEN_DAYS,
        30,
        86_400
      ),
      cookieSecure:
        env.COOKIE_SECURE === undefined
          ? env.NODE_ENV === 'production'
          : env.COOKIE_SECURE === 'true',
    });
  }

  static of(settings: AuthSettings): AuthConfig {
    if (settings.jwtSecret.length < AuthConfig.MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET debe tener al menos ${AuthConfig.MIN_SECRET_LENGTH} caracteres`
      );
    }
    return new AuthConfig(
      settings.jwtSecret,
      settings.accessSeconds ?? 30 * 60,
      settings.refreshSeconds ?? 30 * 86_400,
      settings.cookieSecure ?? false
    );
  }

  secretBytes(): Uint8Array {
    return new TextEncoder().encode(this.jwtSecret);
  }

  private static positive(
    key: string,
    raw: string | undefined,
    fallback: number,
    secondsPerUnit: number
  ): number {
    if (raw === undefined || raw === '') return fallback * secondsPerUnit;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${key} debe ser un número entero positivo`);
    }
    return value * secondsPerUnit;
  }
}
