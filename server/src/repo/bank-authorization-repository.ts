import type Database from 'better-sqlite3';

export type AuthorizationPurpose = 'connect' | 'renew';

/** A bank authorisation the organiser started: what is needed to recognise it when the bank answers. */
export interface PendingAuthorization {
  stateHash: string;
  bankId: string;
  purpose: AuthorizationPurpose;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

interface AuthorizationRow {
  state_hash: string;
  bank_id: string;
  purpose: AuthorizationPurpose;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

/** SQL only: the pending authorisations, found by the SHA-256 of their state. */
export class BankAuthorizationRepository {
  /** How long a used or expired row is kept, so a second use reads "used" and not "unknown". */
  static readonly KEEP_MS = 86_400_000;

  constructor(private readonly conn: Database.Database) {}

  create(pending: Omit<PendingAuthorization, 'usedAt'>): void {
    this.conn
      .prepare(
        `INSERT INTO bank_authorizations
           (state_hash, bank_id, purpose, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        pending.stateHash,
        pending.bankId,
        pending.purpose,
        pending.createdAt.toISOString(),
        pending.expiresAt.toISOString()
      );
  }

  findByHash(stateHash: string): PendingAuthorization | null {
    const row = this.conn
      .prepare('SELECT * FROM bank_authorizations WHERE state_hash = ?')
      .get(stateHash) as AuthorizationRow | undefined;
    return row === undefined ? null : this.toPending(row);
  }

  markUsed(stateHash: string, at: Date): void {
    this.conn
      .prepare(
        'UPDATE bank_authorizations SET used_at = ? WHERE state_hash = ?'
      )
      .run(at.toISOString(), stateHash);
  }

  /** Forgets what expired more than a day before `now`. */
  deleteStale(now: Date): void {
    const limit = new Date(now.getTime() - BankAuthorizationRepository.KEEP_MS);
    this.conn
      .prepare('DELETE FROM bank_authorizations WHERE expires_at < ?')
      .run(limit.toISOString());
  }

  private toPending(row: AuthorizationRow): PendingAuthorization {
    return {
      stateHash: row.state_hash,
      bankId: row.bank_id,
      purpose: row.purpose,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at === null ? null : new Date(row.used_at),
    };
  }
}
