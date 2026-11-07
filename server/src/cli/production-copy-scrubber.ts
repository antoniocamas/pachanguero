import type Database from 'better-sqlite3';
import type { PasswordHasher } from '../domain/password-hasher.js';
import { DevAccountSeeder } from './dev-account-seeder.js';

export interface ScrubOptions {
  /** Keep the bank connection, so the copy can still read the bank with this machine's settings. */
  keepBank: boolean;
}

export interface ScrubReport {
  users: number;
  sessions: number;
  bankConnection: boolean;
}

/**
 * Makes a copy of the production database safe to use on a developer's machine: no session
 * from production carries over, every account signs in with the made-up development password
 * (`DevAccountSeeder.PASSWORD`) and is unlocked, and unless asked to keep it, the bank
 * connection (its session id is a live credential) and pending bank authorizations are gone.
 * Everything else — players, games, debts, payments, Bizums — is left as it was.
 */
export class ProductionCopyScrubber {
  constructor(
    private readonly db: Database.Database,
    private readonly hasher: PasswordHasher
  ) {}

  async scrub(options: ScrubOptions): Promise<ScrubReport> {
    const hash = await this.hasher.hash(DevAccountSeeder.PASSWORD);
    return this.db.transaction(() => {
      const sessions = this.db
        .prepare('DELETE FROM refresh_tokens')
        .run().changes;
      const users = this.db
        .prepare(
          'UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL'
        )
        .run(hash).changes;
      let bankConnection = false;
      if (!options.keepBank) {
        this.db.prepare('DELETE FROM bank_authorizations').run();
        bankConnection =
          this.db.prepare('DELETE FROM bank_connection').run().changes > 0;
      }
      return { users, sessions, bankConnection };
    })();
  }
}
