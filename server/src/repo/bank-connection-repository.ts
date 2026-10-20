import type Database from 'better-sqlite3';
import type { AccountChoice } from '../bizum/ports.js';

export type ConnectionState = 'connected' | 'reconnect_needed';

/** The one bank access as stored. */
export interface StoredConnection {
  bankId: string;
  sessionId: string;
  validUntil: Date;
  state: ConnectionState;
  /** The bank's error code, or EXPIRED, once reconnecting is needed. */
  reason: string | null;
  connectedAt: Date;
  accounts: AccountChoice[];
  /** Whether the first, deep read of this session has been done. */
  deepReadDone: boolean;
}

interface ConnectionRow {
  bank_id: string;
  session_id: string;
  valid_until: string;
  state: ConnectionState;
  reason: string | null;
  connected_at: string;
  accounts_json: string;
  deep_read_done: number;
}

/** SQL only: at most one row, replaced whole by a renewal. */
export class BankConnectionRepository {
  private static readonly ACCOUNT_FIELDS = [
    'stableId',
    'sessionId',
    'currency',
    'kind',
    'last4',
  ] as const;

  constructor(private readonly conn: Database.Database) {}

  /** The stored access, or null; a row that does not read back is treated as none. */
  get(): StoredConnection | null {
    const row = this.conn
      .prepare('SELECT * FROM bank_connection WHERE id = 1')
      .get() as ConnectionRow | undefined;
    if (row === undefined) return null;
    const accounts = this.accountsOf(row.accounts_json);
    if (accounts === null) {
      console.error('bank connection unreadable: accounts_json');
      return null;
    }
    return {
      bankId: row.bank_id,
      sessionId: row.session_id,
      validUntil: new Date(row.valid_until),
      state: row.state,
      reason: row.reason,
      connectedAt: new Date(row.connected_at),
      accounts,
      deepReadDone: row.deep_read_done === 1,
    };
  }

  /** Stores a new session, replacing what was there; its deep read is still to do. */
  save(
    connection: Omit<StoredConnection, 'state' | 'reason' | 'deepReadDone'>
  ): void {
    this.conn
      .prepare(
        `INSERT OR REPLACE INTO bank_connection
           (id, bank_id, session_id, valid_until, state, reason, connected_at, accounts_json, deep_read_done)
         VALUES (1, ?, ?, ?, 'connected', NULL, ?, ?, 0)`
      )
      .run(
        connection.bankId,
        connection.sessionId,
        connection.validUntil.toISOString(),
        connection.connectedAt.toISOString(),
        JSON.stringify(connection.accounts)
      );
  }

  markReconnectNeeded(reason: string): void {
    this.conn
      .prepare(
        `UPDATE bank_connection SET state = 'reconnect_needed', reason = ? WHERE id = 1`
      )
      .run(reason);
  }

  markDeepReadDone(): void {
    this.conn
      .prepare('UPDATE bank_connection SET deep_read_done = 1 WHERE id = 1')
      .run();
  }

  delete(): void {
    this.conn.prepare('DELETE FROM bank_connection WHERE id = 1').run();
  }

  private accountsOf(json: string): AccountChoice[] | null {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) return null;
      const complete = parsed.every(
        entry =>
          typeof entry === 'object' &&
          entry !== null &&
          BankConnectionRepository.ACCOUNT_FIELDS.every(
            field =>
              typeof (entry as Record<string, unknown>)[field] === 'string'
          )
      );
      return complete ? (parsed as AccountChoice[]) : null;
    } catch {
      return null;
    }
  }
}
