import type Database from 'better-sqlite3';
import type { Role } from '../domain/types.js';

export interface UserRecord {
  id: number;
  username: string;
  passwordHash: string;
  role: Role;
  playerId: number | null;
  active: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLogin: Date | null;
}

export interface NewUser {
  username: string;
  passwordHash: string;
  role: Role;
  playerId: number | null;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  player_id: number | null;
  active: number;
  failed_attempts: number;
  locked_until: string | null;
  last_login: string | null;
}

const COLUMNS = `id, username, password_hash, role, player_id, active,
                 failed_attempts, locked_until, last_login`;

/** SQL only: the rules that combine these calls live in the services. */
export class UserRepository {
  constructor(private readonly conn: Database.Database) {}

  create(user: NewUser): UserRecord {
    const info = this.conn
      .prepare(
        'INSERT INTO users (username, password_hash, role, player_id) VALUES (?, ?, ?, ?)'
      )
      .run(user.username, user.passwordHash, user.role, user.playerId);
    return this.byId(Number(info.lastInsertRowid))!;
  }

  byId(id: number): UserRecord | undefined {
    return this.one(`SELECT ${COLUMNS} FROM users WHERE id = ?`, id);
  }

  /** Expects a normalised username. */
  byUsername(username: string): UserRecord | undefined {
    return this.one(
      `SELECT ${COLUMNS} FROM users WHERE username = ?`,
      username
    );
  }

  byPlayer(playerId: number): UserRecord | undefined {
    return this.one(
      `SELECT ${COLUMNS} FROM users WHERE player_id = ?`,
      playerId
    );
  }

  list(): UserRecord[] {
    const rows = this.conn
      .prepare(`SELECT ${COLUMNS} FROM users ORDER BY username`)
      .all() as UserRow[];
    return rows.map(row => this.toRecord(row));
  }

  /**
   * Counts one more failed attempt in a single statement, so parallel guesses cannot all
   * read the same count. A lock that has expired is cleared first and the count restarts at
   * `countAfterExpiredLock`.
   */
  reserveAttempt(
    id: number,
    now: Date,
    countAfterExpiredLock: number
  ): { failedAttempts: number; lockedUntil: Date | null } {
    const row = this.conn
      .prepare(
        `UPDATE users SET
           failed_attempts = CASE WHEN locked_until IS NOT NULL AND locked_until <= @now
                                  THEN @after + 1 ELSE failed_attempts + 1 END,
           locked_until    = CASE WHEN locked_until IS NOT NULL AND locked_until <= @now
                                  THEN NULL ELSE locked_until END
         WHERE id = @id
         RETURNING failed_attempts, locked_until`
      )
      .get({ id, now: now.toISOString(), after: countAfterExpiredLock }) as {
      failed_attempts: number;
      locked_until: string | null;
    };
    return {
      failedAttempts: row.failed_attempts,
      lockedUntil: this.parseLock(row.locked_until),
    };
  }

  lockUntil(id: number, until: Date): void {
    this.conn
      .prepare('UPDATE users SET locked_until = ? WHERE id = ?')
      .run(until.toISOString(), id);
  }

  recordSuccess(id: number, at: Date): void {
    this.conn
      .prepare(
        `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ?
          WHERE id = ?`
      )
      .run(at.toISOString(), id);
  }

  clearLock(id: number): void {
    this.conn
      .prepare(
        'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?'
      )
      .run(id);
  }

  setPasswordHash(id: number, passwordHash: string): void {
    this.conn
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(passwordHash, id);
  }

  setActive(id: number, active: boolean): void {
    this.conn
      .prepare('UPDATE users SET active = ? WHERE id = ?')
      .run(active ? 1 : 0, id);
  }

  setRole(id: number, role: Role): void {
    this.conn.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  }

  setPlayer(id: number, playerId: number): void {
    this.conn
      .prepare('UPDATE users SET player_id = ? WHERE id = ?')
      .run(playerId, id);
  }

  /** Points the account of an absorbed player at the player that took their place. */
  movePlayer(fromPlayerId: number, intoPlayerId: number): void {
    this.conn
      .prepare('UPDATE users SET player_id = ? WHERE player_id = ?')
      .run(intoPlayerId, fromPlayerId);
  }

  activeAdminCount(): number {
    const row = this.conn
      .prepare(
        "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1"
      )
      .get() as { n: number };
    return row.n;
  }

  private one(sql: string, ...params: unknown[]): UserRecord | undefined {
    const row = this.conn.prepare(sql).get(...params) as UserRow | undefined;
    return row ? this.toRecord(row) : undefined;
  }

  private toRecord(row: UserRow): UserRecord {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      playerId: row.player_id,
      active: row.active === 1,
      failedAttempts: row.failed_attempts,
      lockedUntil: this.parseLock(row.locked_until),
      lastLogin: row.last_login === null ? null : new Date(row.last_login),
    };
  }

  /** A lock that cannot be read is treated as locked for good: failing closed. */
  private parseLock(text: string | null): Date | null {
    if (text === null) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? new Date(8.64e15) : date;
  }
}
