import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_BYTES = 64;
const SALT_BYTES = 16;
const MIB = 1024 * 1024;

/**
 * Passwords are stored as `scrypt$N$r$p$salt$key` (base64). The cost is read back from the
 * stored string when verifying, so raising it later does not invalidate existing hashes.
 */
export class PasswordHasher {
  private static readonly R = 8;
  private static readonly P = 1;

  constructor(private readonly cost = 2 ** 15) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await this.derive(
      password,
      salt,
      this.cost,
      PasswordHasher.R,
      PasswordHasher.P
    );
    return [
      'scrypt',
      this.cost,
      PasswordHasher.R,
      PasswordHasher.P,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$');
  }

  /** False for a wrong password and for any stored string that is not a hash of ours. */
  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [n, r, p] = parts.slice(1, 4).map(Number);
    if (![n, r, p].every(v => Number.isInteger(v) && v > 0)) return false;
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    if (salt.length === 0 || expected.length !== KEY_BYTES) return false;
    try {
      const actual = await this.derive(password, salt, n, r, p);
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  /** Spends the time of a hash at this cost, so an unknown username takes as long as a known one. */
  async burn(password: string): Promise<void> {
    await this.derive(
      password,
      Buffer.alloc(SALT_BYTES),
      this.cost,
      PasswordHasher.R,
      PasswordHasher.P
    );
  }

  private derive(
    password: string,
    salt: Buffer,
    n: number,
    r: number,
    p: number
  ): Promise<Buffer> {
    const maxmem = Math.max(64 * MIB, 256 * n * r);
    return new Promise((resolve, reject) => {
      scrypt(password, salt, KEY_BYTES, { N: n, r, p, maxmem }, (error, key) =>
        error ? reject(error) : resolve(key)
      );
    });
  }
}
