import type Database from 'better-sqlite3';
import type { MemberKey } from '../domain/types.js';
import { ShareKey } from '../domain/share-key.js';
import { ShareRowMember, type ShareRow } from './share-rows.js';

export interface DebtRow extends ShareRow {
  id: number;
}

/** An owed share with the names and game a debts report needs. */
export interface OutstandingShare {
  id: number;
  gameId: number;
  playedOn: string;
  gameLabel: string | null;
  holderId: number;
  holderName: string;
  /** The player the share is for; null for an anonymous plus-one. */
  beneficiaryId: number | null;
  beneficiaryName: string | null;
  guestOrdinal: number | null;
  amountCents: number;
}

/** Shares still owed. Rows are removed once settled, so reads stay small. */
export class DebtRepository {
  private readonly members = new ShareRowMember();

  constructor(private readonly conn: Database.Database) {}

  anyOutstanding(gameId: number): boolean {
    return (
      this.conn
        .prepare('SELECT 1 FROM share_debts WHERE game_id = ? LIMIT 1')
        .get(gameId) !== undefined
    );
  }

  list(gameId: number): DebtRow[] {
    return this.conn
      .prepare('SELECT * FROM share_debts WHERE game_id = ? ORDER BY id')
      .all(gameId) as DebtRow[];
  }

  find(gameId: number, member: MemberKey, holderId?: number): DebtRow | null {
    return (
      this.list(gameId).find(
        d =>
          this.sameMember(this.members.keyOf(d), member) &&
          (holderId === undefined || d.holder_player_id === holderId)
      ) ?? null
    );
  }

  keysOf(gameId: number): string[] {
    return this.list(gameId).map(d =>
      new ShareKey(this.members.keyOf(d)).toString()
    );
  }

  insert(
    gameId: number,
    member: MemberKey,
    holderId: number,
    amountCents: number
  ): void {
    const [beneficiary, ordinal] = this.members.columnsOf(member);
    this.conn
      .prepare(
        `INSERT INTO share_debts
           (game_id, holder_player_id, beneficiary_player_id, guest_ordinal, amount_cents)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(gameId, holderId, beneficiary, ordinal, amountCents);
  }

  /** Drop every debt of the game whose share is not among `keep`. */
  deleteNotIn(gameId: number, keep: ReadonlySet<string>): void {
    for (const d of this.list(gameId))
      if (!keep.has(new ShareKey(this.members.keyOf(d)).toString()))
        this.delete(d.id);
  }

  delete(debtId: number): void {
    this.conn.prepare('DELETE FROM share_debts WHERE id = ?').run(debtId);
  }

  /** Every share still owed, oldest game first. */
  outstanding(): OutstandingShare[] {
    return this.conn
      .prepare(
        `SELECT d.id, d.game_id AS gameId, g.played_on AS playedOn,
                g.label AS gameLabel, d.holder_player_id AS holderId,
                h.name AS holderName, d.beneficiary_player_id AS beneficiaryId,
                b.name AS beneficiaryName, d.guest_ordinal AS guestOrdinal,
                d.amount_cents AS amountCents
           FROM share_debts d
           JOIN games g   ON g.id = d.game_id
           JOIN players h ON h.id = d.holder_player_id
           LEFT JOIN players b ON b.id = d.beneficiary_player_id
          ORDER BY g.played_on, g.id, d.id`
      )
      .all() as OutstandingShare[];
  }

  /** What each holder owes across the played games of a season. */
  totalsByHolder(seasonId: number): Map<number, number> {
    const rows = this.conn
      .prepare(
        `SELECT d.holder_player_id AS holder, SUM(d.amount_cents) AS total
           FROM share_debts d JOIN games g ON g.id = d.game_id
          WHERE g.season_id = ? AND g.status = 'played'
          GROUP BY d.holder_player_id`
      )
      .all(seasonId) as Array<{ holder: number; total: number }>;
    return new Map(rows.map(r => [r.holder, r.total]));
  }

  private sameMember(a: MemberKey, b: MemberKey): boolean {
    return 'playerId' in a
      ? 'playerId' in b && a.playerId === b.playerId
      : 'hostPlayerId' in b &&
          a.hostPlayerId === b.hostPlayerId &&
          a.ordinal === b.ordinal;
  }
}
