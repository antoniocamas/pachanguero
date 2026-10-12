import type Database from 'better-sqlite3';
import type { View } from '../domain/types.js';

export interface RefreshTokenRow {
  id: number;
  userId: number;
  tokenHash: string;
  view: View;
  expiresAt: Date;
  revoked: boolean;
}

interface Row {
  id: number;
  user_id: number;
  token_hash: string;
  view: View;
  expires_at: string;
  revoked: number;
}

export interface NewRefreshToken {
  userId: number;
  tokenHash: string;
  view: View;
  expiresAt: Date;
}

/** Stores the SHA-256 of each refresh token, never the token. */
export class RefreshTokenRepository {
  constructor(private readonly conn: Database.Database) {}

  insert(token: NewRefreshToken): void {
    this.conn
      .prepare(
        'INSERT INTO refresh_tokens (user_id, token_hash, view, expires_at) VALUES (?, ?, ?, ?)'
      )
      .run(
        token.userId,
        token.tokenHash,
        token.view,
        token.expiresAt.toISOString()
      );
  }

  findByHash(tokenHash: string): RefreshTokenRow | undefined {
    const row = this.conn
      .prepare(
        `SELECT id, user_id, token_hash, view, expires_at, revoked
           FROM refresh_tokens WHERE token_hash = ?`
      )
      .get(tokenHash) as Row | undefined;
    return row && this.toRow(row);
  }

  /** True when this call is the one that revoked it, so a token cannot be rotated twice. */
  revokeIfLive(id: number): boolean {
    return (
      this.conn
        .prepare(
          'UPDATE refresh_tokens SET revoked = 1 WHERE id = ? AND revoked = 0'
        )
        .run(id).changes === 1
    );
  }

  revokeAllFor(userId: number): number {
    return this.conn
      .prepare(
        'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0'
      )
      .run(userId).changes;
  }

  setView(id: number, view: View): void {
    this.conn
      .prepare('UPDATE refresh_tokens SET view = ? WHERE id = ?')
      .run(view, id);
  }

  /** Drops tokens that expired and revoked ones older than a day, so rotation cannot grow the table forever. */
  purge(now: Date): number {
    return this.conn
      .prepare(
        `DELETE FROM refresh_tokens
          WHERE expires_at <= @now
             OR (revoked = 1 AND created_at < datetime(@now, '-1 day'))`
      )
      .run({ now: now.toISOString() }).changes;
  }

  private toRow(row: Row): RefreshTokenRow {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      view: row.view,
      expiresAt: new Date(row.expires_at),
      revoked: row.revoked === 1,
    };
  }
}
