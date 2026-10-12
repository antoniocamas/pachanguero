import { describe, expect, it } from 'vitest';
import { AuthConfig } from './auth-config.js';

const SECRET = 'x'.repeat(32);

describe('AuthConfig', () => {
  it('refuses to start without a secret', () => {
    expect(() => AuthConfig.fromEnv({})).toThrow('JWT_SECRET');
  });

  it('refuses a secret shorter than 32 characters', () => {
    expect(() => AuthConfig.fromEnv({ JWT_SECRET: 'x'.repeat(31) })).toThrow(
      'JWT_SECRET'
    );
    expect(() => AuthConfig.fromEnv({ JWT_SECRET: SECRET })).not.toThrow();
  });

  it('defaults to 30 minutes, 30 days and a cookie that is not secure outside production', () => {
    const config = AuthConfig.fromEnv({ JWT_SECRET: SECRET });
    expect(config.accessSeconds).toBe(1800);
    expect(config.refreshSeconds).toBe(30 * 86_400);
    expect(config.cookieSecure).toBe(false);
  });

  it('reads the lifetimes from the environment', () => {
    const config = AuthConfig.fromEnv({
      JWT_SECRET: SECRET,
      ACCESS_TOKEN_MINUTES: '5',
      REFRESH_TOKEN_DAYS: '7',
    });
    expect(config.accessSeconds).toBe(300);
    expect(config.refreshSeconds).toBe(7 * 86_400);
  });

  it.each([['0'], ['-3'], ['1.5'], ['soon']])(
    'refuses %j as a lifetime',
    value => {
      expect(() =>
        AuthConfig.fromEnv({ JWT_SECRET: SECRET, ACCESS_TOKEN_MINUTES: value })
      ).toThrow('ACCESS_TOKEN_MINUTES');
    }
  );

  it('makes the cookie secure in production unless told otherwise', () => {
    expect(
      AuthConfig.fromEnv({ JWT_SECRET: SECRET, NODE_ENV: 'production' })
        .cookieSecure
    ).toBe(true);
    expect(
      AuthConfig.fromEnv({
        JWT_SECRET: SECRET,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
      }).cookieSecure
    ).toBe(false);
    expect(
      AuthConfig.fromEnv({ JWT_SECRET: SECRET, COOKIE_SECURE: 'true' })
        .cookieSecure
    ).toBe(true);
  });
});
