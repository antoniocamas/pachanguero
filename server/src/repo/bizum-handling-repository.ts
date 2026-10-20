import type Database from 'better-sqlite3';
import type { SenderIdentity, WaitReason } from '../domain/bizum-rules.js';

export type SettledHow = 'automatic' | 'organiser';

/** What was decided about one kept Bizum. */
export interface BizumHandling {
  bizumId: number;
  status: 'waiting' | 'settled';
  /** Why it waits; null once settled. */
  reason: WaitReason | null;
  sender: SenderIdentity | null;
  unallocatedCents: number;
  settledHow: SettledHow | null;
  updatedAt: Date;
}

interface HandlingRow {
  bizum_id: number;
  status: 'waiting' | 'settled';
  reason_json: string | null;
  unallocated_cents: number;
  settled_how: SettledHow | null;
  updated_at: string;
}

/** SQL only: the one row per kept Bizum saying whether it waits or is settled. */
export class BizumHandlingRepository {
  private static readonly CODES = [
    'not_enough_debts',
    'include_word',
    'sender_unknown',
    'sender_ambiguous',
    'no_season',
    'kept',
    'undone',
    'amounts_differ',
  ];

  constructor(private readonly conn: Database.Database) {}

  get(bizumId: number): BizumHandling | null {
    const row = this.conn
      .prepare('SELECT * FROM bizum_handling WHERE bizum_id = ?')
      .get(bizumId) as HandlingRow | undefined;
    return row === undefined ? null : this.handling(row);
  }

  /** Every waiting Bizum, oldest decision first. */
  waiting(): BizumHandling[] {
    return (
      this.conn
        .prepare(
          `SELECT * FROM bizum_handling WHERE status = 'waiting' ORDER BY updated_at, bizum_id`
        )
        .all() as HandlingRow[]
    ).map(row => this.handling(row));
  }

  /** Every waiting Bizum, oldest booking first. */
  waitingByBooking(): BizumHandling[] {
    return this.waitingRows('', {});
  }

  /** The waiting Bizums booked in a season on or after a date, oldest booking first. */
  waitingInSeasonFrom(seasonId: number, fromDate: string): BizumHandling[] {
    return this.waitingRows(
      `JOIN seasons s ON s.id = @seasonId
        AND b.booked_on BETWEEN s.starts_on AND s.ends_on
        AND b.booked_on >= @fromDate`,
      { seasonId, fromDate }
    );
  }

  markWaiting(
    bizumId: number,
    reason: WaitReason,
    sender: SenderIdentity,
    at: Date
  ): void {
    this.conn
      .prepare(
        `INSERT OR REPLACE INTO bizum_handling
           (bizum_id, status, reason_json, unallocated_cents, settled_how, updated_at)
         VALUES (?, 'waiting', ?, 0, NULL, ?)`
      )
      .run(bizumId, JSON.stringify({ reason, sender }), at.toISOString());
  }

  markSettled(
    bizumId: number,
    how: SettledHow,
    unallocatedCents: number,
    at: Date
  ): void {
    this.conn
      .prepare(
        `INSERT OR REPLACE INTO bizum_handling
           (bizum_id, status, reason_json, unallocated_cents, settled_how, updated_at)
         VALUES (?, 'settled', NULL, ?, ?, ?)`
      )
      .run(bizumId, unallocatedCents, how, at.toISOString());
  }

  /** Every settled Bizum, newest booking first. */
  settledByBooking(): BizumHandling[] {
    return (
      this.conn
        .prepare(
          `SELECT h.* FROM bizum_handling h JOIN bizums b ON b.id = h.bizum_id
            WHERE h.status = 'settled' ORDER BY b.booked_on DESC, b.reference DESC, h.bizum_id DESC`
        )
        .all() as HandlingRow[]
    ).map(row => this.handling(row));
  }

  private waitingRows(
    join: string,
    params: Record<string, string | number>
  ): BizumHandling[] {
    return (
      this.conn
        .prepare(
          `SELECT h.* FROM bizum_handling h JOIN bizums b ON b.id = h.bizum_id ${join}
            WHERE h.status = 'waiting' ORDER BY b.booked_on, b.reference, h.bizum_id`
        )
        .all(params) as HandlingRow[]
    ).map(row => this.handling(row));
  }

  private handling(row: HandlingRow): BizumHandling {
    const parsed = this.parse(row.reason_json);
    return {
      bizumId: row.bizum_id,
      status: row.status,
      reason: parsed?.reason ?? null,
      sender: parsed?.sender ?? null,
      unallocatedCents: row.unallocated_cents,
      settledHow: row.settled_how,
      updatedAt: new Date(row.updated_at),
    };
  }

  /** A reason with a code nobody knows reads as `kept`, never as an error. */
  private parse(
    json: string | null
  ): { reason: WaitReason; sender: SenderIdentity } | null {
    if (json === null) return null;
    const stored = JSON.parse(json) as {
      reason: WaitReason;
      sender: SenderIdentity;
    };
    const known = BizumHandlingRepository.CODES.includes(stored.reason.code);
    return known ? stored : { reason: { code: 'kept' }, sender: stored.sender };
  }
}
